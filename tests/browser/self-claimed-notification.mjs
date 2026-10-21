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
  const items=names.map((name,i)=>({id:'qa-'+i,catalogId:i===0?'preset:tissues':null,name:i===6?'衛生紙':name,category:'生活日用品',unit:'包',spaceId:i<6?'personal':'family',iconKey:'tissues',quantity:1,inShoppingList:true,shoppingClaimantId:i===6?'self':null,reminderEnabled:true,unitPeriodId:'period-'+i,restockRecords:[{id:'r'+i,date:'2026-10-01',quantity:1,unit:'包',unitPeriodId:'period-'+i}]}))
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
const card=()=>page.locator('[data-shopping-item-id="qa-6"]');
await page.goto(origin+'/shopping?notificationDemo=1');await page.getByRole('button',{name:'啟用通知展示模式',exact:true}).click();
await card().locator('.item-expand').click();await card().locator('.snooze-reminder-button').click();
await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('button',{name:'確認',exact:true}).waitFor();
await page.waitForFunction(()=>window.__testNotifications.length===1,{},{timeout:15000});
const notice=await page.evaluate(()=>window.__testNotifications[0].data.url);
assert.equal(new URL(notice).searchParams.get('tab'),'personal');
const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.find(i=>i.id==='qa-6'));
const click=async url=>{await page.evaluate(url=>window.__swMessage({data:{type:'bubu-notification-click',url}}),url);await page.waitForFunction(()=>!new URL(location.href).searchParams.has('notificationItem'));await card().locator('.item-expand[aria-expanded="true"]').waitFor();await page.waitForTimeout(700)};
// Current and old shared URLs both resolve using current ownership, not stale query.
for(const url of [notice,origin+'/shopping?tab=shared&space=family&notificationSpace=family&notificationItem=qa-6',notice]){
 await click(url);assert.equal(new URL(page.url()).searchParams.get('tab'),'personal');assert.equal(await page.locator('.shopping-card.expanded').count(),1);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data.items.find(i=>i.id==='qa-6'));
 assert.equal(saved.shoppingClaimantId,'self');assert.deepEqual(saved.reminderSnoozes,original.reminderSnoozes);
 const bounds=await card().boundingBox();assert.ok(bounds.y>=0 && bounds.y+bounds.height<=900,'target card must be fully visible; final group may hit document scroll limit');
}
assert.equal(await page.locator('dialog[open]').count(),0);
await page.locator('nav .nav-btn').filter({hasText:'我的用品'}).click();await page.waitForURL('**/inventory');
await page.goto(notice);await card().locator('.item-expand[aria-expanded="true"]').waitFor();assert.equal(new URL(page.url()).searchParams.get('tab'),'personal');
await page.setViewportSize({width:390,height:844});await click(notice);
await page.reload();await page.waitForTimeout(6500);assert.equal(await page.evaluate(()=>window.__testNotifications.length),0);
console.log('PASS self-claimed shared Demo routes to my list, legacy links repaired, repeated clicks, scroll, desktop navigation, cold load, mobile and reload deduplication');
await context.unrouteAll({behavior:'wait'});await context.close();}finally{await browser.close()}
