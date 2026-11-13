import 'dotenv/config';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from '../src/db.js';

type Job = {id:number;name:string;category:string;ingredients:{name:string}[]};
type Candidate = {sourceTitle:string;sourceUrl:string;imageUrl:string;caption:string};
type Source = {id:number;name:string;imagePath:string;hash:string;sourceUrl:string|null;imageUrl?:string;sourceTitle:string;caption?:string;kind:'ai'|'online'};
const directory = new URL('../../docs/menu-images/',import.meta.url);
const sourcesDirectory = new URL('sources/',directory);
const publicDirectory = new URL('../../web/public/',import.meta.url);
const normalize = (s:string) => s.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const aliases: [string,string[]][] = [
  ['Thịt bò',['beef']],['Thịt gà',['chicken']],['Thịt vịt',['duck']],['Thịt heo',['pork']],['Tôm',['shrimp','prawn']],['Mực',['squid','calamari']],['Cá lóc',['snakehead','fish']],['Cá hồi',['salmon']],['Cá basa',['basa','catfish','fish']],['Cá thu',['mackerel','fish']],['Cá diêu hồng',['tilapia','fish']],['Bạch tuộc',['octopus']],['Sò điệp',['scallop']],['Thịt cua',['crab']],['Thịt ếch',['frog']],['Cá chẽm',['seabass','sea bass','barramundi','fish']],
  ['Đậu hũ',['tofu']],['Nấm đông cô',['shiitake']],['Nấm đùi gà',['king oyster']],['Nấm bào ngư',['oyster mushroom']],['Cà tím',['eggplant','aubergine']],['Bí đỏ',['pumpkin','squash']],['Bông cải xanh',['broccoli']],['Củ sen',['lotus root']],['Măng tươi',['bamboo shoot']],['Đậu bắp',['okra']],['Su su',['chayote']],['Khoai tây',['potato']],['Bắp non',['baby corn']],['Đậu que',['green bean','french bean']],['Cải thìa',['bok choy','pak choi']],['Khổ qua',['bitter melon','bitter gourd']],
  ['Xoài',['mango']],['Chuối',['banana']],['Dâu tây',['strawberry']],['Chanh dây',['passion fruit','passionfruit']],['Dứa',['pineapple']],['Thanh long',['dragon fruit','pitaya']],['Bơ',['avocado']],['Sầu riêng',['durian']],['Mít',['jackfruit']],['Vải',['lychee','litchi']],['Nhãn',['longan']],['Dừa',['coconut']],['Cam',['orange']],['Ổi',['guava']],['Đu đủ',['papaya']],['Dưa hấu',['watermelon']],
];
const styles: [string,string[]][] = [['nướng',['grilled','barbecue','bbq']],['kho',['braised','stew']],['hấp',['steamed']],['chiên',['fried','crispy']],['xào',['stir-fried','stir fried','saute']],['gỏi',['salad']],['kem',['ice cream']],['pudding',['pudding']],['sorbet',['sorbet']],['panna cotta',['panna cotta']],['sữa chua',['yogurt','yoghurt']],['thạch',['jelly']],['flan',['flan','custard']],['mousse',['mousse']],['tart',['tart']],['crepe',['crepe']],['su kem',['cream puff','choux']],['muffin',['muffin']],['bông lan',['sponge cake','cake']],['sinh tố',['smoothie']],['đá xay',['slush','smoothie']],['chè',['sweet soup','dessert']]];
function score(job:Job,candidate:Candidate) {
  const caption=normalize(candidate.caption);
  const text=normalize(`${candidate.sourceTitle} ${candidate.caption} ${candidate.imageUrl}`).replace(/[^a-z0-9]+/g,' ');
  const pool=job.category==='Món chay'?aliases.slice(16,32):job.category==='Tráng miệng'?aliases.slice(32):aliases;
  // Preserve Vietnamese accents here: dứa, dừa and dưa are different ingredients.
  const dishWords=` ${job.name.toLocaleLowerCase('vi')} `;
  const namedAliases=pool.filter(([name])=>dishWords.includes(` ${name.replace(/^Thịt /,'').toLocaleLowerCase('vi')} `));
  let result=namedAliases.reduce((sum,[,terms])=>sum+(terms.some(term=>text.includes(term))?20:0),0);
  const primary=namedAliases[0];
  if(primary&&!primary[1].some(term=>text.includes(term))&&!text.includes(normalize(primary[0].replace(/^Thịt /,''))))return -100;
  const tokens=normalize(job.name).split(/\W+/).filter(word=>word.length>2);
  result+=tokens.filter(word=>new RegExp(`\\b${word}\\b`).test(text)).length*2;
  for(const [label,terms] of styles) if(normalize(job.name).includes(normalize(label))&&terms.some(term=>caption.includes(term)))result+=8;
  if(/tour|travel|walking|buffet|feast|spread|banquet|collection|logo|package|product packaging/.test(caption))result-=30;
  if(job.category==='Món chay'&&/\b(beef|pork|shrimp|prawn|chicken|fish|seafood|duck|crab|squid|octopus)\b/.test(caption))result-=100;
  return result;
}
function extension(bytes:Buffer) {
  if(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  if(bytes.toString('ascii',0,3)==='GIF')return 'gif';
  return null;
}
function imageKey(url:string) {
  return new URL(url).pathname.replace(/\/(?:\d+x\d+[^/]*|\d+-\d+)\//g,'/').replace(/-width\d+height\d+/g,'').replace(/_\d+x\d+\./g,'.');
}
async function main() {
  await mkdir(sourcesDirectory,{recursive:true});
  await mkdir(new URL('images/sourced/',publicDirectory),{recursive:true});
  const jobs=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8')) as Job[];
  const saved=new Map<number,Source>();const hashes=new Set<string>();const claimed=new Set<string>();
  for(const filename of await readdir(sourcesDirectory)) if(/\.json$/.test(filename)){
    const entry=JSON.parse(await readFile(new URL(filename,sourcesDirectory),'utf8')) as Source;
    const job=jobs.find(job=>job.id===entry.id);
    if(entry.kind==='online'&&job&&score(job,{sourceTitle:entry.sourceTitle,sourceUrl:entry.sourceUrl!,imageUrl:entry.imageUrl!,caption:entry.caption??''})<0){
      const rejected=new URL('sources-rejected/',directory);await mkdir(rejected,{recursive:true});
      await rename(new URL(filename,sourcesDirectory),new URL(filename,rejected));continue;
    }
    saved.set(entry.id,entry);hashes.add(entry.hash);if(entry.imageUrl)claimed.add(imageKey(entry.imageUrl));
  }
  const generated=(await readFile(new URL('completed.jsonl',directory),'utf8').catch(()=>'' )).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  for(const filename of await readdir(directory)) if(/^completed-\d+\.json$/.test(filename)) generated.push(JSON.parse((await readFile(new URL(filename,directory),'utf8')).replace(/^\uFEFF/,'')));
  for(const row of generated) {
    if(saved.has(row.id))continue;
    const job=jobs.find(job=>job.id===row.id);if(!job||job.name!==row.name)continue;
    const imagePath=`/images/generated/dish-${job.id}.png`;
    const bytes=await readFile(new URL(imagePath.slice(1),publicDirectory));
    const entry:Source={id:job.id,name:job.name,imagePath,hash:createHash('sha256').update(bytes).digest('hex'),sourceUrl:null,sourceTitle:'Ảnh tạo bằng AI',kind:'ai'};
    saved.set(job.id,entry);hashes.add(entry.hash);await writeFile(new URL(`${job.id}.json`,sourcesDirectory),JSON.stringify(entry,null,2));
  }
  const attempted=new Set<number>();const failures:{id:number;name:string;reason:string}[]=[];
  let progress=saved.size;
  const finishAt=Date.now()+20*60*1000;
  const processJob=async(job:Job)=>{
    let data:{candidates:Candidate[]};
    try{data=JSON.parse((await readFile(new URL(`online-candidates/${job.id}.json`,directory),'utf8')).replace(/^\uFEFF/,''));}catch{return;}
    attempted.add(job.id);
    for(const candidate of [...data.candidates].sort((a,b)=>score(job,b)-score(job,a))){
      if(score(job,candidate)<0)continue;
      let key:string;
      try{if(new URL(candidate.imageUrl).protocol!=='https:')continue;key=imageKey(candidate.imageUrl);}catch{continue;}
      if(claimed.has(key))continue;claimed.add(key);
      try{
        const response=await fetch(candidate.imageUrl,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0 (compatible; BepNhaMenuSeed/1.0)','Accept':'image/avif,image/webp,image/*;q=0.8','Referer':candidate.sourceUrl}});
        if(!response.ok)throw new Error('HTTP');
        const bytes=Buffer.from(await response.arrayBuffer());
        const ext=extension(bytes);if(!ext||bytes.length<3000||bytes.length>12*1024*1024)throw new Error('INVALID_IMAGE');
        const hash=createHash('sha256').update(bytes).digest('hex');if(hashes.has(hash))throw new Error('DUPLICATE_IMAGE');
        hashes.add(hash);
        const imagePath=`/images/sourced/dish-${job.id}.${ext}`;
        await writeFile(new URL(imagePath.slice(1),publicDirectory),bytes);
        const entry:Source={id:job.id,name:job.name,imagePath,hash,sourceUrl:candidate.sourceUrl,imageUrl:candidate.imageUrl,sourceTitle:candidate.sourceTitle,caption:candidate.caption,kind:'online'};
        await writeFile(new URL(`${job.id}.json`,sourcesDirectory),JSON.stringify(entry,null,2));saved.set(job.id,entry);
        progress++;if(progress%50===0)console.log(JSON.stringify({downloaded:progress,total:jobs.length}));return;
      }catch{claimed.delete(key);}
    }
    failures.push({id:job.id,name:job.name,reason:'No accessible unique matching candidate'});
  };
  while(Date.now()<finishAt){
    const batch=jobs.filter(job=>!saved.has(job.id)&&!attempted.has(job.id));let next=0;
    await Promise.all(Array.from({length:12},async()=>{while(next<batch.length)await processJob(batch[next++]);}));
    if(!process.argv.includes('--watch')||jobs.every(job=>saved.has(job.id)||attempted.has(job.id))||await readFile(new URL('search-complete.json',directory)).then(()=>true,()=>false))break;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  const entries=[...saved.values()];
  const updated=await prisma.$executeRaw`
    UPDATE "Dish" AS d SET "imagePath"=v."imagePath", "updatedAt"=NOW()
    FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS v(id int,name text,"imagePath" text)
    WHERE d.id=v.id AND d.name=v.name AND d."imagePath"<>v."imagePath"`;
  const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  await writeFile(new URL('images/sourced/credits.html',publicDirectory),`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nguồn ảnh · Bếp Nhà</title><style>body{max-width:900px;margin:40px auto;padding:20px;font:16px/1.7 system-ui;color:#284c3b;background:#fffef9}article{padding:24px 0;border-bottom:1px solid #ddd}a{color:#a66348}h2{font-size:20px}</style><h1>Nguồn ảnh thực đơn Bếp Nhà</h1>${entries.sort((a,b)=>a.id-b.id).map(row=>`<article id="dish-${row.id}"><h2>${escape(row.name)}</h2>${row.sourceUrl?`<a href="${escape(row.sourceUrl)}" rel="noopener noreferrer">${escape(row.sourceTitle)}</a>`:'Ảnh tạo bằng AI cho Bếp Nhà.'}</article>`).join('')}</html>`);
  const missing=jobs.filter(job=>!saved.has(job.id)).map(job=>({id:job.id,name:job.name}));
  await writeFile(new URL('online-failures.json',directory),JSON.stringify({missing,failures},null,2));
  const report={checkedAt:new Date().toISOString(),saved:entries.length,online:entries.filter(row=>row.kind==='online').length,ai:entries.filter(row=>row.kind==='ai').length,uniqueImages:hashes.size,updated,missing:missing.length};
  await writeFile(new URL('image-verification.json',directory),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error('Image sourcing failed.',/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:'');process.exitCode=1;}).finally(()=>prisma.$disconnect());
