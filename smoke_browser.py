"""Local browser acceptance checks against the actual generated dataset."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

def run(url='http://127.0.0.1:8873', out='/tmp/pullback-check'):
 Path(out).mkdir(exist_ok=True,parents=True)
 with sync_playwright() as p:
  browser=p.chromium.launch()
  page=browser.new_page(viewport={'width':1440,'height':1050});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url);page.wait_for_selector('#universeTable tbody tr[data-symbol]')
  assert '54/54' in page.locator('#quality').inner_text()
  assert page.locator('#universeTable tbody tr[data-symbol]').count()==54
  page.screenshot(path=out+'/desktop.png',full_page=True);page.screenshot(path=out+'/desktop-viewport.png')
  page.locator('#holdings').fill('CNX1 40\nVUAG 60');page.locator('#portfolioValue').fill('10000');
  page.locator('#search').fill('CNX1');assert page.locator('#universeTable tbody tr[data-symbol]').count()==1
  page.locator('#universeTable tbody tr').first.click();assert page.locator('#inspector').evaluate('(e)=>e.open')
  assert 'Cost of waiting' in page.locator('#detail').inner_text();assert 'Retain new cash' in page.locator('#detail').inner_text()
  page.screenshot(path=out+'/inspector.png')
  page.locator('#saveAsset').click();assert 'Saved' in page.locator('#saveAsset').inner_text();page.keyboard.press('Escape')
  page.locator('#search').fill('');page.locator('#research').check();assert page.locator('#universeTable th').count()==9
  page.locator('#asof').fill('2020-03-21');page.locator('#asof').dispatch_event('change')
  assert 'Historic research' in page.locator('#replayNote').inner_text()
  page.locator('#universeTable tbody tr').first.click();assert 'Full-sample research is hidden' in page.locator('#detail').inner_text();page.keyboard.press('Escape')
  page.locator('#today').click();page.locator('#mapMode').select_option('tension')
  assert page.locator('#scatter svg').count()==1
  with page.expect_download() as event:page.locator('#export').click()
  assert event.value.suggested_filename.endswith('.csv')
  page.set_viewport_size({'width':390,'height':844});page.goto(url);page.wait_for_selector('#universeTable tbody tr[data-symbol]')
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path=out+'/mobile.png',full_page=True);page.screenshot(path=out+'/mobile-viewport.png')
  page.locator('#heatmap button').first.click();assert page.locator('#inspector').evaluate('(e)=>e.open');page.screenshot(path=out+'/mobile-inspector.png')
  assert not errors,errors
  browser.close();print(json.dumps({'browser_errors':errors,'passed':'desktop, mobile, search, drawer, watchlist, replay, tension map, CSV, overflow'}))
if __name__=='__main__':
 import sys
 run(*sys.argv[1:])
