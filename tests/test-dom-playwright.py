import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 d=Path(__file__).resolve().parent.parent
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  p=await b.new_page()
  html=(d/'demo.html').read_text(); html=html[:html.find('<script src=')]+ '</body></html>'
  await p.set_content(html)
  await p.evaluate('''window.chrome={runtime:{onMessage:{addListener:fn=>{window.__relayListener=fn}},sendMessage:async m=>({ok:true})}}''')
  for f in ['demo.js','relay_core.js','content.js']:
   await p.add_script_tag(content=(d/f).read_text())
  print('loaded',await p.evaluate('window.__twoChatRelayContentLoaded'))
  res=await p.evaluate('''()=>new Promise(resolve=>{window.__relayListener({type:'SEND_TEXT',text:'中文正文\\n第二行'},null,resolve)})''')
  print('send',res)
  print('turns',await p.locator('article.msg').count())
  print('userText',await p.locator('[data-message-author-role=user] .markdown').last.inner_text())
  await asyncio.sleep(3)
  snap=await p.evaluate('''()=>new Promise(resolve=>window.__relayListener({type:'SNAPSHOT'},null,resolve))''')
  print('snap after 3s',snap)
  await b.close()
asyncio.run(main())
