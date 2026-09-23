import {test,expect} from '@playwright/test';

for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  test.describe(`Showcase cinematics ${viewport.width}`,()=>{
    test.use({viewport,hasTouch:viewport.width===390,isMobile:viewport.width===390});
    for(const id of ['obsidian','sculpture-pavilion','forest-fold-house']){
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
    test('three-world story loads on request and reverses between every scene',async({page},info)=>{
      const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(/\/showcases\/.*\.(glb|gltf)(\?|$)/.test(r.url()))requests.push(r.url());});
      await page.goto('/#/');
      const story=page.getByRole('region',{name:'Three worlds cinematic story'});
      await story.scrollIntoViewIfNeeded();
      expect(requests).toEqual([]);
      await page.getByRole('button',{name:'Watch the film',exact:false}).click();
      await expect(story.locator('.obsidian__scene')).toHaveAttribute('data-ready','true',{timeout:90_000});
      await story.getByRole('button',{name:'Pause journey'}).click();
      for(const [name,id] of [['Sculpture Pavilion','sculpture-pavilion'],['Forest Fold House','forest-fold-house'],['Obsidian','obsidian']]){
        await story.getByRole('navigation',{name:'Journey chapters'}).getByRole('button',{name:new RegExp(name)}).click();
        await expect(story.locator('.obsidian__scene')).toHaveAttribute('data-showcase',id);
        await expect(story.locator('.obsidian__scene')).toHaveAttribute('data-ready','true',{timeout:90_000});
        await expect(story.locator('canvas')).toHaveCount(1);
        await expect(story.locator('.obsidian__scene')).toHaveAttribute('data-camera-owner','world');
        await expect(story.locator('.world-story__scene')).toHaveCSS('opacity','1');
        if(await story.locator('.world-story__arrival').count())await expect(story.locator('.world-story__arrival')).toHaveCSS('opacity','0');
        await page.screenshot({path:info.outputPath(`story-${name}.png`)});
      }
      await story.getByRole('slider',{name:'Journey position'}).fill('1000');
      await expect(story).toHaveAttribute('data-progress','1.0000');
      await expect(story.getByText('Bespoke showcases. Separate from the three editable Studio templates.')).toBeVisible();
      await story.getByRole('button',{name:'Close journey ×'}).click();
      await expect(story.locator('canvas')).toHaveCount(0);
      await page.emulateMedia({reducedMotion:'reduce'});
      const count=requests.length;
      await story.getByRole('button',{name:'Explore still views'}).click();
      await story.getByRole('navigation',{name:'Journey chapters'}).getByRole('button',{name:/Sculpture Pavilion/}).click();
      await expect(story).toHaveAttribute('data-chapter','1');
      await expect(story.locator('canvas')).toHaveCount(0);expect(requests.length).toBe(count);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}

test('the complete three-world film reaches its final view without skipping a world', async ({page},info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/#/');
  const story=page.getByRole('region',{name:'Three worlds cinematic story'});
  await story.scrollIntoViewIfNeeded();
  await story.getByRole('button',{name:'Watch the journey · 48 sec'}).click();
  for(const progress of [.15,.32,.36,.5,.64,.7,.85,1]){
    await expect.poll(async()=>Number(await story.getAttribute('data-progress')),{timeout:50_000}).toBeGreaterThanOrEqual(progress);
    await expect(story.locator('canvas')).toHaveCount(1);
    await page.screenshot({path:info.outputPath(`film-${progress}.png`)});
  }
  await expect(story).toHaveAttribute('data-chapter','2');
  await expect(story).toHaveAttribute('data-playing','false');
  await expect(story.getByRole('button',{name:'Play journey'})).toBeVisible();
});
