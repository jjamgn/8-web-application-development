import { Link, useParams } from 'react-router-dom';
import PageState from '../components/PageState';
import { imageSource, money, validId } from '../config/resources';
import { useLoad } from '../hooks/useLoad';
import type { Dish } from '../types';
import NotFoundPage from './NotFoundPage';

export default function DishDetailPage() {
  const { id } = useParams();
  const load = useLoad<Dish>(validId(id) ? `/dishes/${id}` : null);
  if (!validId(id)) return <NotFoundPage />;
  if (load.status !== 'success') return <main className="detail-page"><PageState {...load} onRetry={load.reload} loadingVariant="detail" loadingLabel="Đang tải chi tiết món ăn…" /></main>;
  const dish = load.data;
  return <main className="detail-page"><nav className="breadcrumbs" aria-label="Vị trí trang"><Link to="/dishes">Thực đơn</Link><span>/</span><span>{dish.category}</span><span>/</span><span>{dish.name}</span></nav>
    <section className="detail-grid"><div className="detail-image"><img src={imageSource(dish.imageUrl, dish.imagePath)} alt={dish.name} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/beef.png'; }} /><span className="detail-image-note">TỪ CĂN BẾP BẾP NHÀ · NẤU BẰNG CẢ TẤM LÒNG</span>{dish.imageUrl?.startsWith('/images/sourced/') && <a className="image-credit" href={`/images/sourced/credits.html#dish-${dish.id}`} target="_blank" rel="noopener noreferrer">Nguồn ảnh minh họa ↗</a>}</div>
      <div className="detail-copy"><span className="eyebrow">{dish.category}</span><h1>{dish.name}</h1><span className={`status ${dish.available ? '' : 'off'}`}>{dish.available ? '● Đang phục vụ' : '● Tạm hết món'}</span>
        <p className="detail-description">{dish.description}</p><div className="detail-price">{money(dish.price)}<small> / phần</small></div>
        {dish.chef && <div className="chef-box"><span className="chef-avatar">{dish.chef.name.slice(0, 1)}</span><div><small>CHĂM CHÚT BỞI ĐẦU BẾP</small><strong>{dish.chef.name}</strong><span>{dish.chef.specialties.map(item => item.name).join(' · ')}</span>{dish.chef.bio && <p className="chef-bio">{dish.chef.bio}</p>}</div></div>}
        {!!dish.ingredients?.length && <div className="ingredients"><h3>Những nguyên liệu làm nên hương vị</h3><ul>{dish.ingredients.filter(r => r.ingredient).map((row, i) => <li key={row.ingredientId ?? i}><span>{row.ingredient!.name}</span><span>{row.quantity} {row.ingredient!.unit}</span></li>)}</ul><p>Vui lòng báo cho nhân viên nếu bạn có dị ứng thực phẩm.</p></div>}
        <Link className="button outline detail-back" to="/dishes">← Trở lại thực đơn</Link>
      </div></section></main>;
}
