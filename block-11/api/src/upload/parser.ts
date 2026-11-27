import busboy from 'busboy';
import type { Request } from 'express';
import { mkdtemp, open, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { LIMITS, codePoints, type ApiError } from '../../../contracts/index.js';
import { AppError } from '../errors.js';

const metadataItem = z.object({
  title: z.string().trim().refine(v => codePoints(v) >= 1 && codePoints(v) <= 120),
  alt: z.string().trim().refine(v => codePoints(v) >= 1 && codePoints(v) <= 300)
}).strict();
export type StagedFile = { index: number; tempPath: string; error?: ApiError };
export type StagedUpload = { files: StagedFile[]; metadata: { title: string; alt: string }[]; dispose(): Promise<void> };
const invalidMultipart = () => new AppError('INVALID_MULTIPART', 400, 'Dữ liệu multipart không hợp lệ.');
const invalidCount = () => new AppError('INVALID_FILE_COUNT', 400, 'Chọn từ 1 đến 5 ảnh.');
const invalidMetadata = () => new AppError('INVALID_METADATA', 400, 'Tiêu đề hoặc mô tả ảnh không hợp lệ.');
export function checkBodyBytes(bytes: number) {
  if (bytes > LIMITS.bodyBytes) throw new AppError('REQUEST_TOO_LARGE', 413, 'Request vượt quá 55 MiB.');
}

// The parser finishes receiving the ENTIRE request before a service can publish any file.
export async function stageUpload(req: Request, tempRoot: string): Promise<StagedUpload> {
  if (!/^multipart\/form-data(?:;|$)/i.test(req.headers['content-type'] ?? ''))
    throw new AppError('UNSUPPORTED_CONTENT_TYPE', 415, 'Cần gửi multipart/form-data.');
  if (req.headers['content-length']) checkBodyBytes(Number(req.headers['content-length']));
  let parser: ReturnType<typeof busboy>;
  try { parser = busboy({ headers: req.headers, defParamCharset: 'utf8',
    limits: { files: LIMITS.files + 1, fields: 2, parts: LIMITS.files + 3, fieldSize: LIMITS.metadataBytes + 1 } }); }
  catch { throw invalidMultipart(); }
  const dir = await mkdtemp(path.join(tempRoot, 'request-'));
  const dispose = () => rm(dir, { recursive: true, force: true });
  const files: StagedFile[] = [];
  const writes: Promise<void>[] = [];
  let metadata: string | undefined;
  let bytes = 0;
  let failure: unknown;
  const markFailure = (error: unknown) => { failure ??= error; };
  parser.on('field', (name, value, info) => {
    if (name !== 'metadata' || metadata !== undefined || info.nameTruncated || info.valueTruncated || Buffer.byteLength(value) > LIMITS.metadataBytes) {
      markFailure(invalidMetadata()); return;
    }
    metadata = value;
  });
  parser.on('file', (name, stream: Readable) => {
    // Busboy may reject a malformed trailing boundary before async open() completes.
    stream.on('error', markFailure);
    const index = files.length;
    const file: StagedFile = { index, tempPath: path.join(dir, `${index}.upload`) };
    files.push(file);
    if (name !== 'photos') markFailure(invalidMultipart());
    if (files.length > LIMITS.files) markFailure(invalidCount());
    writes.push((async () => {
      const handle = await open(file.tempPath, 'wx');
      let size = 0;
      try {
        for await (const part of stream) {
          const buffer = part as Buffer;
          size += buffer.length;
          if (size > LIMITS.fileBytes) file.error = { code: 'FILE_TOO_LARGE', message: 'Ảnh vượt quá 10 MiB.' };
          if (!file.error && !failure) await handle.writeFile(buffer);
        }
      } finally { await handle.close(); }
    })().catch(error => { markFailure(error); stream.resume(); }));
  });
  parser.on('filesLimit', () => markFailure(invalidCount()));
  parser.on('fieldsLimit', () => markFailure(invalidMetadata()));
  parser.on('partsLimit', () => markFailure(invalidMultipart()));
  const onData = (buffer: Buffer) => {
    bytes += buffer.length;
    try { checkBodyBytes(bytes); } catch (error) {
      // Do not destroy the HTTP socket: keep it available for the 413 response.
      failure = error; req.unpipe(parser); parser.destroy(error as Error); req.resume();
    }
  };
  const onAborted = () => { markFailure(invalidMultipart()); parser.destroy(invalidMultipart()); };
  const onRequestError = (error: Error) => { markFailure(error); parser.destroy(error); };
  try {
    await new Promise<void>(resolve => {
      parser.on('error', markFailure);
      parser.once('close', resolve);
      req.on('data', onData);
      req.once('aborted', onAborted);
      req.once('error', onRequestError);
      req.pipe(parser);
    });
    await Promise.all(writes);
    if (failure) throw failure;
    if (files.length < 1 || files.length > LIMITS.files) throw invalidCount();
    let value: unknown;
    try { value = JSON.parse(metadata ?? ''); } catch { throw invalidMetadata(); }
    const result = z.array(metadataItem).length(files.length).safeParse(value);
    if (!result.success) throw invalidMetadata();
    return { files, metadata: result.data, dispose };
  } catch (error) {
    await Promise.all(writes);
    await dispose();
    if (error instanceof AppError) throw error;
    // Busboy syntax errors are request errors; filesystem errors remain server errors.
    if (error instanceof Error && /multipart|boundary|unexpected end|malformed part/i.test(error.message)) throw invalidMultipart();
    throw error;
  } finally {
    req.off('data', onData); req.off('aborted', onAborted); req.off('error', onRequestError); req.unpipe(parser);
  }
}
