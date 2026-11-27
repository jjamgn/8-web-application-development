import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { checkPixelLimit, prepareImage, variantWidths } from '../src/images/prepare-image.js';
import { LIMITS } from '../../contracts/index.js';
import { padJpeg } from './helpers.js';
import { deflateSync } from 'node:zlib';

async function fixture(t: { after(fn: () => Promise<void>): unknown }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'block11-image-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, tempPath: path.join(dir, 'input.upload') };
}
test('variant widths use the contract formula at all size boundaries', () => {
  for (const [input, widths] of [[200,[200]], [320,[320]], [800,[320,800]], [960,[320,960]], [1200,[320,960,1200]], [1600,[320,960,1600]], [2400,[320,960,1600]]] as const)
    assert.deepEqual(variantWidths(input), widths);
});
for (const width of [200,800,1200,2400]) test(`decode JPEG ${width}px → real WebP dimensions, quality pipeline and stripped metadata`, async t => {
  const { tempPath } = await fixture(t);
  await sharp({ create: { width, height: 200, channels: 3, background: '#347981' } }).jpeg().toFile(tempPath);
  const photo = await prepareImage({ tempPath, title: 'Ảnh', alt: 'Mô tả' });
  assert.equal(photo.width, width); assert.equal(photo.height, 200);
  assert.deepEqual(photo.variants.map(v => v.width), variantWidths(width));
  for (const variant of photo.variants) {
    const metadata = await sharp(variant.tempPath).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, variant.width); assert.equal(metadata.height, variant.height);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined); assert.ok(variant.bytes > 0);
  }
});
test('PNG alpha survives and outputs are never enlarged', async t => {
  const { tempPath } = await fixture(t);
  await sharp({ create: { width: 80, height: 40, channels: 4, background: { r:20, g:80, b:120, alpha:0.3 } } }).png().toFile(tempPath);
  const photo = await prepareImage({ tempPath, title: 'PNG', alt: 'Ảnh trong suốt' });
  assert.equal(photo.variants.length, 1);
  const metadata = await sharp(photo.variants[0]!.tempPath).metadata();
  assert.equal(metadata.hasAlpha, true); assert.equal(metadata.width, 80);
});
for (const orientation of [2,3,5,6,7,8]) test(`EXIF orientation ${orientation} including flips matches the normalized pixels; GPS removed`, async t => {
  const { tempPath } = await fixture(t);
  const width = 40, height = 20;
  const raw = Buffer.alloc(width*height*3);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const i = (y*width+x)*3;
    raw[i] = x < width/2 ? 240 : 10; raw[i+1] = y < height/2 ? 220 : 10; raw[i+2] = 80;
  }
  await sharp(raw, { raw: { width, height, channels:3 } }).withMetadata({ orientation })
    .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1', GPSLongitudeRef: 'E', GPSLongitude: '4/1 5/1 6/1' } }).jpeg({ quality:100 }).toFile(tempPath);
  const before = await sharp(tempPath).metadata(); assert.ok(before.exif);
  const photo = await prepareImage({ tempPath, title:'Orientation', alt:'Tọa độ giả lập' });
  assert.equal(photo.width, orientation >= 5 ? height : width); assert.equal(photo.height, orientation >= 5 ? width : height);
  const actual = await sharp(photo.variants[0]!.tempPath).raw().toBuffer();
  const expected = await sharp(tempPath).autoOrient().webp({ quality:80 }).raw().toBuffer();
  // Sample corner colors independently from the original quadrant formula.
  const mappings: Record<number, number[]> = { 2:[1,0,3,2], 3:[3,2,1,0], 5:[0,2,1,3], 6:[2,0,3,1], 7:[3,1,2,0], 8:[1,3,0,2] };
  const corners = [[2,2],[photo.width-3,2],[2,photo.height-3],[photo.width-3,photo.height-3]];
  for (let k=0;k<corners.length;k++) {
    const [x,y] = corners[k]!; const offset=(y!*photo.width+x!)*3; const quadrant=mappings[orientation]![k]!;
    assert.ok(Math.abs(actual[offset]! - (quadrant%2===0 ? 240:10)) < 35);
    assert.ok(Math.abs(actual[offset+1]! - (quadrant<2 ? 220:10)) < 35);
  }
  assert.equal(actual.length, expected.length);
  assert.equal((await sharp(photo.variants[0]!.tempPath).metadata()).exif, undefined);
});
test('text renamed JPEG and truncated JPEG/PNG are rejected with no output files', async t => {
  const { dir, tempPath } = await fixture(t);
  await writeFile(tempPath, 'this is not a photograph');
  await assert.rejects(prepareImage({ tempPath, title:'x', alt:'y' }), { code:'UNSUPPORTED_IMAGE_TYPE' });
  const jpeg = await sharp({ create: { width:400,height:400,channels:3,background:'#123456' } }).jpeg().toBuffer();
  const jpegPath = path.join(dir, 'broken-jpeg.upload');
  await writeFile(jpegPath, jpeg.subarray(0, jpeg.length - 30));
  await assert.rejects(prepareImage({ tempPath: jpegPath, title:'x', alt:'y' }), { code:'INVALID_IMAGE' });
  const png = await sharp({ create: { width:400,height:400,channels:3,background:'#123456' } }).png().toBuffer();
  const pngPath = path.join(dir, 'broken-png.upload');
  await writeFile(pngPath, png.subarray(0,png.length-40));
  await assert.rejects(prepareImage({ tempPath: pngPath, title:'x', alt:'y' }), { code:'INVALID_IMAGE' });
  assert.deepEqual((await readdir(dir)).sort(), ['broken-jpeg.upload', 'broken-png.upload', 'input.upload']);
});
test('exact 40 million pixels accepted; over the boundary rejected before full decode', async t => {
  const { tempPath } = await fixture(t);
  assert.doesNotThrow(() => checkPixelLimit(8000,5000));
  assert.throws(() => checkPixelLimit(8001,5000), { code:'PIXEL_LIMIT_EXCEEDED' });
  await sharp({ create: { width:8000,height:5000,channels:3,background:'#123456' } }).png().toFile(tempPath);
  assert.equal((await prepareImage({ tempPath,title:'40 MP',alt:'Ngưỡng pixel' })).width,8000);
  await sharp({ create: { width:8001,height:5000,channels:3,background:'#123456' } }).png().toFile(tempPath);
  await assert.rejects(prepareImage({ tempPath,title:'40 MP+',alt:'Vượt ngưỡng' }), { code:'PIXEL_LIMIT_EXCEEDED' });
});
test('exact 10 MiB fixture is a decodable JPEG (COM segments, no arbitrary corrupt padding)', async t => {
  const { tempPath } = await fixture(t);
  const small = await sharp({ create:{ width:16,height:16,channels:3,background:'#aabbcc' } }).jpeg().toBuffer();
  const boundary = padJpeg(small,LIMITS.fileBytes); assert.equal(boundary.length,LIMITS.fileBytes);
  await writeFile(tempPath,boundary);
  const result = await prepareImage({ tempPath,title:'10 MiB',alt:'Đúng ngưỡng' });
  assert.equal(result.variants.length,1);
});

test('APNG animation is explicitly rejected even when the PNG decoder exposes only the first frame', async t => {
  const { tempPath } = await fixture(t);
  const chunk = (type:string, data:Buffer) => {
    const name = Buffer.from(type), crcData = Buffer.concat([name,data]);
    let crc = 0xffffffff;
    for(const byte of crcData){crc ^= byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);
    result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
  };
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
  const actl=Buffer.alloc(8);actl.writeUInt32BE(2,0);
  const control=(sequence:number)=>{const b=Buffer.alloc(26);b.writeUInt32BE(sequence);b.writeUInt32BE(1,4);b.writeUInt32BE(1,8);b.writeUInt16BE(1,20);b.writeUInt16BE(10,22);return b;};
  const sequence=Buffer.alloc(4);sequence.writeUInt32BE(2);
  const apng=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('acTL',actl),chunk('fcTL',control(0)),
    chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('fcTL',control(1)),chunk('fdAT',Buffer.concat([sequence,deflateSync(Buffer.from([0,0,255,0,255]))])),chunk('IEND',Buffer.alloc(0))]);
  await writeFile(tempPath,apng);
  await assert.rejects(prepareImage({tempPath,title:'Animation',alt:'Hai frame'}),{code:'UNSUPPORTED_IMAGE_TYPE'});
});
