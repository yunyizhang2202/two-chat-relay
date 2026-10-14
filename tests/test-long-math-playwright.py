"""Offline full-length rich math user-bubble confirmation; no ChatGPT traffic."""
import asyncio,runpy
from pathlib import Path
from playwright.async_api import async_playwright
m=runpy.run_path(str(Path(__file__).resolve().parent/'test-new-layout-playwright.py'))
setup_page=m['setup_page']

async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  longtext=('An independently meaningful scientific statement about uncertainty and experimental evidence. ' * 150
    +' Consider \\(h(x)\\) and \\(W_1\\) and \\(W_2\\). The last sentence must arrive unmodified.')
  assert len(longtext)>12000
  for mode in ['new','fallback','legacy']:
   p=await setup_page(browser,mode)
   await p.evaluate('''()=>{
     const original=window.addTurn;
     window.__sent=0;
     window.addTurn=(role,text)=>{
       original(role,text);
       if(role!=='user')return;
       window.__sent++;
       const root=document.getElementById('thread');
       const wrap=root.lastElementChild;
       const bubble=wrap.querySelector('[data-user-message-bubble="true"],.markdown')||wrap;
       const fragments=text.split(/(\\\\\\([^]*?\\\\\\))/g);
       bubble.textContent='';
       for(const frag of fragments){
         const match=/^\\\\\\(([^]*?)\\\\\\)$/.exec(frag);
         if(!match){bubble.appendChild(document.createTextNode(frag));continue;}
         const katex=document.createElement('span');katex.className='katex';
         const math=document.createElement('math');math.setAttribute('alttext',match[1]);
         const ann=document.createElement('annotation');ann.setAttribute('encoding','application/x-tex');ann.textContent=match[1];math.appendChild(ann);
         const screenReader=document.createElement('span');screenReader.className='sr-only';screenReader.appendChild(math);katex.appendChild(screenReader);
         const visual=document.createElement('span');visual.setAttribute('aria-hidden','true');visual.textContent=match[1];katex.appendChild(visual);
         bubble.appendChild(katex);
       }
       const button=document.createElement('button');button.textContent='展开全文';bubble.appendChild(button);
     };
   }''')
   result=await p.evaluate('''text=>new Promise(resolve=>window.__relayListener({type:'SEND_TEXT',text},null,resolve))''',longtext)
   assert result['ok'],(mode,result)
   assert await p.evaluate('window.__sent')==1,mode
   assert await p.evaluate('document.querySelectorAll(".katex").length') == 3,mode
   snapshot=await m['snap'](p)
   assert r'\(h(x)\)' in snapshot['userText'],(mode,snapshot['userText'][-250:])
   print('PASS 12k+ rich formula, UI control, no duplicate',mode,'sent',len(longtext),'read',len(snapshot['userText']))
   await p.close()
  p=await setup_page(browser,'new')
  await p.evaluate('''()=>{const orig=window.addTurn;window.__sent=0;
    window.addTurn=(role,text)=>{orig(role,role==='user'?text.slice(0,-400):text);if(role==='user')window.__sent++;};}''')
  # Speed up negative test for this offline fixture only by making the misrender stable.
  result=await p.evaluate('''text=>new Promise(resolve=>window.__relayListener({type:'SEND_TEXT',text},null,resolve))''','A'*8000)
  assert result['ok'] is False,result
  assert await p.evaluate('window.__sent')==1
  print('PASS genuine 400-character truncation rejected, no resend')
  await p.close()
  await browser.close()
if __name__=='__main__':asyncio.run(run())
