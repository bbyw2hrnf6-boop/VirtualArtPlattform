import {test,expect} from '@playwright/test';

for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  test.describe(`Showcase cinematics ${viewport.width}`,()=>{
    test.use({viewport,hasTouch:viewport.width===390,isMobile:viewport.width===390});
    for(const id of ['obsidian','sculpture-pavilion','forest-fold-house']){
      test(`${id} shares its direct link, makes a QR code and supports full screen`,async({page})=>{
        await page.goto(`/#/showcase/${id}`);
        const stage=page.locator('.obsidian__stage');
        await page.getByRole('button',{name:/^Share/}).click();
        const link=page.getByRole('textbox',{name:'Shareable Space URL'});
        await expect(link).toHaveValue(`${new URL(page.url()).origin}/#/showcase/${id}`);
        await page.getByRole('button',{name:'QR code'}).click();
        await expect(page.getByRole('img',{name:`QR code for ${id==='forest-fold-house'?'Forest Fold House':id==='sculpture-pavilion'?'Sculpture Pavilion':'Obsidian'}`})).toBeVisible();
        await page.getByRole('button',{name:'Close sharing options'}).click();
        await page.getByRole('button',{name:'Enter full screen'}).click();
        await expect.poll(()=>stage.evaluate(element=>document.fullscreenElement===element)).toBe(true);
        await page.getByRole('button',{name:'Exit full screen'}).click();
        await expect.poll(()=>stage.evaluate(element=>document.fullscreenElement!==element)).toBe(true);
      });
      test(`${id} guided visit can pause, step, exit and keep visitor controls`,async({page},info)=>{
        const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`/#/showcase/${id}`);
        await page.getByRole('button',{name:id==='forest-fold-house'?'Enter the house ↗':'Enter the exhibition ↗',exact:true}).click();
        const scene=page.locator('.obsidian__scene');
        await expect(scene).toHaveAttribute('data-ready','true',{timeout:90_000});
        if(id!=='forest-fold-house'){
          await expect(scene).toHaveAttribute('data-camera-owner','flight');
          await page.getByRole('button',{name:'Pause flight',exact:true}).click();
          for(const n of [0,300,600,900]){
            await page.getByRole('slider',{name:'Exhibition flight position'}).fill(String(n));
            await page.screenshot({path:info.outputPath(`${id}-flight-${n}.png`)});
          }
          await page.getByRole('button',{name:'Exit flight',exact:true}).click();
          await expect(scene).toHaveAttribute('data-camera-owner','visitor');
        }
        await expect(scene).toHaveAttribute('data-idle','true');
        await page.getByRole('button',{name:/^Guided tour/}).click();
        await expect(scene).toHaveAttribute('data-camera-owner','tour');
        await page.getByRole('button',{name:'Pause',exact:true}).click();
        const position=await scene.getAttribute('data-position');
        await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
        await page.getByRole('button',{name:'Next tour stop'}).click();
        await expect(scene).not.toHaveAttribute('data-position',position!);
        await page.screenshot({path:info.outputPath(`${id}-tour.png`)});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.getByRole('button',{name:/^Skip tour/}).click();
        await expect(scene).toHaveAttribute('data-camera-owner','visitor');
        await page.getByRole('button',{name:'Overview',exact:true}).click();
        await expect(scene).toHaveAttribute('data-mode','overview');
        await page.getByRole('button',{name:'Walk',exact:true}).click();
        await expect(scene).toHaveAttribute('data-mode','walk');
        if(id==='forest-fold-house'){
          const before=await scene.getAttribute('data-position');
          await page.getByRole('button',{name:'House flight · 38 sec ↗',exact:true}).click();
          await page.getByRole('button',{name:'Pause flight',exact:true}).click();
          for(const n of [0,250,420,670,835,999]){
            await page.getByRole('slider',{name:'House flight position'}).fill(String(n));
            await expect(scene).toHaveAttribute('data-camera-owner','flight');
            await expect(scene).toHaveAttribute('data-flight-progress',(n/1000).toFixed(3));
            await page.screenshot({path:info.outputPath(`house-flight-${n}.png`)});
          }
          await page.getByRole('button',{name:'Exit flight',exact:true}).click();
          await expect(scene).toHaveAttribute('data-position',before!);
        }
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.getByRole('button',{name:/^Guided tour/}).click();
        await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
        await page.getByRole('button',{name:'Next tour stop'}).click();
        await page.getByRole('button',{name:/^Skip tour/}).click();
        expect(errors).toEqual([]);
      });
    }
    test('the three-world film loads only on request and seeks between every chapter',async({page},info)=>{
      const errors:string[]=[],modelRequests:string[]=[],videoRequests:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{
        if(/\/showcases\/.*\.(glb|gltf)(\?|$)/.test(r.url()))modelRequests.push(r.url());
        if(/\.(mp4|webm)(\?|$)/.test(r.url()))videoRequests.push(r.url());
      });
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.goto('/#/');
      const story=page.getByRole('region',{name:'Three worlds cinematic story'});
      await story.scrollIntoViewIfNeeded();
      const video=story.locator('video'),position=story.getByRole('slider',{name:'Film position'});
      await expect(video).toHaveAttribute('preload','none');
      await expect(story.locator('video[src]')).toHaveCount(0);
      await expect(story.locator('canvas')).toHaveCount(0);
      expect(modelRequests).toEqual([]);
      expect(videoRequests).toEqual([]);
      await expect(story.getByRole('navigation',{name:'Film chapters'})).toHaveCount(0);
      for(const id of ['obsidian','sculpture-pavilion','forest-fold-house'])
        await expect(page.locator(`.showcase-collection__grid a[href="#/showcase/${id}"]`).first()).toBeVisible();
      await story.getByRole('button',{name:'Enter film full screen'}).click();
      await expect.poll(()=>story.locator('.world-story__stage').evaluate(element=>document.fullscreenElement===element)).toBe(true);
      await story.getByRole('button',{name:'Exit film full screen'}).click();
      await story.getByRole('button',{name:'Play film with sound · 20 sec',exact:true}).click();
      await expect(story).toHaveAttribute('data-playing','true');
      await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.currentTime)).toBeGreaterThan(0);
      expect(videoRequests.length).toBeGreaterThan(0);
      await story.getByRole('button',{name:'Mute film',exact:true}).click();
      await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.muted)).toBe(true);
      await story.getByRole('button',{name:'Unmute film',exact:true}).click();
      await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.muted)).toBe(false);
      await story.getByRole('button',{name:'Pause film',exact:true}).click();
      await expect(story).toHaveAttribute('data-playing','false');
      await expect(position).toHaveAttribute('min','0');
      await expect(position).toHaveAttribute('max','20');
      await expect(position).toHaveAttribute('step','0.1');
      for(const [index,name,start] of [[1,'Sculpture Pavilion',7],[2,'Forest Fold House',13],[0,'Obsidian',0]] as const){
        await position.fill(String(start));
        await expect(story).toHaveAttribute('data-chapter',String(index));
        await expect(story).toHaveAttribute('data-playing','false');
        await expect(position).toHaveValue(String(start));
        await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>!element.seeking)).toBe(true);
        await expect.poll(async()=>Math.abs(await video.evaluate((element:HTMLVideoElement)=>element.currentTime)-start)).toBeLessThan(.15);
        await expect(story.locator('canvas')).toHaveCount(0);
        await page.screenshot({path:info.outputPath(`story-${name}.png`)});
      }
      await position.fill('19.5');
      await expect(position).toHaveValue('19.5');
      await expect(story).toHaveAttribute('data-chapter','2');
      await expect(story).toHaveAttribute('data-playing','false');
      await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>!element.seeking)).toBe(true);
      await position.fill('13');
      await expect.poll(async()=>Math.abs(await video.evaluate((element:HTMLVideoElement)=>element.currentTime)-13)).toBeLessThan(.15);
      await story.getByRole('button',{name:'Resume film',exact:true}).click();
      await expect(story).toHaveAttribute('data-playing','true');
      const requestedVideos=videoRequests.length;
      await page.emulateMedia({reducedMotion:'reduce'});
      await expect(story.getByRole('status')).toHaveText('Still view · Explore the worlds below');
      await expect(story).toHaveAttribute('data-playing','false');
      await expect(story.locator('video[src]')).toHaveCount(0);
      await expect(story.getByRole('button',{name:/Play film|Resume film|Replay film/})).toHaveCount(0);
      await expect(story.getByRole('navigation',{name:'Film chapters'})).toHaveCount(0);
      await expect(story.locator('canvas')).toHaveCount(0);
      expect(videoRequests.length).toBe(requestedVideos);
      expect(modelRequests).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}

test('the complete three-world film reaches its final frame and can replay', async ({page},info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/#/');
  // The deferred Studio story above grows from a one-screen poster to its
  // scroll sequence. Let that mount before measuring film-induced scrolling.
  await expect(page.locator('.sgs')).toBeAttached();
  const story=page.getByRole('region',{name:'Three worlds cinematic story'});
  await story.scrollIntoViewIfNeeded();
  const scrollBefore=await page.evaluate(()=>scrollY);
  await story.getByRole('button',{name:'Play film with sound · 20 sec',exact:true}).click();
  const position=story.getByRole('slider',{name:'Film position'});
  for(const [time,chapter] of [[3,0],[10,1],[16,2]] as const){
    await expect.poll(async()=>Number(await position.inputValue()),{timeout:30_000}).toBeGreaterThanOrEqual(time);
    await expect(story).toHaveAttribute('data-chapter',String(chapter));
    await expect(story.locator('canvas')).toHaveCount(0);
    await page.screenshot({path:info.outputPath(`film-${time}.png`)});
  }
  await expect(story).toHaveAttribute('data-playing','false',{timeout:25_000});
  await expect(position).toHaveValue('20');
  await expect(story.getByRole('button',{name:'Replay film',exact:true})).toBeVisible();
  expect(Math.abs(await page.evaluate(()=>scrollY)-scrollBefore)).toBeLessThanOrEqual(1);
  await story.getByRole('button',{name:'Replay film',exact:true}).click();
  await expect(story).toHaveAttribute('data-playing','true');
  await expect(story).toHaveAttribute('data-chapter','0');
  await expect.poll(async()=>Number(await position.inputValue())).toBeLessThan(3);
  await story.getByRole('button',{name:'Pause film',exact:true}).click();
});

test('native page scrolling never seeks the film and leaving the section pauses it',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/#/');
  const story=page.getByRole('region',{name:'Three worlds cinematic story'});
  await story.scrollIntoViewIfNeeded();
  await story.getByRole('button',{name:'Play film with sound · 20 sec',exact:true}).click();
  const video=story.locator('video'),position=story.getByRole('slider',{name:'Film position'});
  await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.currentTime)).toBeGreaterThan(.2);
  await story.getByRole('button',{name:'Pause film',exact:true}).click();
  await position.fill('18');
  await expect.poll(async()=>Math.abs(await video.evaluate((element:HTMLVideoElement)=>element.currentTime)-18)).toBeLessThan(.15);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await expect(story).not.toBeInViewport();
  await story.scrollIntoViewIfNeeded();
  await expect(position).toHaveValue('18');
  await expect(story).toHaveAttribute('data-playing','false');
  await story.getByRole('button',{name:'Resume film',exact:true}).click();
  await expect(story).toHaveAttribute('data-playing','true');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await expect(story).not.toBeInViewport();
  await expect(story).toHaveAttribute('data-playing','false');
  await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.paused)).toBe(true);
  const pausedAt=await video.evaluate((element:HTMLVideoElement)=>element.currentTime);
  await story.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-playing','false');
  expect(Math.abs(await video.evaluate((element:HTMLVideoElement)=>element.currentTime)-pausedAt)).toBeLessThan(.15);
  for(const id of ['obsidian','sculpture-pavilion','forest-fold-house'])
    await expect(page.locator(`.showcase-collection__grid a[href="#/showcase/${id}"]`).first()).toBeVisible();
});
