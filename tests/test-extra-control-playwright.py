"""Regression: long user bubbles can render extra control labels. Offline only."""
import asyncio,runpy
from pathlib import Path
from playwright.async_api import async_playwright
m=runpy.run_path(str(Path(__file__).resolve().parent/'test-new-layout-playwright.py'))
setup_page=m['setup_page']
async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for mode in ['new','fallback','legacy']:
   p=await setup_page(browser,mode)
   await p.evaluate('''() => {
      const original=window.addTurn;
      window.addTurn=(role,text)=>{
       original(role,text);
       if(role==='user'){
        const root=document.getElementById('thread');
        const turn=root.lastElementChild;
        const bubble=turn.querySelector('[data-user-message-bubble="true"],.markdown')||turn;
        const extra=document.createElement('button');extra.setAttribute('role','button');
        extra.textContent='展开全文请点击'; // 7 UI chars that are NOT part of prompt
        bubble.appendChild(extra);
       }
      };
   }''')
   expected='这是一段较长的中文文本。'*19 + '## 标题\n重点。' + '甲'*156
   result=await p.evaluate('''t=>new Promise(resolve=>window.__relayListener({type:'SEND_TEXT',text:t},null,resolve))''',expected)
   assert result['ok'], (mode,result)
   assert result['confirmation']=='exact-text', (mode,result)
   raw=await p.evaluate('''() => {const turn=document.getElementById('thread').lastElementChild.previousElementSibling;
    const bubble=turn.querySelector('[data-user-message-bubble="true"],.markdown')||turn;
    return bubble.innerText.trim();}''')
   assert len(expected)==393 and len(raw)==400,(len(expected),len(raw))
   print('PASS bubble control stripped',mode,'sent',len(expected),'visible',len(raw))
   await p.close()
  await browser.close()
if __name__=='__main__': asyncio.run(run())
