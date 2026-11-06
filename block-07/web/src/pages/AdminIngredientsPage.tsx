import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageState from '../components/PageState';
import { PageNumbers } from '../components/DishPagination';
import { useLoad } from '../hooks/useLoad';
import type { Ingredient } from '../types';

const pageSize = 12;
const normalizeName = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');

function parsePage(value: string | null) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export default function AdminIngredientsPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').slice(0, 120);
  const unit = params.get('unit') || '';
  const sort = params.get('sort') === 'name_desc' ? 'name_desc' : 'name_asc';
  const pageParam = params.get('page');
  const page = parsePage(pageParam);
  const [draft, setDraft] = useState({ q, unit, sort });
  const load = useLoad<Ingredient[]>('/ingredients', 'list');
  useEffect(() => { setDraft({ q, unit, sort }); }, [q, unit, sort]);

  const units = useMemo(() => load.data
    ? [...new Set(load.data.map(item => item.unit))].sort((a, b) => a.localeCompare(b, 'vi')) : [], [load.data]);
  const items = useMemo(() => {
    const query = normalizeName(q);
    const filtered = load.data?.filter(item => (!query || normalizeName(item.name).includes(query)) && (!unit || item.unit === unit)) || [];
    const direction = sort === 'name_desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }) * direction;
      return byName || a.id - b.id;
    });
  }, [load.data, q, unit, sort]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage],
  );
  useEffect(() => {
    if (load.status !== 'success' || (pageParam === null && currentPage === 1) || Number(pageParam) === currentPage) return;
    const next = new URLSearchParams(params);
    if (currentPage === 1) next.delete('page');
    else next.set('page', String(currentPage));
    setParams(next, { replace: true });
  }, [load.status, pageParam, currentPage, params, setParams]);

  const returnPath = params.size ? '/admin/ingredients?' + params.toString() : '/admin/ingredients';
  const returnQuery = '?returnTo=' + encodeURIComponent(returnPath);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (draft.q.trim()) next.set('q', draft.q.trim());
    if (draft.unit) next.set('unit', draft.unit);
    if (draft.sort !== 'name_asc') next.set('sort', draft.sort);
    setParams(next);
    setDraft(current => ({ ...current, q: current.q.trim() }));
  }
  function reset() {
    setDraft({ q: '', unit: '', sort: 'name_asc' });
    setParams({});
  }
  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
  }

  return <>
    <span className="eyebrow">BẾP NHÀ / QUẢN TRỊ</span>
    <div className="admin-heading"><div><h1>Quản lý nguyên liệu</h1><p>Chăm chút từng chi tiết cho căn bếp của bạn.</p></div>
      <Link className="button primary" to={'/admin/ingredients/new' + returnQuery}>+ Thêm nguyên liệu</Link></div>
    <form className="dish-filters ingredient-filters" onSubmit={submit} role="search" aria-label="Tìm kiếm và lọc nguyên liệu">
      <div className="filter-search">
        <label><span>Tìm theo tên nguyên liệu</span><input name="q" type="search" maxLength={120} value={draft.q}
          placeholder="Nhập tên nguyên liệu..." onChange={event => setDraft(current => ({ ...current, q: event.target.value }))} /></label>
        <label><span id="ingredient-unit-label">Đơn vị</span><select name="unit" aria-labelledby="ingredient-unit-label" value={draft.unit} onChange={event => setDraft(current => ({ ...current, unit: event.target.value }))}>
          <option value="">Tất cả đơn vị</option>
          {draft.unit && !units.includes(draft.unit) && <option value={draft.unit}>{draft.unit}</option>}
          {units.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label><span id="ingredient-sort-label">Sắp xếp</span><select name="sort" aria-labelledby="ingredient-sort-label" value={draft.sort} onChange={event => setDraft(current => ({ ...current, sort: event.target.value as 'name_asc' | 'name_desc' }))}>
          <option value="name_asc">Tên A → Z</option>
          <option value="name_desc">Tên Z → A</option>
        </select></label>
      </div>
      <div className="filter-actions"><small>Tìm theo tên có dấu hoặc không dấu, kết hợp lọc đơn vị.</small>
        <button className="button outline" type="button" onClick={reset}>Xóa điều kiện</button>
        <button className="button primary" type="submit">Tìm nguyên liệu</button></div>
    </form>
    <section className="table-panel">
      <div className="table-panel-heading"><h2>Danh sách nguyên liệu {load.status === 'success' && <span>{items.length}</span>}</h2></div>

      <PageState {...load} onRetry={load.reload} loadingVariant="table" columns={4} loadingLabel="Đang tải danh sách nguyên liệu…" empty={load.status === 'success' && items.length === 0} />
      {load.status === 'success' && items.length > 0 && <>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Danh sách nguyên liệu, có thể cuộn ngang" data-resource="ingredients">
          <table><thead><tr><th scope="col">ID</th><th scope="col">Nguyên liệu</th><th scope="col">Đơn vị</th><th scope="col" className="align-right">Thao tác</th></tr></thead>
            <tbody>{visibleItems.map(item => <tr key={item.id}>
              <td className="muted">#{item.id}</td>
              <td><div className="table-name"><span className="table-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span><strong title={item.name}>{item.name}</strong></div></td>
              <td>{item.unit}</td>
              <td><div className="row-actions"><Link to={'/admin/ingredients/' + item.id + '/edit' + returnQuery} aria-label={'Sửa ' + item.name}>Sửa</Link>
                <Link className="danger-link" to={'/admin/ingredients/' + item.id + '/delete' + returnQuery} aria-label={'Xóa ' + item.name}>Xóa</Link></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <PageNumbers page={currentPage} total={items.length} pageSize={pageSize} onPage={changePage}
          ariaLabel="Phân trang nguyên liệu" />
      </>}
    </section>
    <p className="admin-hint">Mọi thao tác xóa đều cần xác nhận</p>
  </>;
}
