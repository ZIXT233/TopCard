import { _electron } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const data = await mkdtemp(join(tmpdir(), 'topcard-notifications-'));
if (!process.env.TOPCARD_DESKTOP_EXECUTABLE) throw new Error('Use a signed packaged application');
const app = await _electron.launch({executablePath:process.env.TOPCARD_DESKTOP_EXECUTABLE,args:[],env:{...process.env,ELECTRON_RUN_AS_NODE:'',TOPCARD_DESKTOP_USER_DATA:data}});
try {
  await app.context().addInitScript(() => {
    (window.topcardDesktop?.storage ?? localStorage).setItem('topcard:completion-notifications','true');
    (window.topcardDesktop?.storage ?? localStorage).setItem('topcard:sound-enabled','false');
    window.nativeNotificationEvents=[];
    const NativeNotification=window.Notification;
    window.Notification=class extends NativeNotification {
      constructor(...args) {
        super(...args);
        window.lastNativeNotification = this;
        window.nativeNotificationEvents.push("created");
        this.addEventListener('show',()=>window.nativeNotificationEvents.push('show'));
        this.addEventListener('error',()=>window.nativeNotificationEvents.push('error'));
      }
    };
  });
  const id='00000000-0000-4000-8000-000000000003';
  let revision=1, phase='working';
  await app.context().route('**/api/card-queue',route=>route.fulfill({json:{version:1,revision,order:phase==='working'?[]:[id],cards:[{id,cwd:'/tmp',session:null,phase,createdAt:1,readyAt:phase==='attention'?Date.now():undefined,harness:{kind:'codex',title:'TopCard 完成通知测试',state:phase==='working'?'working':'attention',terminalId:'00000000000000000000000000000000',version:'test'}}],workspaces:[]}}));
  const page=await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.waitForURL(/127/); await page.reload();
  await page.waitForSelector(`.cq-working-list [data-transfer-id="${id}"]`);
  await page.evaluate(()=>Notification.requestPermission());
  assert.equal(await page.evaluate(()=>Notification.permission),'granted');
  // Keep native delivery real; control only background attention for isolated test instances.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, get:()=>true});
    Object.defineProperty(document, 'visibilityState', {configurable:true, get:()=>'hidden'});
    Object.defineProperty(document, 'hasFocus', {configurable:true, value:()=>false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  phase='attention'; revision++;
  await page.waitForFunction(()=>window.nativeNotificationEvents.includes('show')).catch(async error => { console.log(await page.evaluate(()=>({events:window.nativeNotificationEvents,permission:Notification.permission,hidden:document.hidden,focus:document.hasFocus(),text:document.body.innerText.slice(0,500)})));throw error; });
  await page.waitForTimeout(3500);
  assert.deepEqual(await page.evaluate(()=>window.nativeNotificationEvents),['created','show']);
  console.log('PASS actual completion transition -> native OS show event, once across repeated queue polls');
  // Exercise the installed click handler without relying on OS banner automation.
  await page.evaluate(() => window.lastNativeNotification.dispatchEvent(new Event('click')));
  await page.waitForURL(new RegExp(`attention=${id}`));
  await page.locator(`[data-card-id="${id}"][aria-hidden="false"]`).waitFor({state:'visible'});
  assert.equal(app.windows().length, 1);
  console.log('PASS completion notification click -> restored main window and matching visible card');
} finally {await app.close();await rm(data,{recursive:true,force:true});}
