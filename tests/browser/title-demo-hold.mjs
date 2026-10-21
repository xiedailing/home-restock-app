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
const origin=process.env.BUBU_DEMO_ORIGIN || 'https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app';
await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});
const state=()=>page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').demoEnabled);
const jobs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:native-notifications')||'{"data":{"tasks":[]}}').data.tasks.filter(t=>t.demo));
const title=()=>page.locator('#shopping-title');
const hold=async(duration=3100)=>{const b=await title().boundingBox();await page.mouse.move(b.x+10,b.y+10);await page.mouse.down();await page.waitForTimeout(duration);await page.mouse.up()};
console.log('STEP initial');await page.goto(origin+'/shopping');await title().waitFor();
assert.equal(await page.getByRole('button',{name:'啟用通知展示模式',exact:true}).count(),0);assert.equal(await state(),false);
await title().click();await title().dblclick();await hold(1200);assert.equal(await state(),false);
let b=await title().boundingBox();await page.mouse.move(b.x+10,b.y+10);await page.mouse.down();await page.mouse.move(5,5);await page.waitForTimeout(3100);await page.mouse.up();assert.equal(await state(),false);
await page.setViewportSize({width:390,height:844});
const cdp=await context.newCDPSession(page);b=await title().boundingBox();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+10,y:b.y+10}]});await page.waitForTimeout(200);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+10,y:b.y+80}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(3100);assert.equal(await state(),false);
await page.evaluate(()=>scrollTo(0,0));b=await title().boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+10,y:b.y+10}]});await page.waitForTimeout(3100);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await state(),false);
await hold();assert.equal(await state(),true);await page.getByText('通知展示模式已啟用',{exact:true}).waitFor();assert.equal(new URL(page.url()).search,'');assert.equal((await jobs()).length,0);
console.log('STEP reload');await page.reload();await title().waitFor();assert.equal(await state(),true);
console.log('STEP other tab');const other=await context.newPage();await other.goto(origin+'/shopping');await other.locator('#shopping-title').waitFor();assert.equal(await other.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').demoEnabled),false);await other.close();
const card=()=>page.locator('[data-shopping-item-id="qa-0"]');
const open=async()=>{if(await card().locator('.item-expand').getAttribute('aria-expanded')!=='true')await card().locator('.item-expand').click();await card().locator('.snooze-reminder-button').click()};
const save=async()=>{if(await page.getByRole('button',{name:'確認',exact:true}).count())await page.getByRole('button',{name:'後一天',exact:true}).click();await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('button',{name:'取消延後',exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('dialog.bottom-sheet[open] button')].some(button=>button.textContent.trim()==='儲存'&&button.disabled));assert.equal(await page.locator('dialog.bottom-sheet[open]').count(),1);await page.keyboard.press('Escape');await page.waitForFunction(()=>![...document.querySelectorAll('dialog.bottom-sheet')].some(d=>d.open))};
console.log('STEP first save');await open();assert.equal((await jobs()).length,0);await save();let scheduled=await jobs();assert.equal(scheduled.filter(t=>t.state==='scheduled').length,1);assert.equal(scheduled[0].dueAt-scheduled[0].createdAt,5000);
const formal=await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.find(i=>i.id==='qa-0').reminderSnoozes.self);
await page.evaluate(()=>scrollTo(0,0));await hold();console.log('STEP off');assert.equal(await state(),false);await page.getByText('通知展示模式已關閉',{exact:true}).waitFor();assert.equal((await jobs()).filter(t=>t.state==='scheduled').length,0);
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.find(i=>i.id==='qa-0').reminderSnoozes.self),formal);
await open();await save();assert.equal((await jobs()).length,1);
await page.evaluate(()=>scrollTo(0,0));b=await title().boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+10,y:b.y+10}]});await page.waitForTimeout(3100);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await state(),true);
console.log('STEP second send');await open();await save();await page.waitForTimeout(6000);const notices=await page.evaluate(()=>window.__testNotifications.map(n=>n.data.url));assert.equal(notices.length,1);
await page.evaluate(url=>window.__swMessage({data:{type:'bubu-notification-click',url}}),notices[0]);await card().locator('.item-expand[aria-expanded="true"]').waitFor();await page.waitForFunction(()=>!new URL(location.href).searchParams.has('notificationItem'));await page.waitForTimeout(700);
console.log('STEP navigation');await page.locator('nav').getByRole('link',{name:'我的用品',exact:true}).click();try{await page.waitForURL('**/inventory',{timeout:5000})}catch(error){console.log('NAV DIAGNOSTIC',await page.evaluate(()=>({url:location.href,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({cls:d.className,modal:d.matches(':modal')})),router:document.querySelector('#app').__vue_app__.config.globalProperties.$router.currentRoute.value.fullPath})));throw error}
await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/shopping'));await title().waitFor();await title().focus();await page.keyboard.down('Space');await page.waitForTimeout(3100);await page.keyboard.up('Space');assert.equal(await state(),false);
console.log('STEP permission');await page.evaluate(()=>{const pinia=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;pinia._s.get('notification-settings').setPushEnabled(false);Notification.permission='default';Notification.requestPermission=async()=>{window.__requestActivation=navigator.userActivation.isActive;window.__requestCount=(window.__requestCount||0)+1;Notification.permission='granted';return 'granted'}});
await page.evaluate(()=>scrollTo(0,0));await hold();assert.equal(await state(),true);assert.equal(await page.evaluate(()=>window.__requestCount),1);assert.equal(await page.evaluate(()=>window.__requestActivation),true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:notifications')).data.pushEnabled),false);await hold();assert.equal(await state(),false);
await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('notification-settings').setPushEnabled(true));
await page.evaluate(()=>{window.__Permission=Notification;Notification.permission='denied'});await hold();assert.equal(await state(),true);await page.getByText('尚未允許系統通知，請在瀏覽器網站設定中允許通知。',{exact:true}).waitFor();await open();await save();assert.equal((await jobs()).filter(t=>t.state==='scheduled').length,0);
const production='https://unknown-bubu-origin.vercel.app';await context.route(production+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});await page.goto(production+'/shopping');await title().waitFor();await hold();assert.equal(await state(),false);assert.equal(await title().getAttribute('tabindex'),null);
assert.deepEqual(errors,[]);console.log('PASS hidden title hold: mouse + touch + keyboard, no URL, early release/click/leave/scroll/cancel, start only after save, stop cancels with formal date retained, one 5-second delivery + click + navigation, denied permission, Unknown origin blocked');
await context.unrouteAll({behavior:'wait'});await context.close();}finally{await browser.close()}
