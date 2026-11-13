import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageState from '../components/PageState';
import { useLoad } from '../hooks/useLoad';
import type { Ingredient } from '../types';

const normalizeName = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');

export default function AdminIngredientsPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').slice(0, 120);
  const unit = params.get('unit') || '';
  const [draft, setDraft] = useState({ q, unit });
  const load = useLoad<Ingredient[]>('/ingredients', 'list');
  useEffect(() => { setDraft({ q, unit }); }, [q, unit]);

  const units = useMemo(() => load.data
    ? [...new Set(load.data.map(item => item.unit))].sort((a, b) => a.localeCompare(b, 'vi')) : [], [load.data]);
  const items = useMemo(() => {
    const query = normalizeName(q);
    return load.data?.filter(item => (!query || normalizeName(item.name).includes(query)) && (!unit || item.unit === unit)) || [];
  }, [load.data, q, unit]);
  const returnPath = `/admin/ingredients${params.size ? `?${params}` : ''}`;
  const returnQuery = `?returnTo=${encodeURIComponent(returnPath)}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (draft.q.trim()) next.set('q', draft.q.trim());
    if (draft.unit) next.set('unit', draft.unit);
    setParams(next);
    setDraft(current => ({ ...current, q: current.q.trim() }));
  }
  function reset() {
    setDraft({ q: '', unit: '' });
    setParams({});
  }

  return <>
    <span className="eyebrow">BẾP NHÀ / QUẢN TRỊ</span>
    <div className="admin-heading"><div><h1>Quản lý nguyên liệu</h1><p>Chăm chút từng chi tiết cho căn bếp của bạn.</p></div>
      <Link className="button primary" to={`/admin/ingredients/new${returnQuery}`}>+ Thêm nguyên liệu</Link></div>
    <form className="dish-filters ingredient-filters" onSubmit={submit} role="search" aria-label="Tìm kiếm và lọc nguyên liệu">
      <div className="filter-search">
        <label>Tìm theo tên nguyên liệu<input name="q" type="search" maxLength={120} value={draft.q}
          placeholder="Nhập tên nguyên liệu..." onChange={event => setDraft(current => ({ ...current, q: event.target.value }))} /></label>
        <label><span id="ingredient-unit-label">Đơn vị</span><select name="unit" aria-labelledby="ingredient-unit-label" value={draft.unit} onChange={event => setDraft(current => ({ ...current, unit: event.target.value }))}>
          <option value="">Tất cả đơn vị</option>
          {draft.unit && !units.includes(draft.unit) && <option value={draft.unit}>{draft.unit}</option>}
          {units.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <div className="filter-actions"><small>Tìm theo tên có dấu hoặc không dấu, kết hợp lọc đơn vị.</small>
        <button className="button outline" type="button" onClick={reset}>Xóa điều kiện</button>
        <button className="button primary" type="submit">Tìm nguyên liệu</button></div>
    </form>
    <section className="table-panel">
      <div className="table-panel-heading"><h2>Danh sách nguyên liệu {load.status === 'success' && <span>{items.length}</span>}</h2></div>
      {load.status === 'success' && <p className="ingredient-results result-count" role="status" aria-live="polite">{items.length} / {load.data.length} nguyên liệu</p>}
      <PageState {...load} onRetry={load.reload} empty={load.status === 'success' && items.length === 0} />
      {load.status === 'success' && items.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label="Danh sách nguyên liệu, có thể cuộn ngang" data-resource="ingredients">
        <table><thead><tr><th scope="col">ID</th><th scope="col">Nguyên liệu</th><th scope="col">Đơn vị</th><th scope="col" className="align-right">Thao tác</th></tr></thead>
          <tbody>{items.map(item => <tr key={item.id}>
            <td className="muted">#{item.id}</td>
            <td><div className="table-name"><span className="table-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span><strong title={item.name}>{item.name}</strong></div></td>
            <td>{item.unit}</td>
            <td><div className="row-actions"><Link to={`/admin/ingredients/${item.id}/edit${returnQuery}`} aria-label={`Sửa ${item.name}`}>Sửa</Link>
              <Link className="danger-link" to={`/admin/ingredients/${item.id}/delete${returnQuery}`} aria-label={`Xóa ${item.name}`}>Xóa</Link></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    <p className="admin-hint">Mọi thao tác xóa đều cần xác nhận</p>
  </>;
}
