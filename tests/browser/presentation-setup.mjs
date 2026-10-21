// Optional isolated browser suite. Requires a separately installed Playwright + Chromium.
// Start a production preview first; no real OS notification is emitted.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const previewBase = process.env.BUBU_PREVIEW_URL || 'http://127.0.0.1:5210'

const browser=await chromium.launch({headless:true});try {
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',permissions:['notifications']});const page=await context.newPage();
 await context.addInitScript(()=>{
  if(location.protocol !== 'https:' && location.protocol !== 'http:') return
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

const origin='https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app';
await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/shopping');await page.locator('[data-shopping-item-id="qa-0"]').waitFor();
await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('items').flushPersistence());
const setup=await context.newPage();await setup.goto(origin+'/?demoSetup=1');
await setup.getByRole('heading',{name:'期末展示資料',exact:true}).waitFor();
assert.equal(await setup.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia),undefined);
const before=await setup.evaluate(()=>localStorage.getItem('home-restock:v1:items'));
const reset=()=>setup.getByRole('button',{name:'恢復六項展示初始資料',exact:true});
await reset().click();await setup.getByText('請先關閉其他補補分頁，再重試。',{exact:true}).waitFor();
assert.equal(await setup.evaluate(()=>localStorage.getItem('home-restock:v1:items')),before);
await page.close();
assert.equal(await setup.getByRole('checkbox').count(),0);
let confirmations=0; setup.on('dialog',()=>confirmations++);
setup.once('dialog',dialog=>dialog.dismiss());await reset().click();
await setup.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.disabled));
assert.equal(await setup.evaluate(()=>localStorage.getItem('home-restock:v1:items')),before);
assert.equal(await setup.evaluate(()=>localStorage.getItem('home-restock:v1:presentation-backup')),null);
setup.once('dialog',dialog=>dialog.accept());await reset().click();
await setup.waitForURL('**/shopping?notificationDemo=1');
const fresh=await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data);
assert.equal(fresh.items.length,6);assert.equal(fresh.spaces.length,2);assert.deepEqual(fresh.spaces[1].members.map(m=>m.name),['花花']);
assert.equal(await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:presentation-backup')).before.items),before);
assert.equal(confirmations,2); // one cancelled attempt plus one successful reset; no download gate.
await setup.getByRole('button',{name:'啟用通知展示模式',exact:true}).click();
const padId=fresh.items.find(i=>i.name==='衛生棉').id;
const card=()=>setup.locator('[data-shopping-item-id="'+padId+'"]');
await card().locator('.item-expand').click();await card().locator('.snooze-reminder-button').click();await setup.getByRole('button',{name:'儲存',exact:true}).click();
await setup.waitForTimeout(6000);
assert.equal(await setup.evaluate(()=>window.__testNotifications.length),1);
await setup.reload();await card().waitFor();
assert.deepEqual(await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.map(i=>i.id)),fresh.items.map(i=>i.id));
assert.equal(await setup.evaluate(async id=>(await document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').demo(id)).ok,padId),true);
await setup.goto(origin+'/?demoSetup=1');
const [download]=await Promise.all([setup.waitForEvent('download'),setup.getByRole('button',{name:'下載目前資料備份',exact:true}).click()]);assert.ok(download.suggestedFilename().endsWith('.json'));
setup.once('dialog',dialog=>dialog.accept());await reset().click();await setup.waitForURL('**/shopping?notificationDemo=1');
const newer=await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data);
assert.ok(newer.items.every(i=>!fresh.items.some(old=>old.id===i.id)));
assert.deepEqual(await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:native-notifications')).data.tasks),[]);
await setup.goto(origin+'/?demoSetup=1');setup.once('dialog',dialog=>dialog.accept());
await setup.getByRole('button',{name:'還原上次操作前的資料',exact:true}).click();await setup.waitForURL('**/shopping?notificationDemo=1');
await setup.locator('[data-shopping-item-id="'+padId+'"]').waitFor();
assert.deepEqual(await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.map(i=>i.id)),fresh.items.map(i=>i.id));
assert.equal(await setup.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:native-notifications')).data.tasks.some(task=>task.demo)),false);
assert.equal(confirmations,4);
const production=await context.newPage();await context.route('https://home-restock-app.vercel.app/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});
await production.goto('https://home-restock-app.vercel.app/?demoSetup=1');await production.getByText(/此網址不允許初始化展示資料/).waitFor();assert.equal(await production.getByRole('button',{name:'恢復六項展示初始資料',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('PASS quick setup UI: occupied tab refusal, cancelled confirmation untouched, one confirmation + automatic local backup without download, automatic App return, optional backup download, repeated reset, old tasks cleared, backup restore, Production blocked, 5-second notification preserved');
await context.unrouteAll({behavior:'wait'});await context.close();}finally{await browser.close()}
