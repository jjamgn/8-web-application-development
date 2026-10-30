import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
const url=new URL('../.env',import.meta.url);
let content=await readFile(url,'utf8').catch(()=>readFile(new URL('../.env.example',import.meta.url),'utf8'));
const password=randomBytes(18).toString('base64url');
const hash=await bcrypt.hash(password,12);
function set(key,value){const re=new RegExp(`^${key}=.*$`,'m');content=re.test(content)?content.replace(re,()=>`${key}=${value}`):`${content}\n${key}=${value}\n`;}
set('ADMIN_PASSWORD_HASH',`'${hash}'`);
if(!/^SESSION_SECRET=.+$/m.test(content))set('SESSION_SECRET',randomBytes(48).toString('hex'));
await writeFile(url,content);
console.log('Đã lưu bcrypt hash và session secret vào .env.');
console.log('Mật khẩu quản trị mới (chỉ hiện lần này): '+password);
console.log('Lưu mật khẩu vào trình quản lý mật khẩu. Lệnh này đổi mật khẩu mỗi lần chạy.');
