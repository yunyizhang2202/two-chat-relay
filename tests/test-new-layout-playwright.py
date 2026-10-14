"""Offline DOM fixtures for ChatGPT 2026 Chat/Work renderer, legacy renderer and fallback.
Does not authenticate or access chatgpt.com."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parent.parent

async def setup_page(browser,mode):
 p=await browser.new_page()
 await p.set_content('''<!doctype html><meta charset="utf-8"><main id="thread"></main>
 <form data-chatgpt-composer><div class="ProseMirror" role="textbox" contenteditable="true" data-placeholder="Ask anything"></div>
 <button data-testid="send-button">Send</button></form>''')
 await p.evaluate("""window.chrome={runtime:{onMessage:{addListener:fn=>window.__relayListener=fn},sendMessage:async m=>({ok:true})}}""")
 await p.evaluate('''(mode)=>{
  window.addTurn=(role,text)=>{
   const root=document.getElementById('thread');
   if(mode==='new'){
     const wrap=document.createElement('div');wrap.setAttribute('data-turn-key','turn-'+root.childElementCount);
     const unit=document.createElement('div');unit.setAttribute('data-content-search-unit-key','test:'+root.childElementCount+':'+role);
     const block=document.createElement('div');
     if(role==='user')block.setAttribute('data-user-message-bubble','true');
     else block.setAttribute('data-markdown-text-style','assistant-message');
     block.textContent=text;unit.appendChild(block);wrap.appendChild(unit);root.appendChild(wrap);
   }else if(mode==='fallback'){
     const wrap=document.createElement('div');wrap.setAttribute('data-turn-key','turn-'+root.childElementCount);
     const block=document.createElement('div');
     if(role==='user')block.setAttribute('data-user-message-bubble','true');
     else {block.setAttribute('data-conversation-role','assistant');
       const content=document.createElement('div');content.setAttribute('data-markdown-text-style','assistant-message');
       content.textContent=text;block.appendChild(content)}
     if(role==='user')block.textContent=text;
     wrap.appendChild(block);root.appendChild(wrap);
   }else{
     const block=document.createElement('article');block.setAttribute('data-message-author-role',role);
     const md=document.createElement('div');md.className='markdown';md.textContent=text;block.appendChild(md);root.appendChild(block);
   }
  };
  const form=document.querySelector('form');const input=form.querySelector('[contenteditable]');
  form.addEventListener('submit',e=>{
    e.preventDefault();const text=input.innerText.trim();if(!text)return;
    window.addTurn('user',text);input.textContent='';
    const stop=document.createElement('button');stop.setAttribute('data-testid','stop-button');stop.textContent='Stop';form.appendChild(stop);
    setTimeout(()=>{window.addTurn('assistant','自动回答：'+text);stop.remove()},140);
  });
 }''',mode)
 await p.evaluate('''()=>{window.addTurn('user','之前的问题');window.addTurn('assistant','之前的回答')}''')
 for f in ['relay_core.js','content.js']:
  await p.add_script_tag(content=(ROOT/f).read_text())
 return p

async def snap(p):
 return await p.evaluate('''()=>new Promise(resolve=>window.__relayListener({type:'SNAPSHOT'},null,resolve))''')

async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for mode,expected in [('legacy','legacy'),('new','chat-work-units'),('fallback','chat-work-fallback')]:
   p=await setup_page(browser,mode)
   s=await snap(p)
   assert s['selectorMode']==expected,(mode,s)
   assert s['userCount']==1 and s['assistantCount']==1,(mode,s)
   if mode in ('new','fallback'): assert s['lastUserKey'] and s['lastAssistantKey'],(mode,s)
   assert s['text']=='之前的回答' and s['userText']=='之前的问题',(mode,s)
   assert s['lastSpeakerAssistant'],(mode,s)
   result=await p.evaluate('''()=>new Promise(resolve=>window.__relayListener({type:'SEND_TEXT',text:'测试中文\\n第二行'},null,resolve))''')
   assert result['ok'],(mode,result)
   await p.wait_for_timeout(250)
   s2=await snap(p)
   assert s2['userCount']==2 and s2['assistantCount']==2,(mode,s2)
   assert ''.join(s2['text'].split())==''.join(('自动回答：测试中文'+'第二行').split()),(mode,s2)
   assert ''.join(s2['userText'].split())=='测试中文第二行',(mode,s2)
   assert s2['lastSpeakerAssistant'] and not s2['busy'],(mode,s2)
   if mode in ('new','fallback'):
    assert s2['lastUserKey'] != s['lastUserKey'] and s2['lastAssistantKey'] != s['lastAssistantKey'],(mode,s2)
    await p.evaluate("() => {const root=document.getElementById('thread'); root.firstElementChild.remove(); root.firstElementChild.remove();}")
    s3=await snap(p)
    assert s3['userCount']==1 and s3['assistantCount']==1,(mode,s3)
    assert s3['lastUserKey']==s2['lastUserKey'] and s3['lastAssistantKey']==s2['lastAssistantKey'],(mode,s3)
   print(mode,'PASS',s2['selectorMode'],s2['userCount'],s2['assistantCount'],s2['text'])
   await p.close()
  await browser.close()

if __name__=='__main__':asyncio.run(run())
