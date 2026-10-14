'use strict';
importScripts('relay_core.js');
const ALARM = 'relay-watchdog';
const STATE = 'relayState';
// A fixed, topic-neutral opener. It is only sent in autonomous mode and does
// not count toward the relay limit (which counts only A->B / B->A transfers).
const AUTONOMOUS_OPENER = '你即将与另一个 AI 进行自由交流。请自行决定话题，并直接说出你希望对方回应的第一段话；无需等待人类提供话题。';
// A compact, language-open seed. This still establishes the AI-to-AI setup,
// but prescribes neither the subject nor which language(s) to use.
const FREE_OPENER = 'You are about to exchange messages with another AI. Begin with whatever you wish to say, in any language or combination of languages you choose. No topic or direction has been assigned.';
const CONCISE_SUFFIX = ' Prefer natural brevity and focused responses when appropriate; you may write at length when needed. Do not restrict the subject or language.';
const TRANSPORT_GUARD = 200000;
const quotaLabel = state => state.limit===0?'∞':String(state.limit);
const mayContinue = (count, limit) => limit===0 || count<limit;
const DEFAULT = {running:false,aId:null,bId:null,waiting:'A',sent:0,limit:6,mode:'manual',lengthPolicy:'free',lengthCap:8000,
  baseline:{A:{assistant:0,user:0},B:{assistant:0,user:0}},processing:false,
  pendingAt:0,error:'',lastEvent:'尚未启动',runId:'',urls:{A:'',B:''}};
let queue = Promise.resolve();
function locked(fn){const run=queue.then(fn,fn);queue=run.catch(()=>{});return run;}
const read=async()=>(await chrome.storage.session.get(STATE))[STATE]||{...DEFAULT};
const save=async s=>chrome.storage.session.set({[STATE]:s});
const other=x=>x==='A'?'B':'A';
const err=e=>String(e?.message||e||'未知错误').slice(0,300);
const allowed=url=>typeof url==='string' && (url.startsWith('https://chatgpt.com/') || url.startsWith(chrome.runtime.getURL('demo.html')));
// Bind to a real conversation identity, not a URL query string or a tab title.
// A fresh chat page has no conversation identity until its first user turn is sent.
function conversationId(url){
  try {
    const u=new URL(url);
    if(u.protocol!=='https:'||u.hostname!=='chatgpt.com')return null;
    const m=/^\/c\/([a-zA-Z0-9-]+)\/?$/.exec(u.pathname);
    return m?.[1]||null;
  }catch(_){return null;}
}
const isDemo=url=>url?.startsWith(chrome.runtime.getURL('demo.html'));
function sameConversation(a,b){
  if(isDemo(a)||isDemo(b))return a===b;
  const x=conversationId(a),y=conversationId(b);
  return Boolean(x&&y&&x===y);
}
function requireEstablished(tab, side){
  if(isDemo(tab.url))return;
  if(!conversationId(tab.url))throw Error(`${side} 还是未建立的聊天页。请先在该标签页手动发送一条消息，确认网址变成 chatgpt.com/c/会话ID，再刷新标签页列表并开始监听。`);
}
async function info(id,expectedUrl){
  const tab=await chrome.tabs.get(id);
  if(!allowed(tab.url))throw Error('只能选择 chatgpt.com 或内置演示页。');
  if(tab.discarded||tab.frozen)throw Error('标签页已冻结或被释放，请恢复页面后重新启动。');
  if(expectedUrl && !sameConversation(expectedUrl,tab.url))throw Error('参与聊天的会话 ID 已改变，已暂停以免发送到错误会话。');
  return tab;
}
async function request(id,type,extra={},expectedUrl=''){
  const tab=await info(id,expectedUrl);
  if(tab.url.startsWith(chrome.runtime.getURL('demo.html'))){
    return chrome.runtime.sendMessage({type:'DEMO_REQUEST',targetTabId:id,command:type,...extra});
  }
  return chrome.tabs.sendMessage(id,{type,...extra});
}
async function snapshot(id,url){
  const s=await request(id,'SNAPSHOT',{},url);
  if(!s?.ok)throw Error(s?.error||'无法读取聊天网页。刷新网页后重试。');
  return s;
}
async function pause(message,runId){
  const state=await read();
  if(runId && state.runId!==runId)return state;
  const next={...state,running:false,processing:false,pendingAt:0,error:message,lastEvent:'安全暂停：'+message};
  await save(next); await chrome.alarms.clear(ALARM); return next;
}
async function start(msg){
  const existing=await read();
  if(existing.running)throw Error('已经在运行；请先点击停止。');
  const aId=Number(msg.aId),bId=Number(msg.bId),limit=Number(msg.limit);
  const mode=msg.mode===undefined?'manual':msg.mode;
  if(!['manual','autonomous','free'].includes(mode))throw Error('未知启动模式。');
  const lengthPolicy=msg.lengthPolicy||'free', lengthCap=Number(msg.lengthCap ?? 8000);
  if(!['free','concise','cap'].includes(lengthPolicy))throw Error('未知长度策略。');
  if(lengthPolicy==='concise' && mode==='manual')throw Error('自然简洁仅适用于 AI 自主或完全自由开场；人工开场不会自动插入提示。');
  if(lengthPolicy==='cap' && (!Number.isSafeInteger(lengthCap)||lengthCap<100||lengthCap>TRANSPORT_GUARD))throw Error('严格长度上限必须是 100–200000 字符的整数。');
  if(!Number.isInteger(aId)||!Number.isInteger(bId)||aId===bId)throw Error('请选择两个不同的标签页。');
  // 0 represents unlimited transfers; otherwise accept any safe positive integer.
  if(!Number.isSafeInteger(limit)||limit<0)throw Error('转发次数必须是非负整数：0 表示不限次数，1 以上表示具体转发次数。');
  const [at,bt]=await Promise.all([info(aId),info(bId)]);
  requireEstablished(at,'对话 A');
  requireEstablished(bt,'对话 B');
  const [a,b]=await Promise.all([snapshot(aId,at.url),snapshot(bId,bt.url)]);
  for(const [name,s] of [['A',a],['B',b]]){
    if(!s.composer)throw Error(`${name} 输入框不存在。`);
    if(!isDemo(name==='A'?at.url:bt.url) && (!s.userCount || !s.assistantCount))
      throw Error(`${name} 的消息未被识别（识别模式：${s.selectorMode||'未知'}，用户 ${s.userCount}，AI ${s.assistantCount}）。请先确认该对话已有一条完整来回消息；若仍失败请反馈诊断。`);
    if(s.busy)throw Error(`${name} 还在生成回答。`);
    if(s.composerHasText)throw Error(`${name} 输入框有未发送的草稿，请先清空。`);
  }
  const autonomous=mode==='autonomous'||mode==='free';
  // Capture the baseline BEFORE sending the opener; otherwise the opener's
  // user turn may be mistaken for history and A's first reply is never relayed.
  const state={running:true,aId,bId,waiting:'A',sent:0,limit,mode,lengthPolicy,lengthCap,
    baseline:{A:RelayCore.baselineOf(a),B:RelayCore.baselineOf(b)},
    processing:autonomous,pendingAt:autonomous?Date.now():0,error:'',
    lastEvent:autonomous?(mode==='free'?'正在向 A 发送自由开场（不限话题和语言）':'正在向 A 发送自主开场（不计入转发次数）'):'正在等待 A 发出新的用户消息并完成回复',
    urls:{A:at.url,B:bt.url},runId:crypto.randomUUID()};
  await save(state); await chrome.alarms.create(ALARM,{periodInMinutes:0.5});
  if(!autonomous)return state;
  try{
    // Use EXACTLY the same already-tested input, click and user-message
    // confirmation path as ordinary relay delivery. Never retry ambiguously.
    const opener=(mode==='free'?FREE_OPENER:AUTONOMOUS_OPENER) + (lengthPolicy==='concise'?CONCISE_SUFFIX:'');
    const result=await request(aId,'SEND_TEXT',{text:opener},at.url);
    if(!result?.ok)throw Error(result?.error||'开场消息发送结果未确认');
    const confirmed={...state,processing:false,pendingAt:0,
      lastEvent:(mode==='free'?'自由开场':'自主开场')+'已送达 A，等待 A 完成回复后开始 A→B 转发'};
    await save(confirmed);
    // A may have answered before SEND_TEXT confirmed; the existing content
    // observer/watchdog will handle it. A one-off probe reduces that latency.
    try{
      const fresh=await snapshot(aId,state.urls.A);
      if(RelayCore.hasNewTurn(fresh,confirmed.baseline.A))
        Promise.resolve().then(()=>locked(()=>candidate(aId,fresh)));
    }catch(_){/* observer and alarm retain responsibility for recovery */}
    return confirmed;
  }catch(e){
    // A click may have succeeded even if confirmation failed. Never resend.
    return pause(`${mode==='free'?'自由开场':'自主开场'}未能确认：${err(e)}。可能已经发送，请检查 A 后手动重新启动，不要盲目重试`,state.runId);
  }
}
async function stop(){
  const s=await read();
  const next={...s,running:false,processing:false,pendingAt:0,lastEvent:'已手动停止',error:''};
  await save(next);await chrome.alarms.clear(ALARM);return next;
}
async function candidate(sourceId,snap){
  let s=await read();
  if(!s.running||s.processing)return false;
  const side=s.waiting,sourceTab=side==='A'?s.aId:s.bId;
  if(sourceTab!==sourceId||!RelayCore.hasNewTurn(snap,s.baseline[side]))return false;
  if(snap.text.length>TRANSPORT_GUARD){await pause('回复超过 20 万字符技术防护阈值，未截断或发送',s.runId);return false;}
  if(s.lengthPolicy==='cap' && snap.text.length>s.lengthCap){await pause(`回复 ${snap.text.length} 字符超过所设上限 ${s.lengthCap}，已暂停且未截断或转发`,s.runId);return false;}
  s={...s,processing:true,pendingAt:Date.now(),lastEvent:`发现 ${side} 新的完整回复，校验接收方`};
  await save(s);
  try{
    const dst=other(side),dstId=dst==='A'?s.aId:s.bId;
    const freshSource=await snapshot(sourceTab,s.urls[side]);
    if(!RelayCore.hasNewTurn(freshSource,s.baseline[side]) || freshSource.text!==snap.text ||
      (freshSource.lastUserKey||'')!==(snap.lastUserKey||'') || (freshSource.lastAssistantKey||'')!==(snap.lastAssistantKey||''))
      throw Error('源回答仍在变化，暂停避免转发半截回答。');
    const target=await snapshot(dstId,s.urls[dst]);
    if(target.busy||target.composerHasText)throw Error(`接收方 ${dst} 正在生成或有草稿。`);
    // Record the destination baseline before submission. On unexpected worker exit,
    // processing=true is intentionally NOT retried (unknown delivery status).
    const pending={...s,waiting:dst,baseline:{...s.baseline,
      [side]:RelayCore.baselineOf(freshSource),
      [dst]:RelayCore.baselineOf(target)},
      lastEvent:`已准备发送到 ${dst}（若中断，不自动重试）`};
    await save(pending);
    const result=await request(dstId,'SEND_TEXT',{text:snap.text},s.urls[dst]);
    if(!result?.ok)throw Error(`接收方 ${dst}：${result?.error||'发送无法确认，禁止自动重试。'}`);
    const n=s.sent+1,running=mayContinue(n,s.limit);
    const next={...pending,processing:false,pendingAt:0,running,sent:n,
      lastEvent:running?`已确认 ${n}/${quotaLabel(s)} 次发送；等待 ${dst} 新的回复`:`完成 ${n}/${quotaLabel(s)} 次发送，自动停止`};
    await save(next);
    if(!running)await chrome.alarms.clear(ALARM);
    if(running){
      const fresh=await snapshot(dstId,s.urls[dst]);
      // No reliance on a service worker setTimeout. Queue another check only if an answer
      // already settled, otherwise MutationObserver/alarms will wake us.
      if(RelayCore.hasNewTurn(fresh,next.baseline[dst]))
        Promise.resolve().then(()=>locked(()=>candidate(dstId,fresh)));
    }
    return true;
  }catch(e){await pause(err(e)+'（可能已经发送，请手动检查接收方后重新启动）',s.runId);return false;}
}
async function diagnose(options={}){
  const state=await read();
  const running=state.running;
  if(!running && (!Number.isInteger(options.aId)||!Number.isInteger(options.bId)||options.aId===options.bId))
    return {running:false,note:'请先在上方选择两个不同标签页。'};
  const sides={};
  for(const side of ['A','B']){
    const tabId=side==='A'?(running?state.aId:options.aId):(running?state.bId:options.bId);
    const base=running?state.baseline[side]:{assistant:0,user:0};
    try{
      const snap=await snapshot(tabId,running?state.urls[side]:'');
      let blocker='';
      if(!running) blocker=`只读预检：识别到 ${snap.userCount} 条用户消息、${snap.assistantCount} 条 AI 回复（未启动监听）`;
      else if(RelayCore.identityStatus(snap,base)==='partial') blocker='消息唯一标识不完整：安全等待（避免误转发历史消息）';
      else if([snap.lastUserKey,snap.lastAssistantKey,base.userKey,base.assistantKey].every(Boolean)) {
        if(snap.lastUserKey===base.userKey)blocker='尚未出现新用户消息（依据唯一标识）';
        else if(snap.lastAssistantKey===base.assistantKey)blocker='已看到新用户消息，尚未出现对应的新 AI 回复（依据唯一标识）';
        else if(snap.busy) blocker='识别为仍在生成（停止按钮或流式状态）';
        else if(!snap.lastSpeakerAssistant) blocker='最新角色不是 assistant，页面 DOM 顺序可能与预期不同';
        else if(!snap.text) blocker='找到 AI 消息容器，但无法提取文字';
        else if(!snap.stable) blocker=`等待回复稳定（已静默 ${Math.round((snap.quietMs||0)/1000)} 秒，需要 ${Math.round((snap.requiredQuietMs||0)/1000)} 秒）`;
        else blocker='唯一标识显示新回合已完成；若未转发需检查后台通信';
      }
      else if(snap.userCount<=base.user) blocker='未检测到启动后新增的用户消息（旧页面按数量检测）';
      else if(snap.assistantCount<=base.assistant) blocker='已看到新用户消息，但还没识别到新 AI 回复';
      else if(snap.busy) blocker='识别为仍在生成（停止按钮或流式状态）';
      else if(!snap.lastSpeakerAssistant) blocker='最新角色不是 assistant，页面 DOM 顺序可能与预期不同';
      else if(!snap.text) blocker='找到 AI 消息容器，但无法提取文字';
      else if(!snap.stable) blocker=`等待回复稳定（已静默 ${Math.round((snap.quietMs||0)/1000)} 秒，需要 ${Math.round((snap.requiredQuietMs||0)/1000)} 秒）`;
      else blocker='网页已满足转发条件；若未转发，需检查后台消息传递';
      sides[side]={tabId,selected:running&&state.waiting===side,user:`${snap.userCount}/${base.user}`,
        assistant:`${snap.assistantCount}/${base.assistant}`,busy:snap.busy,
        stable:snap.stable,lastSpeakerAssistant:snap.lastSpeakerAssistant,
        textLength:snap.text?.length||0,copyReady:snap.copyReady,
        quietSeconds:Math.round((snap.quietMs||0)/1000),requiredSeconds:Math.round((snap.requiredQuietMs||0)/1000),
        observerMutations:snap.observerMutations||0,selectorMode:snap.selectorMode||'未知',
        identityStatus:RelayCore.identityStatus(snap,base),
        userKey:snap.lastUserKey||'',assistantKey:snap.lastAssistantKey||'',
        baselineUserKey:base.userKey||'',baselineAssistantKey:base.assistantKey||'',
        markers:snap.markers||{},blocker};
    }catch(e){sides[side]={tabId,error:err(e)};}
  }
  return {running,waiting:state.waiting,sent:state.sent,limit:state.limit,sides};
}
async function watchdog(){
  const s=await read();if(!s.running)return;
  if(s.processing){if(RelayCore.isStuck(s,Date.now()))await pause('后台处理超时：发送是否成功无法确认，请勿盲目重启',s.runId);return;}
  try{const id=s.waiting==='A'?s.aId:s.bId;const snap=await snapshot(id,s.urls[s.waiting]);await candidate(id,snap);}
  catch(e){await pause(err(e),s.runId);}
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  if(['SNAPSHOT','SEND_TEXT','DEMO_REQUEST'].includes(m?.type))return false;
  locked(async()=>{
    switch(m?.type){
      case 'GET_STATE':return read();
      case 'DIAGNOSE':return diagnose({aId:Number(m.aId),bId:Number(m.bId)});
      case 'START':return start(m);
      case 'STOP':return stop();
      case 'CANDIDATE':{
        const src=sender.tab?.id ?? (sender.url?.startsWith(chrome.runtime.getURL('demo.html'))?Number(m.sourceTabId):null);
        if(Number.isInteger(src))return await candidate(src,m.snapshot);return false;
      }
      default:throw Error('未知命令');
    }
  }).then(data=>respond({ok:true,data})).catch(e=>respond({ok:false,error:err(e)}));return true;
});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)locked(watchdog);});
chrome.tabs.onRemoved.addListener(id=>locked(async()=>{const s=await read();if(s.running&&(s.aId===id||s.bId===id))await pause('一个标签页已关闭',s.runId);}));
chrome.tabs.onUpdated.addListener((id,changes)=>{
  // A title/icon change is not navigation. A query/fragment change within the SAME
  // conversation is safe; switching to another conversation is NOT.
  if(!changes.url && changes.status!=='loading')return;
  locked(async()=>{
    const s=await read();if(!s.running||(s.aId!==id&&s.bId!==id))return;
    const side=s.aId===id?'A':'B';
    // status=loading is a full navigation/reload signal in many Chrome versions.
    // Treat it conservatively. Never automatically resume a possibly stale turn.
    if(changes.status==='loading'){
      await pause(`对话 ${side} 网页重新加载，安全暂停。请等待加载完成后重新启动。`,s.runId);
      return;
    }
    if(changes.url && !sameConversation(s.urls[side],changes.url))
      await pause(`对话 ${side} 切换到了另一段会话，安全暂停，未继续发送。`,s.runId);
  });
});
chrome.runtime.onStartup.addListener(()=>locked(stop));
