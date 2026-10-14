(() => {
  'use strict';
  if(window.__twoChatRelayContentLoaded)return;
  window.__twoChatRelayContentLoaded=true;
  const ROLE='[data-message-author-role]';
  const ASSISTANT='[data-message-author-role="assistant"]';
  const USER='[data-message-author-role="user"]';
  const TEXTBOX=['#prompt-textarea','.ProseMirror[contenteditable="true"]',
    '[data-testid="composer-input"][contenteditable="true"]','div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-placeholder]','textarea[placeholder]'];
  const SEND=['button[data-testid="send-button"]','#composer-submit-button',
    'button[data-testid*="composer-send"]','button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]','button[aria-label*="发送"]'];
  const STOP=['button[data-testid="stop-button"]','button[data-testid="composer-stop-button"]',
    'form[data-chatgpt-composer] button[aria-label="Stop"]',
    'button[aria-label="Stop generating"]','button[aria-label="Stop streaming"]',
    'button[aria-label*="停止生成"]'];
  const $=selectors=>selectors.map(x=>document.querySelector(x)).find(Boolean)||null;
  const box=()=>$(TEXTBOX);
  const value=el=>el?(('value'in el)?el.value:(el.innerText||el.textContent||'')):'';
  const firstNonempty=selectors=>selectors.map(sel=>Array.from(document.querySelectorAll(sel))).find(arr=>arr.length>0)||[];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const shown=el=>Boolean(el && !el.hidden && !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length>0 && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden');
  let lastSignature='',lastChanged=Date.now(),timer=null,lastDelivered='',localId=null,observerMutations=0;
  if(location.protocol==='chrome-extension:')chrome.tabs.getCurrent().then(t=>{localId=t?.id??null;});
  function extract(el,role='assistant'){
    if(!el)return '';
    // New 2026 Chat/Work DOM uses search-unit keys and assistant-message blocks.
    // Read final-rendered assistant content, not the entire turn (which can include
    // thinking/tool/status text and controls). Preserve nested markdown once only.
    const selectors=role==='user'
      ? '[data-user-message-bubble="true"],.markdown,[data-testid="user-message-text"]'
      : '[data-markdown-text-style="assistant-message"],.markdown,.prose,[data-testid="answer-text"]';
    const blocks=Array.from(el.matches(selectors)?[el]:el.querySelectorAll(selectors));
    const roots=blocks.filter(e=>!blocks.some(p=>p!==e&&p.contains(e)));
    // Rich user bubbles may include controls (expand/copy/edit, tooltip text).
    // innerText of the whole container can include these UI labels, especially
    // for long messages. Extract clean TEXT descendants, not attached chrome.
    const cleaned=e=>{
      const c=e.cloneNode(true);
      // KaTeX often contains both visual characters and a MathML copy. A raw
      // textContent traversal can duplicate math or break it into many glyphs.
      // Convert known math renderers into their embedded TeX annotation first.
      c.querySelectorAll('.katex,mjx-container').forEach(math=>{
        const tex=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent
          || math.querySelector('math[alttext]')?.getAttribute('alttext');
        if(tex){math.replaceWith(document.createTextNode('\\('+tex+'\\)'));}
      });
      c.querySelectorAll('math').forEach(math=>{
        const tex=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent || math.getAttribute('alttext');
        if(tex)math.replaceWith(document.createTextNode('\\('+tex+'\\)'));
      });
      c.querySelectorAll('button,[role="button"],svg,[aria-hidden="true"],.sr-only,[data-testid*="turn-action"],[data-state="closed"][role="tooltip"]').forEach(x=>x.remove());
      return (c.textContent||'').trim();
    };
    if(roots.length)return roots.map(e=>role==='user'?cleaned(e):value(e)).join('\n\n').trim();
    return cleaned(el);
  }
  const visibleSend=()=>$(SEND);
  function turnModel(){
    const oldUsers=Array.from(document.querySelectorAll(USER));
    const oldAssistants=Array.from(document.querySelectorAll(ASSISTANT));
    if(oldUsers.length&&oldAssistants.length)
      return {mode:'legacy',users:oldUsers,assistants:oldAssistants};
    // First preference: the new renderer's role-bearing *units*; each is one
    // logical message. These attributes are present on accounts using Chat/Work UI.
    const unitUsers=Array.from(document.querySelectorAll('[data-content-search-unit-key$=":user"]'));
    const unitAssistants=Array.from(document.querySelectorAll('[data-content-search-unit-key$=":assistant"]'));
    if(unitUsers.length||unitAssistants.length)
      return {mode:'chat-work-units',users:unitUsers,assistants:unitAssistants};
    // Fallback is narrower than generic .markdown: it requires role-specific
    // markers so unrelated sidebar text cannot be mistaken for chat turns.
    const groupedUsers=firstNonempty([
      '[data-turn-key] [data-user-message-bubble="true"]',
      '[data-user-message-bubble="true"]',
    ]);
    const groupedAssistants=firstNonempty([
      '[data-turn-key] [data-conversation-role="assistant"]',
      '[data-conversation-role="assistant"]',
      '[data-turn-key] [data-markdown-text-style="assistant-message"]',
    ]);
    return {mode:(groupedUsers.length||groupedAssistants.length)?'chat-work-fallback':'unrecognized',
      users:groupedUsers,assistants:groupedAssistants};
  }
  function lastRole(model){
    const {users,assistants}=model;
    const u=users.at(-1),a=assistants.at(-1);
    if(!a)return false;
    if(!u)return true;
    // New renderer may nest both messages under the same [data-turn-key].
    // A later assistant unit must FOLLOW the latest user unit in DOM order.
    return Boolean(u.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING);
  }
  // Prefer stable per-message IDs over live DOM counts. New ChatGPT may virtualize
  // older turns, so the count can decrease while the conversation grows.
  function messageKey(el, role, mode){
    if(!el)return '';
    if(mode==='chat-work-units'){
      const key=el.getAttribute('data-content-search-unit-key');
      if(key)return `unit:${key}`;
    }
    const id=el.getAttribute('data-message-id') || el.querySelector('[data-message-id]')?.getAttribute('data-message-id');
    if(id)return `message:${id}`;
    const turn=el.closest('[data-turn-key]') || (el.matches('[data-turn-key]')?el:null);
    const turnKey=turn?.getAttribute('data-turn-key');
    if(turnKey)return `turn:${turnKey}:${role}`;
    return '';
  }
  function raw(){
    const model=turnModel(),{users,assistants}=model;
    const a=assistants.at(-1),u=users.at(-1),input=box();
    const stop=$(STOP);
    const busy=shown(stop)||Boolean(document.querySelector('[data-testid="loading-spinner"],[data-is-streaming="true"]'));
    // Copy action inside a legacy assistant node is a useful completion signal.
    // New layouts share toolbars with user turns: don't trust them as finality.
    const copyReady=model.mode==='legacy'&&Boolean(a?.querySelector('[data-testid="copy-turn-action-button"]'));
    return {ok:true,selectorMode:model.mode,
      assistantCount:assistants.length,userCount:users.length,
      lastUserKey:messageKey(u,'user',model.mode),
      lastAssistantKey:messageKey(a,'assistant',model.mode),
      lastSpeakerAssistant:lastRole(model),
      text:extract(a,'assistant'),userText:extract(u,'user'),busy,copyReady,
      composer:Boolean(input),composerHasText:Boolean(value(input).trim()),
      markers:{oldRoles:document.querySelectorAll(ROLE).length,
        newUnits:document.querySelectorAll('[data-content-search-unit-key]').length,
        turnKeys:document.querySelectorAll('[data-turn-key]').length,
        userBubbles:document.querySelectorAll('[data-user-message-bubble]').length,
        assistantContent:document.querySelectorAll('[data-markdown-text-style="assistant-message"]').length}};
  }
  function snapshot(){
    const s=raw();
    const sig=`${s.lastAssistantKey}|${s.lastUserKey}|${s.assistantCount}|${s.userCount}|${s.lastSpeakerAssistant}|${s.busy}|${s.copyReady}|${s.text}`;
    if(sig!==lastSignature){lastSignature=sig;lastChanged=Date.now();}
    // A short DOM silence is not proof of completion: reasoning/tool calls can pause.
    // When there is no copy-turn signal, require a much longer quiet period.
    const required=s.copyReady?2800:8000;
    return {...s,stable:!s.busy && Date.now()-lastChanged>=required,
      quietMs:Math.max(0,Date.now()-lastChanged),requiredQuietMs:required,
      observerMutations,completionMode:s.copyReady?'copy-action + quiet':'conservative quiet (no explicit signal)'};
  }
  async function notify(){
    const s=snapshot();
    if(!s.stable||!s.lastSpeakerAssistant||!s.text)return;
    const sig=`${s.lastUserKey}|${s.lastAssistantKey}|${s.userCount}|${s.assistantCount}|${s.text}`;
    if(sig===lastDelivered)return;
    try{const r=await chrome.runtime.sendMessage({type:'CANDIDATE',snapshot:s,sourceTabId:localId});
      if(r?.ok && r.data===true)lastDelivered=sig;
    }catch(_){/* watchdog checks later */}
  }
  function schedule(){
    // ChatGPT mutates page chrome continuously (animations, buttons, live regions).
    // Only restart the response debounce when the SEMANTIC reply signature changes.
    // Unrelated DOM changes must not postpone delivery forever.
    const oldSignature=lastSignature;
    const s=snapshot();
    observerMutations++;
    if(oldSignature===lastSignature && timer!==null)return;
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=null;notify();},s.copyReady?3200:8400);
  }
  // An operational guard against accidentally injecting megabytes of text, NOT
  // a model response-length preference. Long (10k-100k) messages are supported.
  const MAX_TRANSPORT_CHARS=200000;
  function expandUserBubble(){
    const model=turnModel(),last=model.users.at(-1);
    const host=last?.closest('[data-turn-key]')||last;
    if(!host)return false;
    const button=Array.from(host.querySelectorAll('button')).find(b=>{
      const txt=(b.innerText||b.textContent||'').trim();
      const label=(b.getAttribute('aria-label')||'').trim();
      return shown(b) && (/^(show more|see more|read more|expand|展开(全文|更多)?|显示更多)$/i.test(txt)
        ||/^(show more|expand message|展开全文)$/i.test(label));
    });
    if(!button)return false;
    button.click();return true;
  }
  async function send(text){
    if(typeof text!=='string'||!text)throw Error('待发文本为空。');
    if(text.length>MAX_TRANSPORT_CHARS)throw Error('单条消息超过 20 万字符技术防护阈值，已暂停，不会截断。');
    const before=raw();if(before.busy)throw Error('目标正在生成回复。');
    const input=box();if(!input)throw Error('无法定位输入框，网页可能已改版。');
    if(value(input).trim())throw Error('目标存在草稿，已拒绝覆盖。');
    input.focus();
    if(input.matches('textarea,input')){
      const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value')?.set;
      if(!setter)throw Error('无法写入 textarea。');
      setter.call(input,text);input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    }else{
      const range=document.createRange();range.selectNodeContents(input);
      const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      const worked=document.execCommand('insertText',false,text);
      if(!worked||!value(input).trim()){
        input.textContent=text;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
      }
    }
    if(!RelayCore.samePrompt(value(input),text))throw Error('输入框写入内容与目标不符，已中止。');
    let button=null;
    for(let i=0;i<16;i++){
      button=visibleSend();if(button&&shown(button)&&!button.disabled&&button.getAttribute('aria-disabled')!=='true')break;
      await sleep(250);
    }
    if(!button||!shown(button)||button.disabled||button.getAttribute('aria-disabled')==='true')
      throw Error('发送按钮不可用，可能是网页改版或后台页面被冻结。');
    button.click();
    // Confirm the new user turn by stable message ID + actual text. The number of
    // DOM nodes is NOT monotonic in ChatGPT: switching tabs can re-render old turns.
    // Never click twice on an ambiguous send, even after a timeout.
    let latest=before, evidence='pending', mismatchSince=0, mismatchKey='', expanded=false;
    const confirmMs=Math.min(45000,10000+Math.ceil(text.length/1000)*1200);
    const mismatchWaitMs=text.length>5000?4500:1250;
    for(let i=0;i<Math.ceil(confirmMs/250);i++){
      await sleep(250);
      latest=raw();
      evidence=RelayCore.deliveryEvidence(before,latest,text);
      if(evidence==='confirmed')return {ok:true,confirmation:RelayCore.samePrompt(latest.userText,text)?'exact-text':'rendered-markdown'};
      if(evidence==='mismatch'){
        if(!expanded && expandUserBubble()){expanded=true;mismatchSince=0;mismatchKey='';continue;}
        // React may briefly render stale/partial content while switching tabs.
        // Wait for a *stable* mismatch before pausing; never click Send again.
        const key=(latest.lastUserKey||'')+'|'+(latest.userText||'');
        if(key!==mismatchKey){mismatchKey=key;mismatchSince=Date.now();}
        if(Date.now()-mismatchSince>=mismatchWaitMs)
          throw Error(`新用户消息已出现但内容不匹配（预计 ${text.length} 字符，页面读取 ${latest.userText.length} 字符；${RelayCore.diffSummary(latest.userText,text)}）。安全暂停，不自动重发。`);
      }else{mismatchSince=0;mismatchKey='';}
    }
    const keyed=Boolean(before.lastUserKey && latest.lastUserKey);
    // No message text is included in errors, only diagnostic metadata.
    throw Error(`发送后无法确认新用户消息（标识=${keyed?(before.lastUserKey===latest.lastUserKey?'未改变':'已改变'):'缺失'}，用户计数=${before.userCount}→${latest.userCount}，输入框有文字=${latest.composerHasText}）。可能已发送；请先查看接收方，禁止自动重试。`);
  }
  chrome.runtime.onMessage.addListener((m,_sender,respond)=>{
    const demo=m?.type==='DEMO_REQUEST'&&localId!=null&&m.targetTabId===localId;
    if(m?.type==='DEMO_REQUEST'&&!demo)return false;
    const type=demo?m.command:m?.type;
    if(type==='SNAPSHOT'){respond(snapshot());return false;}
    if(type==='SEND_TEXT'){send(m.text).then(respond).catch(e=>respond({ok:false,error:String(e.message||e)}));return true;}
    return false;
  });
  function init(){
    if(!document.body){setTimeout(init,250);return;}
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
    schedule();setInterval(()=>{const s=snapshot();if(s.stable)notify();},5000);
  }
  init();
})();
