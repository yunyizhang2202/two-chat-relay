"""Standalone popup UI test with a mocked Chrome extension API; does not access ChatGPT."""
from pathlib import Path
from playwright.sync_api import sync_playwright

source=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context(viewport={"width":520,"height":800},device_scale_factor=1)
    ctx.add_init_script('''
      window.__calls=[];window.__prefsStore={};
      window.__state={running:false,error:'',lastEvent:'尚未开始',sent:0,limit:1000};
      window.chrome={storage:{local:{get:async key=>({[key]:window.__prefsStore[key]}),set:async object=>{Object.assign(window.__prefsStore,object);}}},runtime:{getURL:x=>'chrome-extension://fake/'+x,sendMessage:async m=>{
        window.__calls.push(m);
        if(m.type==='GET_STATE')return {ok:true,data:window.__state};
        if(m.type==='START'){
          window.__state={running:true,error:'',lastEvent:'正在等待 A 回复',sent:0,limit:m.limit,
          mode:m.mode,lengthPolicy:m.lengthPolicy,lengthCap:m.lengthCap,aId:m.aId,bId:m.bId};
          return {ok:true,data:window.__state};
        }
        if(m.type==='STOP'){
          window.__state={...window.__state,running:false,error:'',lastEvent:'已停止'};
          return {ok:true,data:window.__state};
        }
        if(m.type==='DIAGNOSE')return {ok:true,data:{note:'模拟环境，无真实对话'}};
        return {ok:true,data:{}};
      }},tabs:{query:async()=>[
         {id:1,url:'https://chatgpt.com/c/test-A',title:'测试1 - ChatGPT'},
         {id:2,url:'https://chatgpt.com/c/test-B',title:'测试2 - ChatGPT'},
         {id:3,url:'https://chatgpt.com/c/test-C',title:'长标题的第三个 ChatGPT 对话'}
      ],create:async ({url})=>({id:4,url})}};
    ''')
    page=ctx.new_page()
    page.on('dialog',lambda dialog:dialog.accept())
    page.goto('about:blank')
    page.set_content((source/'popup.html').read_text(encoding='utf-8'))
    page.add_style_tag(content=(source/'style.css').read_text(encoding='utf-8'))
    page.add_script_tag(content=(source/'popup.js').read_text(encoding='utf-8'))
    page.wait_for_function('document.getElementById("a").options.length===4')
    assert page.locator('#a').input_value()=='1'
    assert page.locator('#b').input_value()=='2'
    assert page.locator('#mode').input_value()=='free'
    assert page.locator('#limit').input_value()=='1000'
    assert not page.locator('#advanced').get_attribute('open')
    assert page.locator('#capControl').is_hidden()
    assert page.locator('#start').is_visible()
    assert page.locator('#stop').is_disabled()
    page.screenshot(path='/mnt/data/two_chat_relay_v013_ui.png')
    # Presets must set actual numeric backend input, not just decorate a button.
    for choice in ['10','100','1000','0']:
      page.locator(f'.preset[data-limit="{choice}"]').click()
      assert page.locator('#limit').input_value()==choice
      assert page.locator(f'.preset[data-limit="{choice}"]').get_attribute('aria-pressed')=='true'
    page.locator('#limit').fill('2000')
    page.wait_for_function('window.__prefsStore.twoChatRelayUiPrefs?.limit === "2000"')
    assert not page.locator('.preset.selected').count()
    # Swap should target different tabs, preserving the two selected ids.
    page.locator('#swap').click()
    assert (page.locator('#a').input_value(),page.locator('#b').input_value())==('2','1')
    page.locator('#swap').click()
    # Length settings remain operational despite being hidden by default.
    page.locator('#advanced summary').click()
    page.locator('#lengthPolicy').select_option('cap')
    assert page.locator('#capControl').is_visible()
    page.locator('#lengthCap').fill('4500')
    page.locator('#mode').select_option('autonomous')
    page.locator('#start').click()
    page.wait_for_function('window.__calls.some(m=>m.type==="START")')
    m=page.evaluate('window.__calls.filter(m=>m.type==="START").at(-1)')
    assert (m['aId'],m['bId'],m['limit'],m['mode'],m['lengthPolicy'],m['lengthCap'])==(1,2,2000,'autonomous','cap',4500),m
    assert page.locator('#start').is_disabled()
    assert page.locator('#stop').is_enabled()
    assert page.locator('#headline').inner_text()=='正在聊天'
    assert page.evaluate('window.__prefsStore.twoChatRelayUiPrefs.mode')=='autonomous'
    page.locator('#stop').click()
    page.wait_for_function('window.__calls.some(m=>m.type==="STOP")')
    assert page.locator('#start').is_enabled()
    page.locator('#diagnose').click()
    assert page.locator('#diagnostic').is_visible()
    assert '模拟环境' in page.locator('#diagnostic').inner_text()
    page.locator('#lengthPolicy').select_option('free')
    assert page.locator('#capControl').is_hidden()
    print('PASS: two-tab selection, swap, modes, 10/100/1000/0, custom 2000, advanced length, start/stop, diagnose')
    ctx.close();browser.close()
