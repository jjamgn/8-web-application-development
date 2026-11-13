import DishImage from '../components/DishImage';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DishFilters from '../components/DishFilters';
import { PageNumbers } from '../components/DishPagination';
import PageState from '../components/PageState';
import { money } from '../config/resources';
import { useDishPagination } from '../hooks/useDishPagination';
import { defaultQuery, parseQuery, queryParams } from '../lib/dishes';

export default function AdminDishesPage() {
  const [params, setParams] = useSearchParams();
  const query = parseQuery(params);
  const load = useDishPagination(query, false);
  const returnQuery = `?returnTo=${encodeURIComponent(`/admin/dishes?${queryParams(query)}`)}`;
  useEffect(() => {
    if (load.status === 'success' && query.page > Math.max(1, Math.ceil(load.total / query.pageSize))) setParams(queryParams({ ...query, page: Math.max(1, Math.ceil(load.total / query.pageSize)) }), { replace: true });
  }, [load.status, load.total, query.page, query.pageSize]);
  return <><span className="eyebrow">BẾP NHÀ / QUẢN TRỊ</span><div className="admin-heading"><div><h1>Quản lý món ăn</h1><p>Chăm chút từng chi tiết cho căn bếp của bạn.</p></div><Link className="button primary" to={`/admin/dishes/new${returnQuery}`}>+ Thêm món ăn</Link></div>
    <DishFilters value={query} searchMode={load.searchMode} onApply={next => { const p = queryParams(next); if (p.toString() === params.toString()) load.reload(); else setParams(p); }} onReset={() => { setParams(queryParams(defaultQuery)); load.reload(); }} />
    <section className="table-panel"><div className="table-panel-heading"><h2>Danh sách món ăn {load.status === 'success' && <span>{load.total}</span>}</h2></div>
      <PageState {...load} onRetry={load.reload} loadingVariant="table" columns={6} loadingLabel="Đang tải danh sách món ăn…" empty={load.status === 'success' && load.items.length === 0} />
      {load.status === 'success' && load.items.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label="Danh sách món ăn, có thể cuộn ngang" data-resource="dishes"><table><thead><tr><th>ID</th><th>Món ăn</th><th>Danh mục</th><th>Giá / phần</th><th>Trạng thái</th><th className="align-right">Thao tác</th></tr></thead><tbody>{load.items.map(dish => <tr key={dish.id}><td className="muted">#{dish.id}</td><td><div className="table-name"><DishImage imageUrl={dish.imageUrl} imagePath={dish.imagePath} alt="" /><strong title={dish.name}>{dish.name}</strong></div></td><td>{dish.category}</td><td>{money(dish.price)}</td><td><span className={`status ${dish.available ? '' : 'off'}`}>{dish.available ? '● Đang phục vụ' : '● Tạm hết'}</span></td><td><div className="row-actions"><Link to={`/dishes/${dish.id}`}>Xem</Link><Link to={`/admin/dishes/${dish.id}/edit${returnQuery}`} aria-label={`Sửa ${dish.name}`}>Sửa</Link><Link className="danger-link" to={`/admin/dishes/${dish.id}/delete${returnQuery}`} aria-label={`Xóa ${dish.name}`}>Xóa</Link></div></td></tr>)}</tbody></table></div>}
      {load.status === 'success' && <PageNumbers page={query.page} total={load.total} pageSize={query.pageSize} onPage={page => setParams(queryParams({ ...query, page }))} />}
    </section><p className="admin-hint">Mọi thao tác xóa đều cần xác nhận</p></>;
}
