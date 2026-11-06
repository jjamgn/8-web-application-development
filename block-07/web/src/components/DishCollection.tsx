import { useSearchParams } from 'react-router-dom';
import DishCard from './DishCard';
import DishFilters from './DishFilters';
import PageState from './PageState';
import { MoreDishes } from './DishPagination';
import { useDishPagination } from '../hooks/useDishPagination';
import { defaultQuery, parseQuery, queryParams } from '../lib/dishes';

export default function DishCollection({ infinite = false }: { infinite?: boolean }) {
  const [params, setParams] = useSearchParams();
  const query = parseQuery(params);
  const load = useDishPagination(query, true);
  return <><DishFilters value={query} searchMode={load.searchMode} onApply={next => { const p = queryParams(next, false); if (p.toString() === params.toString()) load.reload(); else setParams(p); }} onReset={() => { setParams(queryParams(defaultQuery, false)); load.reload(); }} />
    {load.status === 'success' && <p className="result-count search-count" aria-live="polite">{load.total} món{query.q && ` cho “${query.q}”`}</p>}
    <PageState {...load} onRetry={load.reload} loadingVariant="cards" loadingLabel="Đang tải thực đơn…" empty={load.status === 'success' && load.items.length === 0} />
    {load.status === 'success' && <div className="dish-grid">{load.items.map(dish => <DishCard key={dish.id} dish={dish} />)}</div>}
    <MoreDishes load={load} infinite={infinite} />
  </>;
}
