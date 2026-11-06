import { z } from 'zod';
import { categories } from './data.js';
const text=(n:number)=>z.string().trim().min(1,'Vui lòng nhập thông tin.').max(n,`Tối đa ${n} ký tự.`);
export const schemas={
  chefs:z.object({name:text(120),specialty:text(200),bio:z.string().trim().max(3000).default('')}),
  ingredients:z.object({name:text(120),unit:text(30)}),
  dishes:z.object({name:text(160),description:text(5000),price:z.coerce.number().int().min(1000).max(999999999),category:z.string().refine(x=>categories.includes(x),'Danh mục không hợp lệ.'),available:z.preprocess(x=>x==='on'||x===true,z.boolean()),chefId:z.coerce.number().int().positive()})
};
export function validId(raw:string){const n=Number(raw);return /^[1-9]\d*$/.test(raw)&&Number.isSafeInteger(n)?n:null;}
