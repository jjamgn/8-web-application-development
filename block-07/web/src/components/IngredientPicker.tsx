import { useState } from 'react';
import { useIngredientPage } from '../hooks/useIngredientPage';
import type { SelectedIngredient } from '../lib/ingredients';
import { errorMessage } from '../lib/api';
import { PageNumbers } from './DishPagination';
import Skeleton from './Skeleton';
import './ingredients.css';

export default function IngredientPicker({ value, onChange, error }: { value: SelectedIngredient[]; onChange: (rows: SelectedIngredient[]) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const load = useIngredientPage(q, page, 8, 250);
  const ids = new Set(value.map(item => item.ingredientId));
  return <section className="ingredient-picker" data-ingredients aria-labelledby="ingredient-picker-heading"><h2 id="ingredient-picker-heading">Nguyên liệu của món</h2><p className="form-help">Tìm và chọn nguyên liệu, sau đó nhập số lượng theo đơn vị bên cạnh. Có thể tìm không dấu.</p>
    <label htmlFor="ingredient-picker-query">Tìm nguyên liệu để thêm<input id="ingredient-picker-query" name="ingredientSearch" onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} value={q} maxLength={160} placeholder="Ví dụ: muc, rau thom, dau hu…" onChange={e => { setQ(e.target.value); setPage(1); }} /></label>
    <div className="ingredient-picker-results" aria-busy={load.status === 'loading'}>
      {load.status === 'loading' && <Skeleton variant="options" count={4} label="Đang tải nguyên liệu…" />}
      {load.status === 'error' && <div className="alert" role="alert">{errorMessage(load.error)} <button type="button" className="text-button" onClick={load.reload}>Thử lại nguyên liệu</button></div>}
      {load.status === 'success' && load.data && <>{load.data.items.length === 0 && <p role="status" className="form-help">Chưa có nguyên liệu phù hợp. Thử một tên khác.</p>}<ul className="ingredient-options">{load.data.items.map(item => <li key={item.id}><div><strong>{item.name}</strong><small>Đơn vị: {item.unit}</small></div><button type="button" className="button outline" disabled={ids.has(item.id) || value.length >= 100} aria-label={`${ids.has(item.id) ? 'Đã chọn' : 'Chọn'} ${item.name}`} onClick={() => onChange([...value, { ingredientId: item.id, name: item.name, unit: item.unit, quantity: '1' }])}>{ids.has(item.id) ? 'Đã chọn' : '+ Chọn'}</button></li>)}</ul>
        <PageNumbers noun="nguyên liệu" page={page} total={load.data.total} pageSize={8} onPage={setPage} /></>}
    </div>
    <h3>Đã chọn ({value.length}/100)</h3>
    {value.length === 0 && <p className="form-help">Chưa chọn nguyên liệu. Bạn có thể bổ sung công thức sau.</p>}
    <ul className="selected-ingredients">{value.map(item => <li key={item.ingredientId}><strong>{item.name}</strong><label htmlFor={`quantity-${item.ingredientId}`}>Số lượng ({item.unit})<input id={`quantity-${item.ingredientId}`} name={`quantity-${item.ingredientId}`} type="number" min="0.01" max="99999999.99" step="0.01" inputMode="decimal" value={item.quantity} aria-invalid={!!error && (Number(item.quantity) <= 0 || !item.quantity)} onChange={e => onChange(value.map(row => row.ingredientId === item.ingredientId ? { ...row, quantity: e.target.value } : row))} /></label><button type="button" className="text-button danger-link" aria-label={`Bỏ ${item.name}`} onClick={() => onChange(value.filter(row => row.ingredientId !== item.ingredientId))}>Bỏ chọn</button></li>)}</ul>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
