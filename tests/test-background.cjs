const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function harness({failSend=false}={}){
 let listener,alarm,onUpdated,store={},numSends=0;
 const pages={1:{user:1,assistant:1,text:'历史回复',url:'https://chatgpt.com/c/test-A'},
              2:{user:1,assistant:1,text:'历史回复',url:'https://chatgpt.com/c/test-B'}};
 const evt=(set)=>({addListener:set});
 const chrome={
  storage:{session:{get:async(key)=>({[key]:store[key]}),set:async x=>Object.assign(store,x)}},
  runtime:{getURL:x=>`chrome-extension://test/${x}`,
    onMessage:evt(fn=>listener=fn),onStartup:evt(()=>{})},
  tabs:{get:async id=>({id,url:pages[id].url,discarded:false}),
    sendMessage:async(id,msg)=>{
      const pg=pages[id];
      if(msg.type==='SNAPSHOT')return {ok:true,assistantCount:pg.assistant,userCount:pg.user,
        lastSpeakerAssistant:pg.assistant>=pg.user&&pg.assistant>0,
        text:pg.text,lastUserKey:pg.userKey||'',lastAssistantKey:pg.assistantKey||'',busy:false,stable:true,composer:true,composerHasText:false};
      if(msg.type==='SEND_TEXT'){
        numSends++;
        if(failSend)return {ok:false,error:'模拟不确定发送状态'};
        pg.user++;pg.assistant++;pg.text=`回信${numSends}: ${msg.text}`;
        return {ok:true};
      }
      throw Error('unexpected command '+msg.type);
    },onRemoved:evt(()=>{}),onUpdated:evt(fn=>onUpdated=fn)},
  alarms:{create:async()=>{},clear:async()=>{},onAlarm:evt(fn=>alarm=fn)},
 };
 const ctx=vm.createContext({chrome,crypto:webcrypto,console,Date,Promise,URL});
 ctx.importScripts=(file)=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8'),ctx);
 const send=(msg,tabId)=>new Promise((resolve,reject)=>listener(msg,tabId?{tab:{id:tabId}}:{},x=>x?.ok?resolve(x.data):reject(Error(x.error))));
 return {pages,send,state:()=>store.relayState,sends:()=>numSends,updated:(id,change)=>onUpdated(id,change)};
}
test('starts with no replay of previous conversation',async()=>{
 const h=harness();h.pages[1].user=8;h.pages[1].assistant=8;h.pages[1].text='过去的老回复';
 await h.send({type:'START',aId:1,bId:2,limit:2});
 await h.send({type:'CANDIDATE',snapshot:{ok:true,assistantCount:8,userCount:8,stable:true,busy:false,lastSpeakerAssistant:true,text:'过去的老回复'}},1);
 assert.equal(h.sends(),0);assert.equal(h.state().running,true);
});
test('relays two tabs exactly four transfers and auto-stops',async()=>{
 const h=harness();await h.send({type:'START',aId:1,bId:2,limit:4});
 h.pages[1].user++;h.pages[1].assistant++;h.pages[1].text='A的真实新回答';
 const s={ok:true,assistantCount:2,userCount:2,stable:true,busy:false,lastSpeakerAssistant:true,text:'A的真实新回答'};
 await h.send({type:'CANDIDATE',snapshot:s},1);
 for(let i=0;i<100 && h.state().running;i++)await new Promise(r=>setTimeout(r,3));
 assert.equal(h.sends(),4);assert.equal(h.state().sent,4);assert.equal(h.state().running,false);
});
test('uncertain delivery pauses and never retries',async()=>{
 const h=harness({failSend:true});await h.send({type:'START',aId:1,bId:2,limit:4});
 h.pages[1].user++;h.pages[1].assistant++;h.pages[1].text='新回复';
 await h.send({type:'CANDIDATE',snapshot:{ok:true,assistantCount:2,userCount:2,stable:true,busy:false,lastSpeakerAssistant:true,text:'新回复'}},1);
 assert.equal(h.sends(),1);assert.equal(h.state().running,false);
 assert.match(h.state().error,/可能已经发送/);
});

test('refuses to start if either ChatGPT tab is still a new blank conversation',async()=>{
 const h=harness();h.pages[2].url='https://chatgpt.com/';
 await assert.rejects(h.send({type:'START',aId:1,bId:2,limit:4}),/对话 B.*未建立/);
 assert.notEqual(h.state()?.running,true);
});
test('query string change in same conversation does not pause',async()=>{
 const h=harness();await h.send({type:'START',aId:1,bId:2,limit:4});
 h.pages[1].url='https://chatgpt.com/c/test-A?model=high';
 h.updated(1,{url:h.pages[1].url});await h.send({type:'GET_STATE'});
 assert.equal(h.state().running,true);
});
test('navigating to another conversation pauses',async()=>{
 const h=harness();await h.send({type:'START',aId:1,bId:2,limit:4});
 h.pages[1].url='https://chatgpt.com/c/an-unrelated-chat';
 h.updated(1,{url:h.pages[1].url});await h.send({type:'GET_STATE'});
 assert.equal(h.state().running,false);assert.match(h.state().error,/切换到了另一段会话/);
});
test('actual reload still pauses conservatively',async()=>{
 const h=harness();await h.send({type:'START',aId:1,bId:2,limit:4});
 h.updated(2,{status:'loading'});await h.send({type:'GET_STATE'});
 assert.equal(h.state().running,false);assert.match(h.state().error,/重新加载/);
});

test('diagnose is read-only and shows which baseline is missing',async()=>{
 const h=harness();await h.send({type:'START',aId:1,bId:2,limit:3});
 h.pages[1].user=2;
 const d=await h.send({type:'DIAGNOSE'});
 assert.equal(d.running,true);
 assert.match(d.sides.A.blocker,/还没识别到新 AI 回复/);
 assert.equal(d.sides.A.user,'2/1');
 assert.equal(h.sends(),0);
});

test('refuses to silently run when existing chat messages are unrecognized',async()=>{
 const h=harness();h.pages[1].user=0;h.pages[1].assistant=0;
 await assert.rejects(h.send({type:'START',aId:1,bId:2,limit:2}),/消息未被识别/);
 assert.notEqual(h.state()?.running,true);
});

test('diagnosis can inspect both tabs before starting without sending',async()=>{
 const h=harness();const d=await h.send({type:'DIAGNOSE',aId:1,bId:2});
 assert.equal(d.running,false);assert.equal(d.sides.A.user,'1/0');
 assert.equal(d.sides.B.assistant,'1/0');assert.equal(h.sends(),0);
});

test('keyed DOM count regression 6->5 completes one relay',async()=>{
 const h=harness();
 h.pages[1].user=6;h.pages[1].assistant=6;
 h.pages[1].userKey='unit:old-user';h.pages[1].assistantKey='unit:old-assistant';
 h.pages[2].userKey='unit:target-user';h.pages[2].assistantKey='unit:target-assistant';
 await h.send({type:'START',aId:1,bId:2,limit:1});
 h.pages[1].user=5;h.pages[1].assistant=5;
 h.pages[1].userKey='unit:new-user';h.pages[1].assistantKey='unit:new-assistant';
 h.pages[1].text='较长的新回答，即使可见消息总数减少，也应当转发';
 const snap={ok:true,userCount:5,assistantCount:5,lastUserKey:h.pages[1].userKey,
  lastAssistantKey:h.pages[1].assistantKey,stable:true,busy:false,lastSpeakerAssistant:true,text:h.pages[1].text};
 const accepted=await h.send({type:'CANDIDATE',snapshot:snap},1);
 assert.equal(accepted,true);assert.equal(h.sends(),1);assert.equal(h.state().sent,1);
});

test('stale candidate returns false rather than a false acknowledgment',async()=>{
 const h=harness();await h.send({type:'START',aId:1,bId:2,limit:1});
 const accepted=await h.send({type:'CANDIDATE',snapshot:{ok:true,userCount:1,assistantCount:1,
  stable:true,busy:false,lastSpeakerAssistant:true,text:'过去消息'}},1);
 assert.equal(accepted,false);assert.equal(h.sends(),0);
});
