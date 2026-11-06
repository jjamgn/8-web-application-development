import { Router, type Request } from 'express';
import { createSchemas, patchSchemas, validId, type Kind } from '../validation.js';
import * as service from '../services/resources.js';
import { parseDishSearch, searchDishes } from '../services/dish-search.js';
import { parseIngredientSearch, searchIngredients } from '../services/ingredient-search.js';

function idOf(req: Request) {
  const id = validId(String(req.params.id));
  if (!id) throw new service.BusinessError('NOT_FOUND', 'Không tìm thấy bản ghi.');
  return id;
}
function input(kind: Kind, body: unknown, patch = false) {
  const parsed = (patch ? patchSchemas : createSchemas)[kind].safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'body')] ??= issue.message;
    throw new service.BusinessError('VALIDATION_FAILED', 'Dữ liệu không hợp lệ.', fields);
  }
  if (patch && Object.keys(parsed.data).length === 0) {
    throw new service.BusinessError('VALIDATION_FAILED', 'Gửi ít nhất một trường có thể cập nhật.', { body: 'Không có trường hợp lệ để cập nhật.' });
  }
  return parsed.data;
}
export function resourceRouter(kind: Kind) {
  const router = Router();
  router.get('/', async (req, res) => {
    if (kind === 'dishes') {
      res.json({ ok: true, data: service.serialize(await searchDishes(parseDishSearch(req.query))), error: null });
      return;
    }
    // Keep the legacy unparameterized list compatible; admin/picker opt into paging.
    if (kind === 'ingredients' && ['page', 'pageSize', 'q'].some(key => req.query[key] !== undefined)) {
      res.json({ ok: true, data: await searchIngredients(parseIngredientSearch(req.query)), error: null });
      return;
    }
    res.json({ ok: true, data: service.serialize(await service.list(kind, typeof req.query.q === 'string' ? req.query.q.trim() : '')) });
  });
  router.get('/:id', async (req, res) => {
    res.json({ ok: true, data: service.serialize(await service.record(kind, idOf(req))) });
  });
  router.post('/', async (req, res) => {
    res.json({ ok: true, data: service.serialize(await service.save(kind, input(kind, req.body))) });
  });
  router.patch('/:id', async (req, res) => {
    const id = idOf(req);
    res.json({ ok: true, data: service.serialize(await service.save(kind, input(kind, req.body, true), id)) });
  });
  router.delete('/:id', async (req, res) => {
    res.json({ ok: true, data: await service.remove(kind, idOf(req)) });
  });
  return router;
}
