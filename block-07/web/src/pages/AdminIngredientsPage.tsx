import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageState from '../components/PageState';
import { PageNumbers } from '../components/DishPagination';
import { useIngredientPage } from '../hooks/useIngredientPage';

export default function AdminIngredientsPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').slice(0, 160);
  const rawPage = params.get('page') || '1';
  const page = /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 1000000 ? Number(rawPage) : 1;
  const [search, setSearch] = useState(q);
  const load = useIngredientPage(q, page);
  useEffect(() => setSearch(q), [q]);
  function go(next: number, keyword = q, replace = false) { setParams({ ...(keyword ? { q: keyword } : {}), page: String(next) }, { replace }); }
  useEffect(() => {
    if (load.status === 'success' && load.data && page > Math.max(1, Math.ceil(load.data.total / 12))) go(Math.max(1, Math.ceil(load.data.total / 12)), q, true);
  }, [load.status, load.data?.total, page]);
  function submit(event: FormEvent) { event.preventDefault(); const next = search.trim(); if (next === q && page === 1) load.reload(); else go(1, next); }
  const returnQuery = `?returnTo=${encodeURIComponent(`/admin/ingredients?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`)}`;
  return <><span className="eyebrow">BẾP NHÀ / QUẢN TRỊ</span><div className="admin-heading"><div><h1>Quản lý nguyên liệu</h1><p>Tìm nguyên liệu, kiểm tra đơn vị và chăm chút công thức.</p></div><Link className="button primary" to={`/admin/ingredients/new${returnQuery}`}>+ Thêm nguyên liệu</Link></div>
    <form className="ingredient-admin-search" role="search" aria-label="Tìm nguyên liệu" onSubmit={submit}><label>Tìm nguyên liệu<input name="ingredientQuery" maxLength={160} value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên nguyên liệu, có dấu hoặc không dấu…" /></label><button className="button primary" type="submit">Tìm nguyên liệu</button><button className="button outline" type="button" onClick={() => { setSearch(''); go(1, ''); load.reload(); }}>Xóa tìm kiếm</button></form>
    <section className="table-panel"><div className="table-panel-heading"><h2>Danh sách nguyên liệu {load.data && <span>{load.data.total}</span>}</h2></div>
      <PageState {...load} loading="table" loadingCount={12} tableColumns={4} onRetry={load.reload} empty={load.status === 'success' && load.data?.items.length === 0} />
      {load.status === 'success' && load.data && <><div className="table-scroll" tabIndex={0} role="region" aria-label="Danh sách nguyên liệu, có thể cuộn ngang" data-resource="ingredients"><table><thead><tr><th scope="col">ID</th><th scope="col">Nguyên liệu</th><th scope="col">Đơn vị</th><th scope="col" className="align-right">Thao tác</th></tr></thead><tbody>{load.data.items.map(item => <tr key={item.id}><td>#{item.id}</td><td><div className="table-name"><span className="table-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span><strong>{item.name}</strong></div></td><td>{item.unit}</td><td><div className="row-actions"><Link to={`/admin/ingredients/${item.id}/edit${returnQuery}`} aria-label={`Sửa ${item.name}`}>Sửa</Link><Link className="danger-link" to={`/admin/ingredients/${item.id}/delete${returnQuery}`} aria-label={`Xóa ${item.name}`}>Xóa</Link></div></td></tr>)}</tbody></table></div>
        <PageNumbers noun="nguyên liệu" page={page} total={load.data.total} pageSize={12} onPage={go} /></>}
    </section></>;
}
