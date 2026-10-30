import DishImage from '../components/DishImage';
import AdminDishesPage from './AdminDishesPage';
import AdminIngredientsPage from './AdminIngredientsPage';
import '../components/ingredients.css';
import { Link } from 'react-router-dom';
import PageState from '../components/PageState';
import { money, resources } from '../config/resources';
import { useLoad } from '../hooks/useLoad';
import type { Entity, Resource } from '../types';

export default function AdminListPage({ resource }: { resource: Resource }) {
  return resource === 'dishes' ? <AdminDishesPage /> : resource === 'ingredients' ? <AdminIngredientsPage /> : <LegacyAdminListPage resource={resource} />;
}

function LegacyAdminListPage({ resource }: { resource: Resource }) {
  const config = resources[resource];
  const load = useLoad<Entity[]>(`/${resource}`, 'list');
  return <>
    <span className="eyebrow">BẾP NHÀ / QUẢN TRỊ</span><div className="admin-heading"><div><h1>Quản lý {config.singular}</h1><p>Chăm chút từng chi tiết cho căn bếp của bạn.</p></div><Link className="button primary" to={`/admin/${resource}/new`}>+ Thêm {config.singular}</Link></div>
    <section className="table-panel"><div className="table-panel-heading"><h2>Danh sách {config.singular} {load.status === 'success' && <span>{load.data.length}</span>}</h2></div>
      <PageState {...load} loading="table" tableColumns={config.columns.length + 3} onRetry={load.reload} empty={load.status === 'success' && load.data.length === 0} />
      {load.status === 'success' && load.data.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label={`Danh sách ${config.singular}, có thể cuộn ngang`} data-resource={resource}><table><thead><tr><th scope="col">ID</th><th scope="col">{config.label}</th>{config.columns.map(col => <th scope="col" key={col.key}>{col.label}</th>)}<th scope="col" className="align-right">Thao tác</th></tr></thead>
        <tbody>{load.data.map(item => {
          const values = item as unknown as Record<string, unknown>;
          return <tr key={item.id}><td className="muted">#{item.id}</td><td><div className="table-name">{resource === 'dishes' ? <DishImage imageUrl={typeof values.imageUrl === 'string' ? values.imageUrl : undefined} imagePath={typeof values.imagePath === 'string' ? values.imagePath : undefined} alt={item.name} /> : <span className="table-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span>}<strong title={item.name}>{item.name}</strong></div></td>
            {config.columns.map(col => <td key={col.key}>{col.key === 'price' ? money(Number(values.price)) : col.key === 'available'
              ? <span className={`status ${values.available ? '' : 'off'}`}>{values.available ? '● Đang phục vụ' : '● Tạm hết'}</span> : String(values[col.key] ?? '—')}</td>)}
            <td><div className="row-actions">{resource === 'dishes' && <Link to={`/dishes/${item.id}`} aria-label={`Xem ${item.name}`}>Xem</Link>}<Link to={`/admin/${resource}/${item.id}/edit`} aria-label={`Sửa ${item.name}`}>Sửa</Link><Link className="danger-link" to={`/admin/${resource}/${item.id}/delete`} aria-label={`Xóa ${item.name}`}>Xóa</Link></div></td>
          </tr>;
        })}</tbody></table></div>}
    </section><p className="admin-hint">Mọi thao tác xóa đều cần xác nhận</p>
  </>;
}
