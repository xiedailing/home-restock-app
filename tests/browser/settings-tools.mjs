// Optional isolated browser suite. Requires a separately installed Playwright + Chromium.
// Start a production preview first; no real OS notification is emitted.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const previewBase = process.env.BUBU_PREVIEW_URL || 'http://127.0.0.1:5210'

const browser=await chromium.launch({headless:true});try {
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',permissions:['notifications']});const page=await context.newPage();
 await context.addInitScript(()=>{
  if(location.protocol !== 'https:' && location.protocol !== 'http:')return
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
await context.route(origin+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});
const route=path=>page.evaluate(path=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path),path);
const nativeState=()=>page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').demoEnabled);
const clean=async()=>{
 for(const text of ['展示資料初始化／還原','系統通知已開啟','啟用通知展示模式','展示控制','結束展示並取消待發送測試'])assert.equal(await page.getByText(text,{exact:true}).count(),0,text);
 assert.equal(await page.locator('.native-notification-settings').count(),0);
 assert.equal(await page.locator('.presentation-setup-entry').count(),0);
};
await page.goto(origin+'/settings');await page.getByRole('switch',{name:'推播通知',exact:true}).waitFor();
assert.equal(await nativeState(),false);
for(const width of [1440,390]){
 await page.setViewportSize({width,height:900});await clean();
 const push=page.getByRole('switch',{name:'推播通知',exact:true});await push.click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('home-restock:v1:notifications')).data.pushEnabled===false);assert.equal(await push.getAttribute('aria-checked'),'false');await push.click();assert.equal(await push.getAttribute('aria-checked'),'true');
 for(const name of ['補貨提醒','尚未購買提醒']){const button=page.getByRole('button',{name:new RegExp('^'+name)});await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');await button.click()}
 await page.screenshot({path:'/tmp/bubu-settings-clean-'+width+'.png',fullPage:true});
}
await route('/shopping?notificationDemo=1');await page.getByRole('button',{name:'啟用通知展示模式',exact:true}).waitFor();assert.equal(await nativeState(),false);
await route('/settings');await clean();assert.equal(await nativeState(),false); // invitation must not leak or activate.
await route('/shopping?notificationDemo=1');await page.getByRole('button',{name:'啟用通知展示模式',exact:true}).click();assert.equal(await nativeState(),true);await route('/settings?notificationDemo=1');await page.getByText('展示控制',{exact:true}).waitFor();
await route('/settings');await clean();assert.equal(await nativeState(),true); // hidden controls must not disable mode.
await page.evaluate(()=>{window.__OriginalNotification=Notification;Notification.permission='default';Notification.requestPermission=async()=>{window.__permissionRequests=(window.__permissionRequests||0)+1;Notification.permission='granted';return 'granted'};document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').support()});
await page.getByRole('button',{name:'開啟系統通知',exact:true}).click();await page.waitForFunction(()=>window.__permissionRequests===1);await clean();
await page.evaluate(()=>{Notification.permission='denied';document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').support()});await page.getByText('系統通知已封鎖，請至瀏覽器網站設定允許通知。',{exact:true}).waitFor();
await page.evaluate(()=>{delete window.Notification;document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').support()});await page.getByText('此環境無法使用系統通知，請使用電腦版 Chrome 或 Safari。',{exact:true}).waitFor();
await page.evaluate(()=>{window.Notification=window.__OriginalNotification;Notification.permission='granted';const native=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications');native.support();native.authorizationMessage='通知授權失敗，請稍後再試。'});await page.getByText('通知授權失敗，請稍後再試。',{exact:true}).waitFor();
await page.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('native-notifications').authorizationMessage='');
await route('/settings?notificationDemo=1');await page.getByText('展示控制',{exact:true}).click();await page.getByRole('button',{name:'結束展示並取消待發送測試',exact:true}).click();await page.waitForFunction(()=>!sessionStorage.getItem('bubu:notification-demo-session:v1'));
await route('/settings');await clean();assert.equal(await nativeState(),false);
const production='https://home-restock-app.vercel.app';await context.route(production+'/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await context.request.get(previewBase+u.pathname+u.search)})});await page.goto(production+'/settings?notificationDemo=1');await page.getByRole('switch',{name:'推播通知',exact:true}).waitFor();await clean();assert.equal(await nativeState(),false);
assert.deepEqual(errors,[]);console.log('PASS settings desktop/mobile: clean normal UI, no empty native wrapper, push + reminder controls, explicit operator URL only, no automatic activation, invitation no leak, permission request and errors retained, operator exit, Production does not auto-enable');
await context.unrouteAll({behavior:'wait'});await context.close();}finally{await browser.close()}
