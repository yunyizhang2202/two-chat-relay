'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
function harness({ autoReplyLimit=Infinity, uncertainOpening=false }={}){
  let listener, store={}, attempts=[];
  const pages={
    1:{url:'https://chatgpt.com/c/test-A',user:1,assistant:1,userKey:'A:u1',assistantKey:'A:a1',text:'历史A'},
    2:{url:'https://chatgpt.com/c/test-B',user:1,assistant:1,userKey:'B:u1',assistantKey:'B:a1',text:'历史B'},
  };
  const event=fn=>({addListener:fn});
  const chrome={
    storage:{session:{get:async(key)=>({[key]:store[key]}),set:async(record)=>Object.assign(store,record)}},
    runtime:{getURL:f=>`chrome-extension://test/${f}`,onMessage:event(fn=>{listener=fn}),onStartup:event(()=>{})},
    tabs:{get:async id=>({id,url:pages[id].url,discarded:false,frozen:false}),
      sendMessage:async(id,m)=>{
        const page=pages[id];
        if(m.type==='SNAPSHOT')return {ok:true,userCount:page.user,assistantCount:page.assistant,
          lastUserKey:page.userKey,lastAssistantKey:page.assistantKey,
          lastSpeakerAssistant:page.assistant>=page.user,
          text:page.text,busy:false,stable:true,composer:true,composerHasText:false};
        if(m.type==='SEND_TEXT'){
          attempts.push({id,text:m.text});
          if(uncertainOpening && attempts.length===1)return {ok:false,error:'未能确定是否送达'};
          page.user++;page.userKey=`${id}:u${page.user}`;
          if(attempts.length<=autoReplyLimit){
            page.assistant++;page.assistantKey=`${id}:a${page.assistant}`;
            page.text=`回复来自${id}，第${attempts.length}次`;
          }
          return {ok:true};
        }
        throw Error('unexpected command: '+m.type);
      },onRemoved:event(()=>{}),onUpdated:event(()=>{})},
    alarms:{create:async()=>{},clear:async()=>{},onAlarm:event(()=>{})},
  };
  const ctx=vm.createContext({chrome,crypto:webcrypto,console,Date,Promise,URL});
  ctx.importScripts=f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),ctx);
  const send=(message,id)=>new Promise((resolve,reject)=>listener(message,id?{tab:{id}}:{},ans=>ans?.ok?resolve(ans.data):reject(Error(ans.error))));
  const settle=async(predicate,timeoutMs=7000)=>{
    const until=Date.now()+timeoutMs;
    while(!predicate()){
      if(Date.now()>until)throw Error(`timeout; sent=${store.relayState?.sent} attempts=${attempts.length}`);
      await new Promise(r=>setTimeout(r,2));
    }
  };
  return {pages,attempts,send,settle,state:()=>store.relayState};
}

test('free starter does not prescribe Chinese and is sent only to A',async()=>{
  const h=harness({autoReplyLimit:0});
  const state=await h.send({type:'START',mode:'free',aId:1,bId:2,limit:10});
  assert.equal(state.running,true);
  assert.equal(state.sent,0);
  assert.equal(h.attempts.length,1);
  assert.equal(h.attempts[0].id,1);
  assert.match(h.attempts[0].text,/any language/);
  assert.match(h.attempts[0].text,/No topic or direction/);
  assert.equal(h.state().mode,'free');
});

test('free mode retains safe pause if initial message cannot be confirmed',async()=>{
  const h=harness({uncertainOpening:true});
  const state=await h.send({type:'START',mode:'free',aId:1,bId:2,limit:1000});
  assert.equal(state.running,false);
  assert.equal(h.attempts.length,1);
  assert.match(state.error,/自由开场未能确认/);
});

test('1000 transfers are relayed and stop exactly at count 1000',async()=>{
  const h=harness();
  await h.send({type:'START',mode:'free',aId:1,bId:2,limit:1000});
  await h.settle(()=>h.state()?.running===false,10000);
  assert.equal(h.state().sent,1000);
  assert.equal(h.attempts.length,1001); // first opener is never charged against limit
  assert.match(h.state().lastEvent,/1000\/1000/);
});

test('limit 0 continues past 1000, and manual stop interrupts it',async()=>{
  const h=harness({autoReplyLimit:1006});
  await h.send({type:'START',mode:'free',aId:1,bId:2,limit:0});
  await h.settle(()=>h.state()?.sent===1006,10000);
  assert.equal(h.attempts.length,1007);
  assert.equal(h.state().running,true);
  assert.match(h.state().lastEvent,/1006\/∞/);
  const stopped=await h.send({type:'STOP'});
  assert.equal(stopped.running,false);
  assert.equal(stopped.sent,1006);
});

test('limits above 1000 and input validation',async()=>{
  for(const value of [1001,10000,1000000,Number.MAX_SAFE_INTEGER]){
    const h=harness({autoReplyLimit:0});
    const s=await h.send({type:'START',mode:'manual',aId:1,bId:2,limit:value});
    assert.equal(s.limit,value);
  }
  for(const value of [-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1]){
    const h=harness();
    await assert.rejects(h.send({type:'START',mode:'free',aId:1,bId:2,limit:value}),/非负整数/);
    assert.equal(h.attempts.length,0);
  }
});

test('concise policy adds one soft hint to autonomous opener, no forwarding text changes',async()=>{
 const h=harness({autoReplyLimit:0});
 const s=await h.send({type:'START',mode:'free',aId:1,bId:2,limit:4,lengthPolicy:'concise'});
 assert.equal(s.lengthPolicy,'concise');
 assert.equal(h.attempts.length,1);
 assert.match(h.attempts[0].text,/Prefer natural brevity/);
 assert.match(h.attempts[0].text,/any language/);
});
test('concise policy cannot silently insert hints into manual mode',async()=>{
 const h=harness();
 await assert.rejects(h.send({type:'START',mode:'manual',aId:1,bId:2,limit:4,lengthPolicy:'concise'}),/仅适用于/);
 assert.equal(h.attempts.length,0);
});
test('cap policy safely pauses and does not forward oversized replies',async()=>{
 const h=harness({autoReplyLimit:0});
 await h.send({type:'START',mode:'free',aId:1,bId:2,limit:4,lengthPolicy:'cap',lengthCap:800});
 const a=h.pages[1];a.assistant++;a.assistantKey='A:a2';a.text='a'.repeat(810);
 const candidate={ok:true,busy:false,stable:true,userCount:a.user,assistantCount:a.assistant,
  lastUserKey:a.userKey,lastAssistantKey:a.assistantKey,lastSpeakerAssistant:true,text:a.text};
 const accepted=await h.send({type:'CANDIDATE',snapshot:candidate},1);
 assert.equal(accepted,false);
 assert.equal(h.state().running,false);
 assert.match(h.state().error,/810.*800/);
 assert.equal(h.attempts.length,1); // No send to B.
});
test('free length policy really forwards messages exceeding old 12k fixed limit',async()=>{
 const h=harness({autoReplyLimit:0});
 await h.send({type:'START',mode:'free',aId:1,bId:2,limit:4,lengthPolicy:'free'});
 const a=h.pages[1];a.assistant++;a.assistantKey='A:a2';a.text='x'.repeat(16000);
 const candidate={ok:true,busy:false,stable:true,userCount:a.user,assistantCount:a.assistant,
  lastUserKey:a.userKey,lastAssistantKey:a.assistantKey,lastSpeakerAssistant:true,text:a.text};
 const accepted=await h.send({type:'CANDIDATE',snapshot:candidate},1);
 assert.equal(accepted,true);
 assert.equal(h.state().sent,1);
 assert.equal(h.attempts[1].id,2);
 assert.equal(h.attempts[1].text.length,16000);
});
test('strict cap validation refuses invalid bounds',async()=>{
 for(const lengthCap of [99,200001, NaN]){
  const h=harness();
  await assert.rejects(h.send({type:'START',mode:'free',aId:1,bId:2,limit:4,lengthPolicy:'cap',lengthCap}),/100–200000/);
 }
});
