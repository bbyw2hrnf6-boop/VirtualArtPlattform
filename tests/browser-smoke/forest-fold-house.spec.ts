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
      await expect(page.locator('.obsidian__poster')).toHaveAttribute('src',/cover\.webp\?v=5$/);
      for(const image of await page.locator('.forest-house__photos img').all()){
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('naturalWidth',1920);
        await expect(image).toHaveAttribute('src',/\.webp\?v=5$/);
      }
      expect(models).toEqual([]);
      expect(errors).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const base='/assets/showcases/forest-fold-house/';
      const paths:string[]=mobile?[`${base}forest-fold-house-mobile.glb?v=6`]:[];
      if(!mobile){
        const response=await request.get(`${base}desktop-v6/forest-fold-house-desktop.gltf`);
        expect(response.ok()).toBe(true);
        const gltf=await response.json();
        expect(gltf.asset.version).toBe('2.0');
        const irradianceIndices=new Set<number>(),tiledIndices=new Set<number>();
        const textureUv=(texture:{texCoord?:number;extensions?:{KHR_texture_transform?:{texCoord?:number}}})=>texture.extensions?.KHR_texture_transform?.texCoord??texture.texCoord??0;
        for(let i=0;i<gltf.materials.length;i++){
          const material=gltf.materials[i];
          if(material.extras?.forest_irradiance!==true)continue;
          irradianceIndices.add(i);
          expect(material.emissiveTexture,material.name).toBeDefined();
          expect(textureUv(material.emissiveTexture),material.name).toBe(1);
          const tiled=material.extras.forest_surface_tile_m!==undefined;
          if(tiled)tiledIndices.add(i);
          // Scans retain metre-scaled UV0; procedural source materials use
          // their own albedo/normal/roughness atlases on the lightmap UV1.
          for(const texture of [material.pbrMetallicRoughness?.baseColorTexture,material.normalTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture]){
            expect(texture,material.name).toBeDefined();
            expect(textureUv(texture),material.name).toBe(tiled?0:1);
          }
        }
        expect(irradianceIndices.size).toBeGreaterThan(0);
        expect(tiledIndices.size).toBeGreaterThan(0);
        for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
          if(!irradianceIndices.has(primitive.material))continue;
          expect(primitive.attributes.TEXCOORD_1).toBeDefined();
          if(tiledIndices.has(primitive.material))expect(primitive.attributes.TEXCOORD_0).toBeDefined();
        }
        // Meshopt's virtual fallback buffer has no URI; only external files
        // make requests. Embedded image bufferViews use the checked binary.
        for(const item of [...gltf.buffers,...gltf.images])if(item.uri)paths.push(`${base}desktop-v6/${item.uri}`);
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
      const nightRequests:string[]=[];
      page.on('request',r=>{if(r.url().includes('/night-v1/'))nightRequests.push(r.url());});
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
      expect(nightRequests).toEqual([]);
      // A missing optional light study must leave the current day view intact
      // and allow a retry, rather than partially swapping room illumination.
      await page.route('**/night-v1/manifest.json',route=>route.abort(),{times:1});
      await page.getByRole('button',{name:'Night',exact:true}).click();
      await expect(page.getByRole('status',{name:''}).filter({hasText:'Lighting could not load'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Day',exact:true})).toHaveAttribute('aria-pressed','true');
      await page.getByRole('button',{name:'Night',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','night',{timeout:90_000});
      await expect(page.getByRole('button',{name:'Night',exact:true})).toHaveAttribute('aria-pressed','true');
      const loadedNightRequests=nightRequests.length;
      expect(loadedNightRequests).toBe(22); // failed manifest + retry + 20 atlases
      await page.getByRole('button',{name:'Day',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','day');
      await page.getByRole('button',{name:'Night',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','night');
      await page.getByRole('button',{name:'Day',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','day');
      expect(nightRequests).toHaveLength(loadedNightRequests);
      expect(models).toHaveLength(1);
      expect(models[0]).toContain(mobile?'forest-fold-house-mobile.glb?v=6':'desktop-v6/forest-fold-house-desktop.gltf?v=6');
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
      await page.getByLabel('House room').selectOption('7');
      await expect(scene).toHaveAttribute('data-idle','true');
      await page.screenshot({path:info.outputPath(`forest-courtyard-${viewport.width}.png`)});
      await page.getByLabel('House room').selectOption('6');
      await canvas.focus();await page.keyboard.down('ArrowLeft');
      try{await expect.poll(async()=>Number(await scene.getAttribute('data-yaw'))).toBeGreaterThan(0);}
      finally{await page.keyboard.up('ArrowLeft');}
      await expect(scene).toHaveAttribute('data-idle','true');
      await page.screenshot({path:info.outputPath(`forest-mirror-${viewport.width}.png`)});
      await page.getByRole('button',{name:'Night',exact:true}).click();
      await expect(scene).toHaveAttribute('data-lighting','night');
      await expect(scene).toHaveAttribute('data-idle','true');
      await page.screenshot({path:info.outputPath(`forest-mirror-night-${viewport.width}.png`)});
      for(const room of ['5','7']){
        await page.getByLabel('House room').selectOption(room);
        await expect(scene).toHaveAttribute('data-idle','true');
        await page.screenshot({path:info.outputPath(`forest-night-courtyard-${room}-${viewport.width}.png`)});
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const image of await page.locator('.forest-house__photos img').all()){
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveJSProperty('naturalWidth',1920);
      }
      expect(errors).toEqual([]);
    });
  });
}
