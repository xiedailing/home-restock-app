// Optional isolated browser suite. Requires a separately installed Playwright + Chromium.
// Start a production preview first; no real OS notification is emitted.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const previewBase = process.env.BUBU_PREVIEW_URL || 'http://127.0.0.1:5210'

const browser=await chromium.launch({headless:true});try {
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',permissions:['notifications']});const page=await context.newPage();
 await context.addInitScript(()=>{
  if(localStorage.getItem('rwd-seeded'))return
  const save=(name,data)=>localStorage.setItem('home-restock:v1:'+name,JSON.stringify({version:2,data}))
  const names=['衛生紙','洗衣精','垃圾袋','洗碗精','酒精','沐浴乳','廚房紙巾','牙膏','洗髮精','海綿','清潔用品測試名稱','寵物用品']
  const items=names.map((name,i)=>({id:'qa-'+i,catalogId:i===0?'preset:tissues':null,name:i===6?'衛生紙':name,category:'生活日用品',unit:'包',spaceId:i<6?'personal':'family',iconKey:'tissues',quantity:1,inShoppingList:true,shoppingClaimantId:null,reminderEnabled:true,unitPeriodId:'period-'+i,restockRecords:[{id:'r'+i,date:'2026-10-01',quantity:1,unit:'包',unitPeriodId:'period-'+i}]}))
  save('items',{items,spaces:[{id:'personal',name:'個人',shared:false,members:[]},{id:'family',name:'家庭',shared:true,members:[{id:'m1',name:'小明'}]}],customCategories:['空分類','測試分類'],departedSpaces:[],demoSeeds:['family-unclaimed-alcohol-v1']})
  save('shared-notifications',{records:Array.from({length:8},(_,i)=>({id:'notice-'+i,type:'claimed',source:'event',spaceId:'family',recipientIds:['self'],createdAt:Date.now()-i*86400000,itemIds:['qa-6'],message:'小明已認領「家庭」的清潔用品測試名稱。',recipientState:{self:{read:i%2===0,seen:false}}})),pendingBatches:[],processedEventIds:[],previewHistorySeeded:true})
  localStorage.setItem('rwd-seeded','true')
 })

await context.addInitScript(()=>{
 window.__testNotifications=[];
 Object.defineProperty(window,'Notification',{configurable:true,value:class { static permission='granted';static async requestPermission(){return 'granted'} }});
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{
  addEventListener(type,handler){if(type==='message')window.__swMessage=handler},removeEventListener(){},
  async register(){return {active:true,async showNotification(title,options){window.__testNotifications.push({title,...options,close(){}})}}},
  async getRegistration(){return {async getNotifications(){return window.__testNotifications}}}
 }});
});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const origin='https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app';
await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());const response=await context.request.get(previewBase+u.pathname+u.search);await route.fulfill({response})});
const card=id=>page.locator('[data-shopping-item-id="'+id+'"]');
const open=async id=>{await card(id).locator('.item-expand').click();await card(id).locator('.snooze-reminder-button').click()};
const save=async()=>{if(await page.getByRole('button',{name:'確認',exact:true}).count())await page.getByRole('button',{name:'後一天',exact:true}).click();await page.getByRole('button',{name:'儲存',exact:true}).evaluate(el=>{el.click();el.click()});await page.getByRole('button',{name:'取消延後',exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('dialog.bottom-sheet[open] button')].some(button=>button.textContent.trim()==='儲存'&&button.disabled));assert.equal(await page.locator('dialog.bottom-sheet[open]').count(),1);await page.keyboard.press('Escape');await page.waitForFunction(()=>![...document.querySelectorAll('dialog.bottom-sheet')].some(dialog=>dialog.open))};
const tasks=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:native-notifications')).data.tasks);
const clickNotice=async url=>{await page.bringToFront();await page.evaluate(url=>window.__swMessage({data:{type:'bubu-notification-click',url}}),url);await page.waitForFunction(()=>!new URL(location.href).searchParams.has('notificationItem'))};
await page.goto(origin+'/shopping?notificationDemo=1');await page.getByRole('button',{name:'啟用通知展示模式',exact:true}).click();
assert.equal(await page.locator('.notification-demo-mode').count(),0);
await open('qa-0');
assert.equal(await page.getByText('系統通知已開啟',{exact:true}).count(),0);
assert.equal(await page.getByRole('button',{name:'Demo：5 秒後測試通知',exact:true}).count(),0);

await save();
let jobs=await tasks();assert.equal(jobs.filter(t=>t.demo&&t.state==='scheduled').length,1);
const formal=await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.find(i=>i.id==='qa-0').reminderSnoozes.self);
await open('qa-1');await save();
jobs=await tasks();assert.equal(jobs.filter(t=>t.demo&&t.state==='scheduled').length,1);
await page.getByText('日期已儲存；「衛生紙」仍有提醒等待發送。',{exact:true}).waitFor();
const other=await context.newPage();await other.goto(origin+'/settings');await other.bringToFront();
await page.waitForTimeout(6500);
let notices=await page.evaluate(()=>window.__testNotifications.map(n=>({title:n.title,body:n.body,icon:n.icon,data:n.data})));
assert.equal(notices.length,1);assert.equal(notices[0].title,'補補');assert.equal(notices[0].body,'「個人」的 衛生紙已到提醒時間！');assert.equal(notices[0].icon,'/notification-icon.png');const personalUrl=notices[0].data.url;
assert.equal(new URL(personalUrl).pathname,'/shopping');assert.equal(new URL(personalUrl).searchParams.get('notificationItem'),'qa-0');
await clickNotice(personalUrl);await card('qa-0').locator('.item-expand[aria-expanded="true"]').waitFor();await page.waitForTimeout(700);
assert.equal(await page.locator('.shopping-card.expanded').count(),1);
assert.ok(Math.abs(await card('qa-0').evaluate(el=>el.getBoundingClientRect().top)-24)<4);
assert.equal(await page.locator('dialog.bottom-sheet[open]').count(),0);
await card('qa-0').locator('.item-expand').click();await clickNotice(personalUrl);await card('qa-0').locator('.item-expand[aria-expanded="true"]').waitFor();
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.find(i=>i.id==='qa-0').reminderSnoozes.self),formal);
await page.locator('nav').getByRole('link',{name:'共享清單',exact:true}).click();await open('qa-6');await save();
await other.bringToFront();await page.waitForTimeout(6500);
notices=await page.evaluate(()=>window.__testNotifications.map(n=>({title:n.title,body:n.body,icon:n.icon,data:n.data})));
assert.equal(notices.length,2);const sharedUrl=notices[1].data.url;
await clickNotice(sharedUrl);await card('qa-6').locator('.item-expand[aria-expanded="true"]').waitFor();
assert.equal(await page.locator('nav').getByRole('link',{name:'共享清單',exact:true}).getAttribute('aria-current'),'page');
assert.equal(new URL(page.url()).searchParams.get('space'),'family');assert.equal(await page.locator('.shopping-card.expanded').count(),1);
const cold=await context.newPage();await cold.goto(sharedUrl);await cold.locator('[data-shopping-item-id="qa-6"] .item-expand[aria-expanded="true"]').waitFor();
await page.setViewportSize({width:390,height:844});await clickNotice(sharedUrl);await page.waitForTimeout(700);
assert.ok(Math.abs(await card('qa-6').evaluate(el=>el.getBoundingClientRect().top)-24)<4);

await page.reload();await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.__testNotifications.length),0);
// Stale notifications never expand a different item or fall back to another space.
const snapshot=await page.evaluate(()=>localStorage.getItem('home-restock:v1:items'));
for(const state of ['completed','removed','deleted','space-gone']){
 await page.evaluate(({snapshot,state})=>{const saved=JSON.parse(snapshot);const item=saved.data.items.find(i=>i.id===(state==='completed'?'qa-0':'qa-6'));if(state==='completed'){item.inShoppingList=false;item.shoppingCompletedAt=Date.now();item.shoppingCompletedBy='self'}if(state==='removed')item.inShoppingList=false;if(state==='deleted')saved.data.items=saved.data.items.filter(i=>i.id!=='qa-6');if(state==='space-gone')saved.data.spaces=saved.data.spaces.filter(s=>s.id!=='family');localStorage.setItem('home-restock:v1:items',JSON.stringify(saved))},{snapshot,state});
 await page.reload();await page.waitForTimeout(200);await clickNotice(state==='completed'?personalUrl:sharedUrl);
 const message=state==='completed'?'此用品已補貨，無法展開。':state==='removed'?'此用品已移出購買清單。':state==='deleted'?'此用品已不存在。':'此空間已不存在或你已退出，無法查看用品。';
 await page.getByText(message,{exact:true}).waitFor();assert.equal(await page.locator('.shopping-card.expanded').count(),0);
}
await page.evaluate(snapshot=>localStorage.setItem('home-restock:v1:items',snapshot),snapshot);await page.reload();
// Operator controls are confined to settings and can cancel a waiting test.
await page.getByRole('tab',{name:'我的清單',exact:true}).click();await open('qa-2');await save();
await page.locator('nav').getByRole('link',{name:'設定',exact:true}).click();
assert.equal(await page.getByText('展示控制',{exact:true}).count(),0);
await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/settings?notificationDemo=1'));
await page.getByText('展示控制',{exact:true}).click();
await page.getByRole('button',{name:'取消「垃圾袋」的待發送通知',exact:true}).click();
await page.waitForFunction(()=>JSON.parse(localStorage.getItem('home-restock:v1:native-notifications')).data.tasks.filter(t=>t.demo&&t.state==='scheduled').length===0);
await page.locator('nav').getByRole('link',{name:'購買清單',exact:true}).click();await open('qa-2');await save();
// Operator controls are confined to the settings page, not the presentation sheet.
await page.locator('nav').getByRole('link',{name:'設定',exact:true}).click();
assert.equal(await page.getByText('展示控制',{exact:true}).count(),0);
await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/settings?notificationDemo=1'));
await page.getByText('展示控制',{exact:true}).click();
await page.getByRole('button',{name:'結束展示並取消待發送測試',exact:true}).click();
await page.waitForFunction(()=>!sessionStorage.getItem('bubu:notification-demo-session:v1'));
await page.locator('nav').getByRole('link',{name:'購買清單',exact:true}).click();await page.getByRole('tab',{name:'我的清單',exact:true}).click();await open('qa-2');await save();
assert.equal((await tasks()).filter(t=>t.demo).length,4);
assert.equal((await tasks()).filter(t=>t.demo&&t.state==='scheduled').length,0);
assert.deepEqual(errors,[]);
console.log('PASS full UI: automatic save+double click guard, clean sheet, other pending preserved, personal/shared IDs + scroll, repeat click, cold deep link, mobile, reload no replay, hidden settings exit, normal save no demo');
await context.close();
}finally{await browser.close()}
