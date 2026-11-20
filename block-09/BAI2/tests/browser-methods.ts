import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
process.env.DEMO_MODE='true';
const {app}=await import('../src/app.js');
const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening',resolve));
const origin=`http://localhost:${(server.address() as {port:number}).port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(`${origin}/admin/chefs/1/edit`);
  const formHtml=await response!.text();
  let patches=0,deletes=0;
  const listRequests:string[]=[];
  page.on('request',r=>{
    if(new URL(r.url()).pathname==='/admin/chefs')listRequests.push(r.resourceType());
  });
  await page.route(`${origin}/admin/chefs/1`,async route=>{
    const request=route.request();
    assert.match(request.headers()['content-type'],/multipart\/form-data/);
    assert.match(request.postData()!,/name="_csrf"/);
    assert.doesNotMatch(request.postData()!,/name="_method"/);
    if(request.method()==='PATCH'){
      patches++;
      if(patches===1)return route.fulfill({status:400,contentType:'text/html',body:formHtml.replaceAll('Nguyễn Minh An','Giữ giá trị kiểm thử')});
    }else if(request.method()==='DELETE')deletes++;
    else throw new Error(`Unexpected method: ${request.method()}`);
    await route.fulfill({status:303,headers:{location:'/admin/chefs?notice=Saved','content-security-policy':response!.headers()['content-security-policy']}});
  });
  const first=page.waitForResponse(r=>r.request().method()==='PATCH');
  await page.getByRole('button',{name:/Lưu thay đổi/}).click();
  assert.equal((await first).status(),400);
  await page.locator('input[name="name"]').filter({visible:true}).waitFor();
  await page.waitForFunction(()=> (document.querySelector('input[name="name"]') as HTMLInputElement)?.value==='Giữ giá trị kiểm thử');
  await page.getByRole('button',{name:/Lưu thay đổi/}).click();
  await page.waitForURL(`${origin}/admin/chefs`);
  await page.goto(`${origin}/admin/chefs/1/delete`);
  await page.getByRole('button',{name:'Xác nhận xóa'}).click();
  await page.waitForURL(`${origin}/admin/chefs`);
  assert.equal(patches,2);assert.equal(deletes,1);assert.deepEqual(errors,[]);
  assert.deepEqual(listRequests,['document','document']);
  console.log('PASS: native PATCH, validation rerender/resubmit, native DELETE, 303 redirects, CSRF included. No live database writes.');
}finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
