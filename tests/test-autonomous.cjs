'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function harness({ instantReplies = false, failOpen = false } = {}) {
  let listener, alarm, store = {}, sends = [];
  const pages = {
    1: {url:'https://chatgpt.com/c/test-A', user:1,assistant:1,userKey:'a-u1',assistantKey:'a-a1',text:'A 旧消息'},
    2: {url:'https://chatgpt.com/c/test-B', user:1,assistant:1,userKey:'b-u1',assistantKey:'b-a1',text:'B 旧消息'},
  };
  const evt = callback => ({addListener: callback});
  const chrome = {
    storage:{session:{get:async key=>({[key]:store[key]}),set:async data=>Object.assign(store,data)}},
    runtime:{getURL: x=>`chrome-extension://test/${x}`,onMessage:evt(fn=>{listener=fn}),onStartup:evt(()=>{})},
    tabs:{get:async id=>({id,url:pages[id].url,discarded:false,frozen:false}),
      sendMessage:async(id,msg)=>{
        const page=pages[id];
        if(msg.type==='SNAPSHOT')return {
          ok:true,userCount:page.user,assistantCount:page.assistant,
          lastUserKey:page.userKey,lastAssistantKey:page.assistantKey,
          lastSpeakerAssistant:page.assistant>=page.user,
          text:page.text,busy:false,stable:true,composer:true,composerHasText:false,
        };
        if(msg.type==='SEND_TEXT'){
          sends.push({id,text:msg.text});
          if(failOpen && id===1)return {ok:false,error:'首次点击后发送结果不确定'};
          page.user++;page.userKey=`${id}-user-${page.user}`;
          if(instantReplies){
            page.assistant++;page.assistantKey=`${id}-assistant-${page.assistant}`;
            page.text=`AI ${id} 回复：${msg.text}`;
          }
          return {ok:true};
        }
        throw Error('Unexpected '+msg.type);
      },onRemoved:evt(()=>{}),onUpdated:evt(()=>{})},
    alarms:{create:async()=>{},clear:async()=>{},onAlarm:evt(fn=>{alarm=fn})},
  };
  const ctx=vm.createContext({chrome,crypto:webcrypto,console,Date,Promise,URL});
  ctx.importScripts=filename=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8'),ctx);
  const send=(msg,id)=>new Promise((resolve,reject)=>listener(msg,id?{tab:{id}}:{},r=>r?.ok?resolve(r.data):reject(Error(r.error))));
  const settle=async()=>{for(let i=0;i<150;i++){await new Promise(resolve=>setTimeout(resolve,2));if(!store.relayState?.running)break;}};
  return {pages,sends,send,settle,state:()=>store.relayState};
}

test('manual is default and sends no automatic opener',async()=>{
  const h=harness();
  const s=await h.send({type:'START',aId:1,bId:2,limit:2});
  assert.equal(s.mode,'manual');
  assert.equal(s.sent,0);
  assert.equal(h.sends.length,0);
  assert.match(s.lastEvent,/等待 A/);
});

test('autonomous sends opener once to A, not to B; prompt does not count',async()=>{
  const h=harness();
  const s=await h.send({type:'START',aId:1,bId:2,limit:2,mode:'autonomous'});
  assert.equal(h.sends.length,1);
  assert.equal(h.sends[0].id,1);
  assert.match(h.sends[0].text,/自行决定话题/);
  assert.equal(s.sent,0);
  assert.equal(s.waiting,'A');
  assert.equal(s.processing,false);
  assert.equal(h.pages[1].user,2);
  assert.equal(s.baseline.A.user,1);
  assert.equal(s.baseline.B.user,1);
  assert.equal(s.running,true);
});

test('autonomous first reply from A is forwarded to B using unchanged existing relay mechanism',async()=>{
  const h=harness();
  await h.send({type:'START',aId:1,bId:2,limit:1,mode:'autonomous'});
  const a=h.pages[1];
  a.assistant=2;a.assistantKey='a-a2';a.text='我自己选择了关于时间的主题。';
  const cand={ok:true,userCount:a.user,assistantCount:a.assistant,
    lastUserKey:a.userKey,lastAssistantKey:a.assistantKey,
    lastSpeakerAssistant:true,busy:false,stable:true,text:a.text};
  const accepted=await h.send({type:'CANDIDATE',snapshot:cand},1);
  assert.equal(accepted,true);
  assert.equal(h.sends.length,2);
  assert.equal(h.sends[1].id,2);
  assert.equal(h.sends[1].text,a.text);
  assert.equal(h.state().sent,1);
  assert.equal(h.state().running,false);
});

test('autonomous can relay two exchanges and stop without counting opener',async()=>{
  const h=harness({instantReplies:true});
  await h.send({type:'START',aId:1,bId:2,limit:2,mode:'autonomous'});
  await h.settle();
  assert.equal(h.sends.length,3); // opener + A->B + B->A
  assert.deepEqual(h.sends.map(x=>x.id),[1,2,1]);
  assert.equal(h.state().sent,2);
  assert.equal(h.state().running,false);
});

test('unconfirmed opening safely pauses and never blindly retries',async()=>{
  const h=harness({failOpen:true});
  const s=await h.send({type:'START',aId:1,bId:2,limit:3,mode:'autonomous'});
  assert.equal(s.running,false);
  assert.equal(s.processing,false);
  assert.equal(h.sends.length,1);
  assert.match(s.error,/自主开场未能确认/);
  assert.match(s.error,/不要盲目重试/);
});

test('invalid startup mode is rejected before the first send',async()=>{
  const h=harness();
  await assert.rejects(h.send({type:'START',aId:1,bId:2,limit:2,mode:'random'}),/未知启动模式/);
  assert.equal(h.sends.length,0);
});

test('already-running autonomous mode cannot send another opener',async()=>{
  const h=harness();
  await h.send({type:'START',aId:1,bId:2,limit:2,mode:'autonomous'});
  await assert.rejects(h.send({type:'START',aId:1,bId:2,limit:2,mode:'autonomous'}),/已经在运行/);
  assert.equal(h.sends.length,1);
});
