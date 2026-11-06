import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
const url=new URL('../.env',import.meta.url);
let content=await readFile(url,'utf8').catch(()=>readFile(new URL('../.env.example',import.meta.url),'utf8'));
const invitation=randomBytes(24).toString('base64url');
function set(key,value){const re=new RegExp(`^${key}=.*$`,'m');content=re.test(content)?content.replace(re,()=>`${key}=${value}`):`${content}\n${key}=${value}\n`;}
set('ADMIN_REGISTRATION_CODE',invitation);
if((parse(content).SESSION_SECRET||'').length<32)set('SESSION_SECRET',randomBytes(48).toString('hex'));
await writeFile(url,content);
console.log('Đã lưu mã mời quản trị và chuẩn bị session secret trong .env.');
console.log('Mã mời quản trị mới (chỉ hiện lần này): '+invitation);
console.log('Lưu mã mời an toàn và chỉ chia sẻ với người được phép quản trị. Khởi động lại server sau khi đổi mã.');
