"""Checks user-facing independent length settings in a stubbed Chrome popup."""
from pathlib import Path
from playwright.sync_api import sync_playwright
source=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=browser.new_context()
 ctx.add_init_script('''
   window.__calls=[];
   window.chrome={runtime:{getURL:x=>'chrome-extension://fake/'+x,sendMessage:async m=>{
     __calls.push(m);
     if(m.type==='GET_STATE')return {ok:true,data:{running:false,error:'',lastEvent:'未开始'}};
     if(m.type==='START')return {ok:true,data:{running:true,error:'',lastEvent:'started',sent:0,limit:m.limit}};
     if(m.type==='STOP')return {ok:true,data:{running:false,error:'',lastEvent:'stopped'}};
     return {ok:true,data:{}};
   }},tabs:{query:async()=>[{id:1,url:'https://chatgpt.com/c/test-A',title:'A'},
            {id:2,url:'https://chatgpt.com/c/test-B',title:'B'}]}};
 ''')
 pg=ctx.new_page()
 pg.on('dialog',lambda d:d.accept())
 pg.goto('about:blank')
 pg.set_content((source/'popup.html').read_text())
 pg.add_style_tag(content=(source/'style.css').read_text())
 pg.add_script_tag(content=(source/'popup.js').read_text())
 pg.wait_for_function('document.getElementById("a").options.length===3')
 pg.locator('#advanced summary').click()
 assert pg.locator('#lengthPolicy').input_value()=='free'
 assert not pg.locator('#capControl').is_visible()
 pg.locator('#lengthPolicy').select_option('cap')
 assert pg.locator('#capControl').is_visible()
 pg.locator('#lengthCap').fill('4000')
 pg.locator('#mode').select_option('free')
 pg.locator('#start').click()
 pg.wait_for_function('window.__calls.some(m=>m.type==="START")')
 m=pg.evaluate('window.__calls.filter(m=>m.type==="START").at(-1)')
 assert (m['lengthPolicy'],m['lengthCap'],m['limit'])==('cap',4000,1000),m
 pg.locator('#lengthPolicy').select_option('concise')
 assert not pg.locator('#capControl').is_visible()
 pg.locator('#start').click()
 pg.wait_for_function('window.__calls.filter(m=>m.type==="START").length===2')
 m=pg.evaluate('window.__calls.filter(m=>m.type==="START").at(-1)')
 assert m['lengthPolicy']=='concise',m
 pg.locator('#lengthPolicy').select_option('free')
 pg.locator('#limit').fill('0')
 pg.locator('#start').click()
 pg.wait_for_function('window.__calls.filter(m=>m.type==="START").length===3')
 m=pg.evaluate('window.__calls.filter(m=>m.type==="START").at(-1)')
 assert m['lengthPolicy']=='free' and m['limit']==0,m
 print('PASS: popup length policy free/concise/cap, 4000 cap, 1000/0 transfers')
 ctx.close();browser.close()
