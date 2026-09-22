import { test,expect } from '@playwright/test';

for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  test.describe(`Forest Fold House ${viewport.width}`,()=>{
    const mobile=viewport.width===390;
    test.use({viewport,hasTouch:mobile,isMobile:mobile});
    test('loads on demand and shares walking, look, room heights and overview',async({page},info)=>{
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
