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
const origin='https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app';
await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());const response=await context.request.get(previewBase+u.pathname+u.search);await route.fulfill({response})});
const state=process.env.ITEM_CONFLICT_STATE || 'removed';
await page.goto(origin+'/shopping?notificationDemo=1');
await page.getByRole('button',{name:'啟用通知展示模式',exact:true}).click();
await page.waitForTimeout(500);
if(state==='left-space') await page.locator('nav').getByRole('link',{name:'共享清單',exact:true}).click();
const id=state==='left-space'?'qa-6':'qa-0';
const other=await context.newPage();await other.goto(origin+'/shopping');
await other.waitForFunction(()=>document.querySelector('#app').__vue_app__?.config.globalProperties.$pinia?._s.has('items'));
const committed=await other.evaluate(async state=>{
 const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('items');
 if(state==='removed')store.removeShoppingEntry('qa-0');
 if(state==='completed')store.completeShoppingItem('qa-0');
 if(state==='deleted')store.removeItem('qa-0');
 if(state==='left-space')store.leaveSpace('family');
 return await store.flushPersistence();
},state);
assert.equal(committed.ok,true);
const afterOther=await page.evaluate(()=>localStorage.getItem('home-restock:v1:items'));
await page.bringToFront();
const card=page.locator('[data-shopping-item-id="'+id+'"]');
await card.locator('.item-expand').click();await card.locator('.snooze-reminder-button').click();
await page.getByRole('button',{name:'儲存',exact:true}).click();
await page.getByText('用品資料已在其他分頁更新，請重新載入後再操作。',{exact:true}).waitFor();
assert.equal(await page.getByText('用品資料已在其他分頁更新，請重新載入後再操作。',{exact:true}).count(),1);
assert.equal(await page.evaluate(()=>localStorage.getItem('home-restock:v1:items')),afterOther);
await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.waitForTimeout(500);
assert.equal(await page.evaluate(()=>localStorage.getItem('home-restock:v1:items')),afterOther);
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:native-notifications')||'{"data":{"tasks":[]}}').data.tasks.some(task=>task.demo)),false);
console.log('PASS real two-tab stale write guard:',state,'disk preserved, delayed save blocked, no Demo');
await context.unrouteAll({behavior:'wait'});await context.close();
}finally{await browser.close()}
