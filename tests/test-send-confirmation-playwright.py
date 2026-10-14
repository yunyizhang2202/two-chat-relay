"""Offline tab-switch / message-count regression tests. Does NOT access chatgpt.com."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
import runpy
_modules = runpy.run_path(str(Path(__file__).resolve().parent / "test-new-layout-playwright.py"))
setup_page = _modules["setup_page"]
snap = _modules["snap"]

ROOT=Path(__file__).resolve().parent.parent

async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for mode in ('new','fallback'):
   page=await setup_page(browser,mode)
   # Before: one user + one assistant. After click, remove old history nodes,
   # keeping the visible count at ONE despite a successful new user send.
   await page.evaluate('''()=>{document.querySelector('form').addEventListener('submit',()=>{
      const root=document.getElementById('thread');
      root.firstElementChild?.remove();root.firstElementChild?.remove();
   });}''')
   other=await browser.new_page()
   await page.bring_to_front()
   before=await snap(page)
   await page.evaluate('''()=>{window.__pendingSend=new Promise(resolve=>window.__relayListener(
     {type:'SEND_TEXT',text:'长内容自动发送中文测试'},null,resolve))}''')
   await other.bring_to_front()  # target page is now in the background
   res=await page.evaluate('window.__pendingSend')
   assert res['ok'], (mode, res)
   after=await snap(page)
   assert after['userCount']==before['userCount']==1,(mode,before,after)
   assert after['lastUserKey']!=before['lastUserKey'],(mode,before,after)
   assert after['userText']=='长内容自动发送中文测试',(mode,after)
   print('PASS',mode,'tab switch + unchanged DOM count + new user key + matching content')
   await other.close();await page.close()
  # Send INTO a page that is already in the background (the user's main case).
  for mode in ('legacy','new','fallback'):
   page=await setup_page(browser,mode)
   foreground=await browser.new_page()
   await foreground.bring_to_front()
   res=await page.evaluate('''()=>new Promise(resolve=>window.__relayListener(
      {type:'SEND_TEXT',text:'后台标签页直接发送测试'},null,resolve))''')
   assert res['ok'],(mode,res)
   after=await snap(page)
   assert after['userText']=='后台标签页直接发送测试',(mode,after)
   print('PASS',mode,'send into already-background tab')
   await foreground.close();await page.close()
  # A click that is ignored by the page MUST NOT turn into a success or auto retry.
  page=await setup_page(browser,'new')
  await page.evaluate('''()=>{const form=document.querySelector('form');
    form.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
    window.__clicks=0;document.querySelector('[data-testid="send-button"]').addEventListener('click',()=>window.__clicks++); }''')
  res=await page.evaluate('''()=>new Promise(resolve=>window.__relayListener(
      {type:'SEND_TEXT',text:'绝不能重复发送'},null,resolve))''')
  assert not res['ok'] and '无法确认' in res['error'],res
  clicks=await page.evaluate('window.__clicks')
  assert clicks==1,clicks
  print('PASS ignored-click safety: one click, no false confirmation, no retry')
  await page.close();await browser.close()

if __name__=='__main__':asyncio.run(run())
