// Optional isolated browser suite. Requires a separately installed Playwright + Chromium.
// Start a production preview first; no real OS notification is emitted.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const previewBase = process.env.BUBU_PREVIEW_URL || 'http://127.0.0.1:5210'

const browser=await chromium.launch({headless:true});try {
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',permissions:['notifications']});const page=await context.newPage();
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

const origin='https://home-restock-app-git-feature-native-browser-n-f5352f-xiedailing.vercel.app';await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});
await page.setViewportSize({width:390,height:844});await page.goto(origin+'/?demoSetup=1');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'恢復六項展示初始資料',exact:true}).click();await page.waitForURL('**/shopping?notificationDemo=1');await page.locator('#shopping-title').waitFor();
const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('home-restock:v1:items')).data);const family=initial.spaces.find(s=>s.shared),pad=initial.items.find(i=>i.name==='衛生棉');
const notices=()=>page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('shared-notifications').visibleRecords.map(r=>r.message));
assert.equal((await notices()).length,3);await page.reload();await page.locator('#shopping-title').waitFor();assert.equal((await notices()).length,3);
const route=async path=>{await page.evaluate(path=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path),path);await page.waitForTimeout(800)};
await route('/settings/spaces/'+family.id);const toggle=page.getByRole('switch',{name:'多人共享',exact:true});assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.equal(await toggle.isDisabled(),true);assert.equal(await toggle.locator('.switch-track.checked').count(),1);const background=await toggle.locator('.switch-track').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(background,'rgb(63, 111, 59)');await page.screenshot({path:'/tmp/bubu-family-sharing-on.png'});
await route('/notifications');for(const text of ['「個人」的衛生紙該補貨了','「個人」的衛生棉是否已購買？','花花已認領「家庭」的垃圾袋。'])await page.getByText(text,{exact:true}).waitFor();await page.getByRole('button',{name:/衛生棉是否已購買/}).click();await page.waitForURL('**/shopping?tab=personal');
const card=page.locator('[data-shopping-item-id="'+pad.id+'"]');await card.locator('.item-expand').click();await card.locator('.snooze-reminder-button').click();const dialog=page.locator('dialog.bottom-sheet[open]');await dialog.waitFor();await page.waitForTimeout(700);
const before=await dialog.boundingBox();await page.evaluate(()=>{window.__sheetFrames=[];let start=performance.now();function frame(){const el=document.querySelector('dialog.bottom-sheet[open]');if(el){const b=el.getBoundingClientRect();window.__sheetFrames.push({top:b.top,height:b.height,bottom:b.bottom})}if(performance.now()-start<1000)requestAnimationFrame(frame)}requestAnimationFrame(frame)});
await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('button',{name:'取消延後',exact:true}).waitFor();await page.waitForTimeout(1100);const after=await dialog.boundingBox(),frames=await page.evaluate(()=>window.__sheetFrames);assert.ok(after.height>before.height+30);assert.ok(after.y<before.y-30);assert.ok(Math.abs((after.y+after.height)-(before.y+before.height))<1);assert.ok(new Set(frames.map(f=>Math.round(f.height))).size>3);assert.equal(await dialog.getAttribute('class').then(c=>c.includes('closing')),false);await page.screenshot({path:'/tmp/bubu-snooze-grow.png'});
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.snooze-cancel-reveal').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
console.log('PASS initial3 notices + reload dedupe + personal shopping notice navigation; family checked/locked; sheet grows upward through multiple heights with fixed bottom; reduced motion respected', {before,after,sampledHeights:new Set(frames.map(f=>Math.round(f.height))).size,background});await context.unrouteAll({behavior:'wait'});await context.close();}finally{await browser.close()}
