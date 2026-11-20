import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('tmp/screenshots',{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
for(const [name,path]of [['menu','/dishes'],['detail','/dishes/1'],['admin','/admin/dishes'],['form','/admin/dishes/1/edit']]){
  const response=await page.goto(`http://localhost:3000${path}`,{waitUntil:'networkidle'});
  await page.screenshot({path:`tmp/screenshots/${name}.png`,fullPage:true});
  const images=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')));
  console.log(JSON.stringify({name,status:response.status(),brokenImages:images,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)}));
}
await page.getByRole('link',{name:'Thực đơn',exact:true}).first().click();
await page.getByRole('textbox',{name:'Tìm món ăn theo tên'}).fill('dừa');
await page.getByRole('button',{name:'Tìm món'}).click();
console.log('Browser search results:',await page.locator('.result-count').textContent());
await page.setViewportSize({width:390,height:844});
await page.goto('http://localhost:3000/dishes',{waitUntil:'networkidle'});
await page.screenshot({path:'tmp/screenshots/mobile.png',fullPage:true});
console.log('Mobile overflow:',await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth));
await page.goto('http://localhost:3000/admin/dishes',{waitUntil:'networkidle'});
await page.screenshot({path:'tmp/screenshots/admin-mobile.png',fullPage:true});
console.log('Admin mobile overflow:',await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth));
console.log('Page errors:',errors.length);
await browser.close();
