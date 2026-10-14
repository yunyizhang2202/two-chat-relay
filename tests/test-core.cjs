const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../relay_core.js'),'utf8'),ctx);
const {samePrompt,hasNewTurn,isStuck}=ctx.RelayCore;
const base={user:3,assistant:3};
const good={ok:true,busy:false,stable:true,lastSpeakerAssistant:true,text:'完整回复',userCount:4,assistantCount:4};
const cases=[
 ['samePrompt keeps Chinese + whitespace flexible',()=>assert.equal(samePrompt('回答： 你好\n世界','回答：你好世界'),true)],
 ['samePrompt rejects truncated or wrong text',()=>assert.equal(samePrompt('你好','你好世界'),false)],
 ['samePrompt rejects empty',()=>assert.equal(samePrompt('',''),false)],
 ['allows genuinely new turn',()=>assert.equal(hasNewTurn(good,base),true)],
 ['rejects old assistant re-render without new user',()=>assert.equal(hasNewTurn({...good,userCount:3},base),false)],
 ['rejects old assistant after new user, no new assistant',()=>assert.equal(hasNewTurn({...good,assistantCount:3},base),false)],
 ['rejects streaming',()=>assert.equal(hasNewTurn({...good,busy:true},base),false)],
 ['rejects unsettled response',()=>assert.equal(hasNewTurn({...good,stable:false},base),false)],
 ['rejects user latest speaker',()=>assert.equal(hasNewTurn({...good,lastSpeakerAssistant:false},base),false)],
 ['long response does not silently disappear',()=>assert.equal(hasNewTurn({...good,text:'x'.repeat(12001)},base),true)],
 ['accepts max 12000 response',()=>assert.equal(hasNewTurn({...good,text:'x'.repeat(12000)},base),true)],
 ['detects unacknowledged pending delivery',()=>assert.equal(isStuck({processing:true,pendingAt:100},60101),true)],
 ['does not timeout healthy pending',()=>assert.equal(isStuck({processing:true,pendingAt:100},59000),false)],
 ['does not mark idle as stuck',()=>assert.equal(isStuck({processing:false,pendingAt:0},300000),false)]
];
for(const [name,fn] of cases)test(name,fn);
test('DOM count regression 6->5 still identifies fresh keyed turns',()=>{
 const start={user:6,assistant:6,userKey:'unit:old:user',assistantKey:'unit:old:assistant'};
 const now={...good,userCount:5,assistantCount:5,lastUserKey:'unit:new:user',lastAssistantKey:'unit:new:assistant'};
 assert.equal(ctx.RelayCore.identityStatus(now,start),'new');
 assert.equal(hasNewTurn(now,start),true);
});
test('old keyed turn does not become new when DOM count grows',()=>{
 const start={user:6,assistant:6,userKey:'unit:old:user',assistantKey:'unit:old:assistant'};
 const now={...good,userCount:8,assistantCount:8,lastUserKey:'unit:old:user',lastAssistantKey:'unit:old:assistant'};
 assert.equal(hasNewTurn(now,start),false);
});
test('new user but stale assistant key is rejected',()=>{
 const start={user:6,assistant:6,userKey:'unit:old:user',assistantKey:'unit:old:assistant'};
 const now={...good,userCount:5,assistantCount:5,lastUserKey:'unit:new:user',lastAssistantKey:'unit:old:assistant'};
 assert.equal(hasNewTurn(now,start),false);
});
test('partial identity does not silently fall back to counts',()=>{
 const start={user:6,assistant:6,userKey:'unit:old:user',assistantKey:'unit:old:assistant'};
 const now={...good,userCount:8,assistantCount:8,lastUserKey:'unit:new:user',lastAssistantKey:''};
 assert.equal(ctx.RelayCore.identityStatus(now,start),'partial');
 assert.equal(hasNewTurn(now,start),false);
});
test('baselines capture message IDs',()=>{
 const b=ctx.RelayCore.baselineOf({...good,lastUserKey:'user-key',lastAssistantKey:'assistant-key'});
 assert.equal(b.userKey,'user-key'); assert.equal(b.assistantKey,'assistant-key');
});

test('delivery: accepts a new keyed user message when visible count stays unchanged',()=>{
 const before={lastUserKey:'unit:old:user',userCount:6};
 const after={lastUserKey:'unit:new:user',userCount:6,userText:'你好， 这是消息'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'你好，这是消息'),'confirmed');
});
test('delivery: accepts a new keyed user message even when visible count falls',()=>{
 const before={lastUserKey:'unit:old:user',userCount:6};
 const after={lastUserKey:'unit:new:user',userCount:5,userText:'长文本发送'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'长文本发送'),'confirmed');
});
test('delivery: rejects count growth when stable user key is unchanged',()=>{
 const before={lastUserKey:'unit:old:user',userCount:6};
 const after={lastUserKey:'unit:old:user',userCount:8,userText:'长文本发送'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'长文本发送'),'pending');
});
test('delivery: rejects different text despite a fresh user key',()=>{
 const before={lastUserKey:'unit:old:user',userCount:6};
 const after={lastUserKey:'unit:new:user',userCount:5,userText:'别人发出的消息'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'长文本发送'),'mismatch');
});
test('delivery: does not accept an incomplete key pair on renderer remount',()=>{
 const before={lastUserKey:'unit:old:user',userCount:6};
 const after={lastUserKey:'',userCount:8,userText:'长文本发送'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'长文本发送'),'pending');
});
test('delivery: legacy pages without IDs still use matching text + count growth',()=>{
 const before={lastUserKey:'',userCount:3};
 const after={lastUserKey:'',userCount:4,userText:'长文本发送'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'长文本发送'),'confirmed');
});

// v0.8: rich-rendered user bubbles may hide original Markdown markers.
test('Markdown bold rendered as plain text is confirmed',()=>{
 const before={lastUserKey:'unit:old',userCount:5};
 const after={lastUserKey:'unit:new',userCount:5,userText:'这是重要的一点'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'这是**重要**的一点'),'confirmed');
});
test('Markdown heading and list rendered as plain text is confirmed',()=>{
 const before={lastUserKey:'old',userCount:5};
 const after={lastUserKey:'new',userCount:5,userText:'标题\n甲\n乙'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'## 标题\n- 甲\n- 乙'),'confirmed');
});
test('inline code and hyperlink visibly rendered are accepted',()=>{
 const before={lastUserKey:'old',userCount:5};
 const after={lastUserKey:'new',userCount:5,userText:'运行print(1)，参见官网'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'运行`print(1)`，参见[官网](https://example.org)'),'confirmed');
});
test('changed meaning still rejects even with Markdown',()=>{
 const before={lastUserKey:'old',userCount:5};
 const after={lastUserKey:'new',userCount:5,userText:'这是不重要的一点'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'这是**重要**的一点'),'mismatch');
});
test('truncated Markdown payload remains rejected',()=>{
 const before={lastUserKey:'old',userCount:5};
 const after={lastUserKey:'new',userCount:5,userText:'标题'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'## 标题\n不能漏掉的正文'),'mismatch');
});

// v0.9: a failed comparison should identify where without leaking text.
test('difference report recognizes seven trailing extra characters without revealing user text',()=>{
 const s=ctx.RelayCore.diffSummary('甲'.repeat(393)+'附加七个汉字啊','甲'.repeat(393));
 assert.match(s,/末尾多 7 个/);
 assert.equal(s.includes('附加七个汉字啊'),false);
});
test('difference report identifies first changed character instead of weak similarity',()=>{
 const s=ctx.RelayCore.diffSummary('甲乙丁','甲乙丙');
 assert.match(s,/第 3 个/);
 assert.match(s,/U\+4E19/);
});

test('long rich math prompt compared against rendered annotation source, all prose must match',()=>{
 const expected='Start: '+ 'This paragraph is substantial. '.repeat(450) +'\\(h(x)\\) and \\(W_1\\) then \\(W_2\\). Final exact sentence.';
 const rendered='Start: '+ 'This paragraph is substantial. '.repeat(450) +'h(x) and W_1 then W_2. Final exact sentence.';
 const before={lastUserKey:'old',userCount:3};
 const after={lastUserKey:'new',userCount:4,userText:rendered};
 assert.ok(expected.length>12000);
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,expected),'confirmed');
 assert.equal(ctx.RelayCore.deliveryEvidence(before,{...after,userText:rendered.slice(0,-14)},expected),'mismatch');
 assert.equal(ctx.RelayCore.deliveryEvidence(before,{...after,userText:rendered.replace('Final exact','Final wrong')},expected),'mismatch');
});
test('source math \\(h\\) is not equivalent to different rendered expression',()=>{
 const before={lastUserKey:'old',userCount:3};
 const after={lastUserKey:'new',userCount:4,userText:'System observes h(x)'};
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'System observes \\(h(x)\\)'),'confirmed');
 assert.equal(ctx.RelayCore.deliveryEvidence(before,after,'System observes \\(h(y)\\)'),'mismatch');
});
