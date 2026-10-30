import { Link } from 'react-router-dom';
import { imageSource, money } from '../config/resources';
import type { Dish } from '../types';

export default function DishCard({ dish }: { dish: Dish }) {
  const destination = `/dishes/${dish.id}`;
  return <article className="dish-card"><Link className="dish-image" to={destination}>
    <img src={imageSource(dish.imageUrl, dish.imagePath)} alt={dish.name} loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/beef.png'; }} />
    <span className="card-category">{dish.category}</span>{!dish.available && <span className="unavailable">Tạm hết món</span>}<span className="image-arrow" aria-hidden="true">↗</span>
  </Link><div className="card-body"><div className="card-title"><h3><Link to={destination}>{dish.name}</Link></h3><span>{money(dish.price)}</span></div><p>{dish.description}</p>
    <div className="card-bottom"><span>♧ {dish.chef?.name || 'Căn bếp Bếp Nhà'}</span><Link to={destination}>Khám phá món <span aria-hidden="true">→</span></Link></div>
  </div></article>;
}
