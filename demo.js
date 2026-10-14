'use strict';
const side=new URLSearchParams(location.search).get('side')||'A';
document.title=`本地演示 · 对话 ${side}`;
document.getElementById('title').textContent=`本地演示 · 对话 ${side}`;
const form=document.getElementById('form'),box=document.getElementById('prompt-textarea'),messages=document.getElementById('messages');
let replies=0;
function add(role,text){const item=document.createElement('article');item.className='msg';item.setAttribute('data-message-author-role',role);
 const title=document.createElement('small');title.textContent=role==='user'?'你 / 自动中转':`模拟 AI ${side}`;
 const body=document.createElement('div');body.className='markdown';body.textContent=text;
 item.append(title,body);messages.append(item);return body;}
form.addEventListener('submit',e=>{
 e.preventDefault();const text=box.innerText.trim();if(!text)return;
 add('user',text);box.textContent='';replies++;
 // Simulate streaming answers, so the bridge must wait until completion.
 const out=add('assistant',`思考中……`);
 const b=document.createElement('button');b.dataset.testid='stop-button';b.hidden=true;document.body.append(b);
 setTimeout(()=>{out.textContent=`模拟 AI ${side} 第 ${replies} 次回复：已收到你的观点「${text.slice(0,42)}」。我想补充一个不同的角度。`;b.remove(); const done=document.createElement('button');done.dataset.testid='copy-turn-action-button';done.hidden=true;out.parentElement.append(done);},450);
});