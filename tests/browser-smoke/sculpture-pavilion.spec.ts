import { test, expect } from '@playwright/test';

test('showcase calibration waits for queued GPU work before enabling supersampling', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(() => {
    // Fast JavaScript submission can conceal a slow graphics queue. Model
    // completion latency without slowing RAF or synchronous draw submission.
    const ready = new WeakMap<WebGLSync, number>();
    const prototype = WebGL2RenderingContext.prototype;
    const fence = prototype.fenceSync, wait = prototype.clientWaitSync;
    prototype.fenceSync = function (...args) {
      const sync = fence.apply(this, args);
      if (sync) ready.set(sync, performance.now() + 220);
      return sync;
    };
    prototype.clientWaitSync = function (sync, flags, timeout) {
      return performance.now() < (ready.get(sync) ?? 0)
        ? this.TIMEOUT_EXPIRED : wait.call(this, sync, flags, timeout);
    };
  });
  await page.goto('/#/showcase/obsidian');
  await page.getByRole('button',{name:'Enter the exhibition'}).click();
  const scene = page.locator('.obsidian__scene');
  await expect(scene).toHaveAttribute('data-ready','true',{timeout:60_000});
  await page.getByRole('button', { name: 'Exit flight', exact: true }).click();
  await expect(scene).toHaveAttribute('data-resolution','balanced',{timeout:10_000});
  await expect(scene).toHaveAttribute('data-idle','true');
  await scene.locator('canvas').focus();
  await page.keyboard.down('KeyE');
  try { await expect.poll(async()=>Number(await scene.getAttribute('data-pitch'))).toBeGreaterThan(.15); }
  finally { await page.keyboard.up('KeyE'); }
  await expect(scene).toHaveAttribute('data-idle','true');
});

test('showcase calibration counts synchronous drawing before enabling supersampling', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(() => {
    // Model a software GPU that blocks draw calls, while RAF delivery itself
    // remains fast. Delaying RAF alone would miss the production regression.
    let delayed = false;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => request(time => { delayed = false; callback(time); });
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      if (!delayed) {
        delayed = true;
        const until = performance.now() + 180;
        while (performance.now() < until) { /* synchronous GPU work */ }
      }
      return draw.apply(this,args);
    };
  });
  // Both showcases use the same renderer; Obsidian keeps this calibration
  // regression independent of the Pavilion's large texture upload.
  await page.goto('/#/showcase/obsidian');
  await page.getByRole('button',{name:'Enter the exhibition'}).click();
  const scene = page.locator('.obsidian__scene');
  await expect(scene).toHaveAttribute('data-ready','true',{timeout:60_000});
  await page.getByRole('button', { name: 'Exit flight', exact: true }).click();
  await expect(scene).toHaveAttribute('data-resolution','balanced',{timeout:10_000});
  const pixels = await scene.locator('canvas').evaluate(canvas => canvas.width * canvas.height);
  expect(pixels).toBeLessThanOrEqual(600_000);
  await expect(scene).toHaveAttribute('data-idle','true');
});

for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test.describe(`Sculpture Pavilion at ${viewport.width}`,()=>{
    const mobile=viewport.width===390;
    test.use({viewport,hasTouch:mobile,isMobile:mobile});
    test('visits the three modelled rooms with shared walking, overview and accessible sculptures',{tag:'@showcase-gpu'},async({page,context},info)=>{
      const errors:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error' && /shader|webgl|texture|gl_invalid/i.test(m.text()))errors.push(m.text());});
      await page.goto('/#/showcase/sculpture-pavilion');
      await expect(page.getByRole('heading',{name:'Sculpture Pavilion.',exact:true})).toBeVisible();
      await expect(page.locator('.obsidian__poster')).toHaveJSProperty('naturalWidth',1920);
      const modelRequest=page.waitForRequest(/sculpture-pavilion-(desktop|mobile)\.glb\?v=2$/);
      await page.getByRole('button',{name:'Enter the exhibition'}).click();
      expect((await modelRequest).url()).toContain(`${mobile?'mobile':'desktop'}.glb?v=2`);
      const scene=page.locator('.obsidian__scene'),canvas=scene.locator('canvas');
      await expect(scene).toHaveAttribute('data-ready','true',{timeout:60_000});
      await page.getByRole('button', { name: 'Exit flight', exact: true }).click();
      await expect(canvas).toBeFocused();
      await expect(page.locator('.visitor-controls')).toBeVisible();
      await expect(scene).toHaveAttribute('data-reflection','planar');
      const start=await scene.getAttribute('data-position');
      const box=(await canvas.boundingBox())!;
      // A multi-material glTF sculpture must open from its visible geometry,
      // including child meshes whose artwork identity belongs to their group.
      const sculpture={x:box.x+box.width*.5,y:box.y+box.height*.5};
      if(mobile)await page.touchscreen.tap(sculpture.x,sculpture.y);else await page.mouse.click(sculpture.x,sculpture.y);
      await expect(page.getByRole('dialog')).toContainText('Rooted Silence');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      // Use visible floor above the flight replay and visitor controls.
      const floor={x:box.x+box.width*.5,y:box.y+box.height*.7};
      if(mobile)await page.touchscreen.tap(floor.x,floor.y);else await page.mouse.click(floor.x,floor.y);
      await expect(scene).toHaveAttribute('data-destination','true');
      if(mobile){
        const cdp=await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:420,id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:370,id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      } else {
        await page.keyboard.down('e');await expect.poll(async()=>Number(await scene.getAttribute('data-pitch'))).toBeGreaterThan(.05);await page.keyboard.up('e');
      }
      await expect(scene).not.toHaveAttribute('data-position',start!);
      await expect(scene).toHaveAttribute('data-destination','false',{timeout:60_000});
      // Arrival starts the controller's final deceleration; capture the pose
      // only after it settles so Overview restores the same stationary view.
      await expect(scene).toHaveAttribute('data-idle','true');
      const pose=await scene.getAttribute('data-position');
      await page.getByRole('button',{name:'Overview',exact:true}).click();
      await expect(scene).toHaveAttribute('data-mode','overview');
      await page.screenshot({path:info.outputPath('sculpture-overview.png')});
      await page.getByRole('button',{name:'Walk',exact:true}).click();
      await expect(scene).toHaveAttribute('data-position',pose!);
      const fov=Number(await scene.getAttribute('data-fov'));
      await page.getByRole('button',{name:'Zoom out',exact:true}).click();
      await expect.poll(async()=>Number(await scene.getAttribute('data-fov'))).toBeGreaterThan(fov+3);
      for(const [i,name] of ['Sculpture Atrium','Glass Gallery','Kinetic Hall'].entries()){
        await page.getByRole('combobox',{name:'Exhibition room'}).selectOption(String(i));
        await expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
        await page.screenshot({path:info.outputPath(`sculpture-room-${i}.png`)});
      }
      await expect(scene).toHaveAttribute('data-animation','playing');
      const time=Number(await scene.getAttribute('data-animation-time'));
      await expect.poll(async()=>Number(await scene.getAttribute('data-animation-time'))).toBeGreaterThan(time+.1);
      await page.emulateMedia({reducedMotion:'reduce'});
      await expect(scene).toHaveAttribute('data-animation','paused');
      await expect(scene).toHaveAttribute('data-idle','true');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.getByRole('button',{name:'Open artwork list, 5 works',exact:true}).click();
      await page.getByRole('button',{name:/Gentle Engine Gentle Engine/}).click();
      const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('img')).toHaveJSProperty('complete',true);
      expect(await dialog.getByRole('img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(1000);
      await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
      await expect(page.getByRole('button',{name:/Gentle Engine Gentle Engine/})).toBeFocused();
      expect(errors).toEqual([]);
    });
  });
}
test('Sculpture Pavilion keeps five object portraits available without its WebGL model',async({page})=>{
  await page.route('**/sculpture-pavilion-*.glb*',r=>r.abort());
  await page.goto('/#/showcase/sculpture-pavilion');await page.getByRole('button',{name:'Enter the exhibition'}).click();
  await expect(page.getByRole('status')).toContainText('The 3D view could not load');
  await expect(page.locator('.obsidian__art-grid button')).toHaveCount(5);
});
