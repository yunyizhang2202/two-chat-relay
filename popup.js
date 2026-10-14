'use strict';
const $ = id => document.getElementById(id);
const allowed = url => url?.startsWith('https://chatgpt.com/') || url?.startsWith(chrome.runtime.getURL('demo.html'));
const ready = url => url?.startsWith(chrome.runtime.getURL('demo.html')) || /^https:\/\/chatgpt\.com\/c\/[a-zA-Z0-9-]+\/?(?:[?#].*)?$/.test(url||'');
const modeHelpText = {
  free:'AI 自己决定聊什么、用什么语言。你不用发第一条消息。',
  autonomous:'AI 自选话题，使用中文开场提示。你不用发第一条消息。',
  manual:'点击开始后，在第一个聊天里手动发一句话。'
};
let currentRun = null;
let populateVersion = 0;
const PREFS_KEY='twoChatRelayUiPrefs';
async function loadPrefs(){
  try{const obj=await chrome.storage?.local?.get(PREFS_KEY);return obj?.[PREFS_KEY]||null;}
  catch(_){return null;}
}
function remember(){
  try{
    const prefs={aId:$('a').value,bId:$('b').value,mode:$('mode').value,
      limit:$('limit').value,lengthPolicy:$('lengthPolicy').value,lengthCap:$('lengthCap').value};
    const pending=chrome.storage?.local?.set({[PREFS_KEY]:prefs});
    pending?.catch?.(()=>{});
  }catch(_){/* Saving preferences is optional; never interrupt the conversation. */}
}

async function call(data){const r=await chrome.runtime.sendMessage(data);if(!r?.ok)throw new Error(r?.error||'扩展通信失败');return r.data;}
function setTip(message){$('tabTip').textContent=message;}
function labelTab(tab){
  let title=(tab.title||'未命名聊天').replace(/\s*[-|·]\s*ChatGPT\s*$/i,'').trim();
  if(title.length>45)title=title.slice(0,43)+'…';
  return `${ready(tab.url)?'':'⚠ '}${title}`;
}
async function populate(prefs=null){
  const version=++populateVersion;
  const tabs=(await chrome.tabs.query({})).filter(t=>allowed(t.url));
  const state=await call({type:'GET_STATE'}).catch(()=>null);
  if(version!==populateVersion)return;
  const prevA=$('a').value,prevB=$('b').value;
  for(const key of ['a','b']){
    const select=$(key);select.textContent='';
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='请选择聊天标签页';select.appendChild(placeholder);
    for(const tab of tabs){const opt=document.createElement('option');opt.value=String(tab.id);opt.textContent=labelTab(tab);select.append(opt);}
  }
  const available=id=>tabs.some(t=>String(t.id)===id);
  const first=String(tabs[0]?.id||'');const second=String(tabs.find(t=>String(t.id)!==first)?.id||'');
  const aCandidate=state?.running?String(state.aId||''):prevA||String(prefs?.aId||state?.aId||'');
  const bCandidate=state?.running?String(state.bId||''):prevB||String(prefs?.bId||state?.bId||'');
  $('a').value=available(aCandidate)?aCandidate:first;
  $('b').value=available(bCandidate)?bCandidate:second;
  if($('a').value && $('b').value===$('a').value && tabs.length>1){$('b').value=String(tabs.find(t=>String(t.id)!==$('a').value)?.id||'');}
  if(state?.running){
    $('mode').value=['manual','autonomous','free'].includes(state.mode)?state.mode:'free';
    $('limit').value=String(state.limit);
    $('lengthPolicy').value=state.lengthPolicy||'free';
    $('lengthCap').value=String(state.lengthCap||8000);
    modeHelp();lengthHelp();updatePresets();
  }
  if(tabs.length<2)setTip('请先打开两个 ChatGPT 聊天，并各完成一次问答，然后点“刷新”。');
  else if(!ready(tabs.find(t=>String(t.id)===$('a').value)?.url)||!ready(tabs.find(t=>String(t.id)===$('b').value)?.url))
    setTip('⚠ 有聊天还没建立会话；请先在该页手动问答一次。');
  else setTip('两个聊天已选好，可以开始。');
}
function updatePresets(){
  const value=$('limit').value.trim();
  document.querySelectorAll('.preset').forEach(btn=>{
    const isSelected=btn.dataset.limit===value;
    btn.classList.toggle('selected',isSelected);
    btn.setAttribute('aria-pressed',String(isSelected));
  });
}
function modeHelp(){
  const mode=$('mode').value;
  $('modeHelp').textContent=modeHelpText[mode]||modeHelpText.free;
  $('start').textContent=mode==='manual'?'▶ 开始等待消息':'▶ 开始聊天';
  lengthHelp();
}
function lengthHelp(){
  const policy=$('lengthPolicy').value;
  $('capControl').hidden=policy!=='cap';
  $('lengthHelp').textContent=policy==='cap'?'超出上限会暂停，不裁剪内容。'
    :policy==='concise'?'仅自动开场时温和提醒 A 简洁交流，不强制限字数。'
    :'完整转发回复；保留安全防护阈值。';
  if(policy==='concise' && $('mode').value==='manual')$('lengthHelp').textContent+=' 人工开场模式不支持此选项。';
}
function show(state){
  if(!state)return;
  currentRun=state;
  $('light').className='light'+(state.running?' on':state.error?' err':'');
  $('headline').textContent=state.running?'正在聊天':state.error?'已暂停 · 请检查':state.sent?'本轮已结束':'准备就绪';
  const sent=Number.isSafeInteger(state.sent)?state.sent:0;
  const limit=Number.isSafeInteger(state.limit)?state.limit:0;
  $('counter').textContent=state.running||sent?`已传 ${sent}${limit>0?` / ${limit}`:''} 次`:'尚未开始';
  $('detail').textContent=state.error||state.lastEvent||'选好两个聊天，点击开始。';
  $('progressTrack').hidden=limit===0 || (!state.running && sent===0);
  $('progressFill').style.width=limit>0?`${Math.max(0,Math.min(100,sent/limit*100))}%`:'0%';
  $('start').disabled=Boolean(state.running);
  $('stop').disabled=!state.running;
  for(const id of ['a','b','mode','limit','lengthPolicy','lengthCap','swap'])$(id).disabled=Boolean(state.running);
  document.querySelectorAll('.preset').forEach(b=>b.disabled=Boolean(state.running));
}
async function status(){try{show(await call({type:'GET_STATE'}));}catch(e){$('headline').textContent='连接中断';$('detail').textContent=e.message;}}
$('mode').addEventListener('change',()=>{modeHelp();remember();});
$('lengthPolicy').addEventListener('change',()=>{lengthHelp();remember();});
$('limit').addEventListener('input',()=>{updatePresets();remember();});
document.querySelectorAll('.preset').forEach(button=>button.addEventListener('click',()=>{$('limit').value=button.dataset.limit;updatePresets();remember();}));
$('swap').addEventListener('click',()=>{const x=$('a').value;$('a').value=$('b').value;$('b').value=x;remember();});
$('refresh').addEventListener('click',()=>populate().then(remember).catch(e=>setTip('刷新失败：'+e.message)));
$('start').addEventListener('click',async()=>{
  const button=$('start');button.disabled=true;button.textContent='正在连接…';
  try{
    remember();
    const rawLimit=$('limit').value.trim();
    if(rawLimit==='')throw Error('请输入聊天次数（0 表示不限）。');
    if(!$('a').value||!$('b').value)throw Error('请先选择两个聊天页。');
    if($('a').value===$('b').value)throw Error('两个聊天不能是同一个页面。');
    const result=await call({type:'START',aId:Number($('a').value),bId:Number($('b').value),limit:Number(rawLimit),mode:$('mode').value,lengthPolicy:$('lengthPolicy').value,lengthCap:Number($('lengthCap').value)});
    show(result);
  }catch(e){$('advanced').open=false;alert('暂时无法开始：'+e.message);await status();}
  finally{button.disabled=Boolean(currentRun?.running);if(!currentRun?.running)modeHelp();}
});
$('stop').addEventListener('click',async()=>{try{show(await call({type:'STOP'}));}catch(e){alert('停止失败：'+e.message);}});
$('demo').addEventListener('click',async()=>{
  try{
    const a=await chrome.tabs.create({url:chrome.runtime.getURL('demo.html?side=A'),active:false});
    const b=await chrome.tabs.create({url:chrome.runtime.getURL('demo.html?side=B'),active:false});
    await new Promise(resolve=>setTimeout(resolve,600));await populate();
    $('a').value=String(a.id);$('b').value=String(b.id);
    setTip('已打开两个演示页，可以试着点击“开始聊天”。');remember();
    $('advanced').open=false;
  }catch(e){setTip('打开演示页失败：'+e.message);}
});
$('diagnose').addEventListener('click',async()=>{
  const area=$('diagnostic');area.hidden=false;area.textContent='正在检查两个聊天…';
  try{
    const r=await call({type:'DIAGNOSE',aId:Number($('a').value),bId:Number($('b').value)});
    if(!r.sides){area.textContent=r.note||'暂无诊断数据';return;}
    const lines=[r.running?`等待：${r.waiting} · 已传：${r.sent}/${r.limit===0?'∞':r.limit}`:'当前未在运行'];
    for(const side of ['A','B']){
      const x=r.sides[side];
      if(x.error){lines.push(`${side}（标签 ${x.tabId}）：${x.error}`);continue;}
      lines.push(`${side}：用户消息 ${x.user}，AI 回复 ${x.assistant}`,
        `识别模式=${x.selectorMode}，生成中=${x.busy}，已稳定=${x.stable}，最后角色为AI=${x.lastSpeakerAssistant}`,
        `回复字符=${x.textLength}，静默 ${x.quietSeconds}/${x.requiredSeconds} 秒，完成按钮=${x.copyReady}，页面变动=${x.observerMutations}`,
        `旧角色 ${x.markers?.oldRoles??0}，新版单元 ${x.markers?.newUnits??0}，会话标记 ${x.markers?.turnKeys??0}，用户气泡 ${x.markers?.userBubbles??0}，AI内容 ${x.markers?.assistantContent??0}`,
        `消息标识：${x.identityStatus}；用户 ${String(x.userKey).slice(-26)} ≠ ${String(x.baselineUserKey).slice(-26)}；AI ${String(x.assistantKey).slice(-26)} ≠ ${String(x.baselineAssistantKey).slice(-26)}`,
        `判断：${x.blocker}`);
    }
    area.textContent=lines.join('\n');
  }catch(e){area.textContent='诊断失败：'+e.message;}
});
$('a').addEventListener('change',remember);
$('b').addEventListener('change',remember);
$('lengthCap').addEventListener('change',remember);
modeHelp();lengthHelp();updatePresets();
(async()=>{
  const prefs=await loadPrefs();
  if(prefs){
    if(['manual','autonomous','free'].includes(prefs.mode))$('mode').value=prefs.mode;
    if(/^\d+$/.test(String(prefs.limit||'')))$('limit').value=prefs.limit;
    if(['free','concise','cap'].includes(prefs.lengthPolicy))$('lengthPolicy').value=prefs.lengthPolicy;
    if(/^\d+$/.test(String(prefs.lengthCap||'')))$('lengthCap').value=prefs.lengthCap;
    modeHelp();lengthHelp();updatePresets();
  }
  await populate(prefs);await status();
})().catch(e=>{$('detail').textContent=e.message;});
setInterval(status,1500);
