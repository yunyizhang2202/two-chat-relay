"""Optional browser integration test. No ChatGPT account or network needed."""
import asyncio, tempfile, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
async def main():
  with tempfile.TemporaryDirectory(prefix='relay-ctx-') as temp:
    async with async_playwright() as p:
      context=await p.chromium.launch_persistent_context(
        temp,executable_path='/usr/bin/chromium',headless=os.environ.get('RELAY_HEADLESS', '1') == '1',
        args=['--no-sandbox','--disable-dev-shm-usage',
              '--disable-extensions-except='+str(ROOT),
              '--load-extension='+str(ROOT)])
      try:
        worker=None
        for _ in range(30):
          workers=context.service_workers
          if workers:
            worker=workers[0];break
          await asyncio.sleep(.3)
        if worker is None:
          print('SKIPPED: Chromium environment did not load extension worker.')
          return
        extension_id=worker.url.split('/')[2]
        print('Loaded extension worker', extension_id)
        a=await context.new_page();b=await context.new_page()
        await a.goto(f'chrome-extension://{extension_id}/demo.html?side=A')
        await b.goto(f'chrome-extension://{extension_id}/demo.html?side=B')
        for page in (a,b):
          # Populate an established user+assistant turn, as required in ChatGPT.
          await page.evaluate('''() => {
            const main=document.querySelector('#messages');
            const user=document.createElement('article');user.setAttribute('data-message-author-role','user');
            user.innerHTML='<div class="markdown">演示页的历史用户消息</div>';
            const bot=document.createElement('article');bot.setAttribute('data-message-author-role','assistant');
            bot.innerHTML='<div class="markdown">演示页的历史助手回答</div>';
            main.append(user,bot);
          }''')
        await asyncio.sleep(.3)
        popup=await context.new_page()
        await popup.goto(f'chrome-extension://{extension_id}/popup.html')
        await popup.locator('#refresh').click()
        await popup.locator('#mode').select_option('autonomous')
        tabs=await popup.evaluate('''async () => {
          const t=await chrome.tabs.query({});return t.filter(x=>x.url?.includes('/demo.html')).map(x=>({id:x.id,url:x.url}));
        }''')
        a_id=next(t['id'] for t in tabs if 'side=A' in t['url'])
        b_id=next(t['id'] for t in tabs if 'side=B' in t['url'])
        await popup.locator('#a').select_option(str(a_id))
        await popup.locator('#b').select_option(str(b_id))
        await popup.locator('#limit').fill('2')
        await popup.locator('#start').click()
        for _ in range(130):
          state=await popup.evaluate('''async () => (await chrome.runtime.sendMessage({type:'GET_STATE'})).data''')
          if not state['running']:
            break
          await asyncio.sleep(.35)
        else:
          raise AssertionError('Flow did not stop after 45 seconds')
        textsA=await a.locator('#messages article').all_text_contents()
        textsB=await b.locator('#messages article').all_text_contents()
        print('state=',{k:state.get(k) for k in ['mode','running','sent','error','lastEvent']})
        print('A turns',len(textsA),'B turns',len(textsB))
        assert state['sent']==2, 'Expected two relays after autonomous opener'
        assert state['error']=='', 'Safety pause unexpectedly triggered'
        assert len(textsA)>2 and len(textsB)>2
        print('PASS: opener -> A reply -> B -> A; automatic stop')
      finally:
        await context.close()

if __name__=='__main__':
  asyncio.run(main())
