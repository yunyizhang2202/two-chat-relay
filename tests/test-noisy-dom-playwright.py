"""Regression: unrelated DOM noise must not starve delivery after answer settles."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    d = Path(__file__).resolve().parent.parent
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        p = await b.new_page()
        html=(d/'demo.html').read_text().split('<script src=')[0]+'</body></html>'
        await p.set_content(html)
        await p.evaluate('''() => {
            window.__candidates = [];
            window.chrome={runtime:{onMessage:{addListener:fn=>window.__relayListener=fn},sendMessage:async m=>{if(m.type==='CANDIDATE')window.__candidates.push({at:Date.now(),text:m.snapshot.text}); return {ok:true};}}};
        }''')
        for f in ['demo.js','relay_core.js','content.js']:
            await p.add_script_tag(content=(d/f).read_text())
        await p.evaluate('''() => {
            let node = document.createElement('div');node.id='independent-live-ui';document.body.append(node);
            window.__noise = setInterval(()=>node.textContent=String(Date.now()),80);
        }''')
        res=await p.evaluate('''() => new Promise(resolve=>window.__relayListener({type:'SEND_TEXT',text:'请回答：你好'},null,resolve))''')
        assert res['ok'], res
        await p.wait_for_function('window.__candidates.length>=1',timeout=8500)
        candidates=await p.evaluate('window.__candidates')
        assert len(candidates)==1, candidates
        assert '请回答：你好' in candidates[0]['text'], candidates
        print('PASS: unrelated page DOM changes did not starve response delivery; forwards=',len(candidates))
        await p.evaluate('clearInterval(window.__noise)')
        await b.close()

asyncio.run(main())
