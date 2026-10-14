"""Offline regression for ChatGPT's rich-rendered user bubbles. No chatgpt.com access."""
import asyncio, runpy
from pathlib import Path
from playwright.async_api import async_playwright

m = runpy.run_path(str(Path(__file__).resolve().parent / 'test-new-layout-playwright.py'))
setup_page = m['setup_page']
snap = m['snap']

async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for mode in ('new','fallback','legacy'):
            page=await setup_page(browser,mode)
            await page.evaluate('''() => {
              const original=window.addTurn;
              window.__sentUserTurns=0;
              window.addTurn=(role,text)=>{
                if(role==='user'){
                  window.__sentUserTurns++;
                  // User bubble is visually rich-rendered: bold and heading markers vanish.
                  text=text.replace(/^##[ \\t]+/gm,'').replace(/\\*\\*/g,'');
                }
                original(role,text);
              };
            }''')
            expected='## 重要标题\n这是**重点**的一点'
            res=await page.evaluate('''text=>new Promise(done=>window.__relayListener({type:'SEND_TEXT',text},null,done))''',expected)
            assert res['ok'],(mode,res)
            assert res['confirmation']=='rendered-markdown',(mode,res)
            assert await page.evaluate('window.__sentUserTurns')==1,(mode,'unexpected duplicate')
            print('PASS rendered markdown',mode,res['confirmation'])
            await page.close()
        page=await setup_page(browser,'new')
        await page.evaluate('''() => {
          const orig=window.addTurn;
          window.__sentUserTurns=0;
          window.addTurn=(role,text)=>{
            if(role==='user'){window.__sentUserTurns++;text='这是一段不同的内容';}
            orig(role,text);
          };
        }''')
        res=await page.evaluate('''text=>new Promise(done=>window.__relayListener({type:'SEND_TEXT',text},null,done))''','## 重要标题\n这是**重点**的一点')
        assert res['ok']==False,res
        assert '不匹配' in res['error'],res
        assert await page.evaluate('window.__sentUserTurns')==1,'Must never automatically resend'
        print('PASS genuine mismatch safely pauses, no duplicate send')
        await page.close()
        await browser.close()

if __name__=='__main__': asyncio.run(main())
