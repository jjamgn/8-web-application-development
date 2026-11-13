import { useEffect, useState, type FormEvent } from 'react';
import { categories } from '../config/resources';
import { defaultQuery, type DishQuery, type SearchMode } from '../lib/dishes';

export default function DishFilters({ value, searchMode, onApply, onReset }: { value: DishQuery; searchMode?: SearchMode; onApply: (value: DishQuery) => void; onReset: () => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const activeSearchMode = value.q && draft.q.trim() === value.q ? searchMode : undefined;
  const byRelevance = activeSearchMode === 'fuzzy';
  const signature = JSON.stringify(value);
  useEffect(() => { setDraft(value); setError(''); }, [signature]); // URL restores the complete applied form.
  function update(key: keyof DishQuery, next: string) { setDraft(d => ({ ...d, [key]: next })); setError(''); }
  function submit(event: FormEvent) {
    event.preventDefault();
    for (const key of ['minPrice', 'maxPrice'] as const) {
      if (draft[key] !== '' && (!/^\d+$/.test(draft[key]) || Number(draft[key]) > 999999999)) { setError('Giá phải là số nguyên từ 0 đến 999.999.999đ.'); return; }
    }
    if (draft.minPrice !== '' && draft.maxPrice !== '' && Number(draft.minPrice) > Number(draft.maxPrice)) { setError('Giá từ không được lớn hơn giá đến.'); return; }
    const next = { ...draft, q: draft.q.trim(), page: 1 };
    next.sort = draft.sort === 'relevance' ? defaultQuery.sort : draft.sort;
    onApply(next);
  }
  return <form className="dish-filters" onSubmit={submit} role="search" aria-label="Tìm kiếm và lọc món ăn">
    <div className="filter-search"><label>Tìm món ăn<input name="q" value={draft.q} onChange={e => update('q', e.target.value)} maxLength={160} placeholder="Bạn muốn tìm hương vị nào?" /></label></div>
    <div className="filter-fields"><label>Danh mục<select name="category" value={draft.category} onChange={e => update('category', e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Giá từ (đ)<input name="minPrice" type="number" min="0" max="999999999" step="1" value={draft.minPrice} onChange={e => update('minPrice', e.target.value)} placeholder="0" aria-describedby={error ? 'filter-price-error' : undefined} aria-invalid={!!error} /></label>
      <label>Giá đến (đ)<input name="maxPrice" type="number" min="0" max="999999999" step="1" value={draft.maxPrice} onChange={e => update('maxPrice', e.target.value)} placeholder="Không giới hạn" aria-describedby={error ? 'filter-price-error' : undefined} aria-invalid={!!error} /></label>
      <label>Trạng thái<select name="available" value={draft.available} onChange={e => update('available', e.target.value)}><option value="">Tất cả trạng thái</option><option value="true">Đang phục vụ</option><option value="false">Tạm hết</option></select></label>
      <label>Sắp xếp<select name="sort" value={byRelevance ? 'relevance' : draft.sort === 'relevance' ? 'name_asc' : draft.sort} disabled={byRelevance} onChange={e => update('sort', e.target.value)}>{byRelevance ? <option value="relevance">Phù hợp nhất</option> : <><option value="name_asc">Tên A → Z</option><option value="name_desc">Tên Z → A</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option></>}</select></label></div>
    {error && <p className="field-error" id="filter-price-error" role="alert">{error}</p>}
    <div className="filter-actions"><small>{activeSearchMode === 'fuzzy' ? 'Gợi ý món có tên hoặc nguyên liệu gần giống, có dấu hoặc không dấu.' : activeSearchMode === 'fulltext' ? 'Kết quả phù hợp với tên, mô tả hoặc nguyên liệu, có dấu hoặc không dấu.' : 'Tìm theo tên, mô tả hoặc nguyên liệu; không cần gõ dấu.'}</small><button className="button outline" type="button" onClick={onReset}>Xóa điều kiện</button><button className="button primary" type="submit">Tìm món</button></div>
  </form>;
}
