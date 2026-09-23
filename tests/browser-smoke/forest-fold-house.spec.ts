import { test,expect } from '@playwright/test';

for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  test.describe(`Forest Fold House ${viewport.width}`,()=>{
    const mobile=viewport.width===390;
    test.use({viewport,hasTouch:mobile,isMobile:mobile});
    test('house preview and complete model delivery work without a GPU',async({page,request})=>{
      const models:string[]=[],errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',r=>{if(/forest-fold-house.*\.(glb|gltf)(\?|$)/.test(r.url()))models.push(r.url());});
      await page.goto('/#/showcase/forest-fold-house');
      await expect(page.getByRole('heading',{name:'Forest Fold House.'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Enter the house'})).toBeEnabled();
      await expect(page.locator('.obsidian__poster')).toHaveJSProperty('naturalWidth',1920);
      for(const image of await page.locator('.forest-house__photos img').all()){
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('naturalWidth',1920);
      }
      expect(models).toEqual([]);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const base='/assets/showcases/forest-fold-house/';
      const paths:string[]=mobile?[`${base}forest-fold-house-mobile.glb?v=4`]:[];
      if(!mobile){
        const response=await request.get(`${base}desktop-v4/forest-fold-house-desktop.gltf`);
        expect(response.ok()).toBe(true);
        const gltf=await response.json();
        expect(gltf.asset.version).toBe('2.0');
        // Meshopt's virtual fallback buffer has no URI; only external files
        // make requests. Embedded image bufferViews use the checked binary.
        for(const item of [...gltf.buffers,...gltf.images])if(item.uri)paths.push(`${base}desktop-v4/${item.uri}`);
        expect(paths.length).toBeGreaterThan(1);
      }
      await Promise.all(paths.map(async path=>{
        const response=await request.head(path);
        expect(response.ok(),path).toBe(true);
        expect(response.headers()['content-type'],path).not.toContain('text/html');
        expect(Number(response.headers()['content-length']),path).toBeGreaterThan(0);
      }));
    });
    test('loads on demand and shares walking, look, room heights and overview',{tag:'@showcase-gpu'},async({page},info)=>{
      const errors:string[]=[],models:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.url().includes('/assets/showcases/forest-fold-house/')&&!r.ok())errors.push(`${r.status()} ${r.url()}`);});
      page.on('request',r=>{if(/forest-fold-house.*\.(glb|gltf)(\?|$)/.test(r.url()))models.push(r.url());});
      await page.goto('/#/showcase/forest-fold-house');
      await expect(page.getByRole('heading',{name:'Forest Fold House.'})).toBeVisible();
      expect(models).toHaveLength(0);
      await expect(page.locator('.obsidian__poster')).toHaveJSProperty('naturalWidth',1920);
      await page.getByRole('button',{name:'Enter the house'}).click();
      const scene=page.locator('.obsidian__scene'),canvas=scene.locator('canvas');
      await expect(scene).toHaveAttribute('data-ready','true',{timeout:90_000});
      await expect(scene).toHaveAttribute('data-idle','true');
      await page.getByRole('button',{name:'Night',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','night');
      await page.getByRole('button',{name:'Day',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','day');
      expect(models).toHaveLength(1);expect(models[0]).toContain(mobile?'mobile.glb':'desktop.gltf');
      const position=async()=> (await scene.getAttribute('data-position'))!.split(',').map(Number);
      expect((await position())[1]).toBeCloseTo(5.1,1);
      // Keep input active until the rendered camera responds. A fixed 350 ms
      // hold measured CI's software GPU speed, then polled a stopped camera.
      await canvas.focus();await page.keyboard.down('KeyE');
      try{await expect.poll(async()=>Number(await scene.getAttribute('data-pitch'))).toBeGreaterThan(.15);}
      finally{await page.keyboard.up('KeyE');}
      await page.getByLabel('House room').selectOption('2');
      await expect.poll(async()=>(await position())[0]).toBeCloseTo(.4,1);
      // Drag down to reveal the bridge deck, then hit its visible top surface.
      const box=(await canvas.boundingBox())!;
      if(mobile){
        await canvas.dispatchEvent('pointerdown',{pointerId:41,pointerType:'touch',button:0,clientX:box.x+box.width*.5,clientY:box.y+box.height*.45});
        await canvas.dispatchEvent('pointermove',{pointerId:41,pointerType:'touch',clientX:box.x+box.width*.5,clientY:box.y+box.height*.63});
        await canvas.dispatchEvent('pointerup',{pointerId:41,pointerType:'touch',button:0,clientX:box.x+box.width*.5,clientY:box.y+box.height*.63});
        await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.66);
      }else{
        await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.66,{steps:12});await page.mouse.up();
        await page.mouse.click(box.x+box.width*.5,box.y+box.height*.66);
      }
      await expect.poll(async()=>(await position())[0]).toBeGreaterThan(.65);
      await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(scene).toHaveAttribute('data-mode','overview');
      await page.screenshot({path:info.outputPath(`forest-overview-${viewport.width}.png`)});
      await page.getByRole('button',{name:'Walk',exact:true}).click();await expect(scene).toHaveAttribute('data-mode','walk');
      await page.getByLabel('House room').selectOption('5');await expect.poll(async()=>(await position())[1]).toBeCloseTo(1.7,1);
      await page.screenshot({path:info.outputPath(`forest-lounge-${viewport.width}.png`)});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const image of await page.locator('.forest-house__photos img').all()){
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('naturalWidth',1920);
      }
      expect(errors).toEqual([]);
    });
  });
}
