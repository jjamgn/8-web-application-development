import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Chef } from '../types';
import Skeleton from './Skeleton';
import './chef-picker.css';

type Props = { value: string; chefs: Chef[]; loading: boolean; failed: boolean; onRetry: () => void; onChange: (id: string) => void; error?: string };
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi').trim();
const chefSpecialties = (chef: Chef) => chef.specialties.map(specialty => specialty.name).join(' · ');

export default function ChefPicker({ value, chefs, loading, failed, onRetry, onChange, error }: Props) {
  const [search, setSearch] = useState('');
  const selected = chefs.find(chef => String(chef.id) === value);
  const keyword = normalize(search);
  const matches = chefs.filter(chef => normalize(`${chef.name} ${chefSpecialties(chef)}`).includes(keyword));
  return <section className="chef-picker" aria-labelledby="chef-picker-heading">
    <h2 id="chef-picker-heading">Đầu bếp phụ trách <span aria-hidden="true">*</span></h2>
    <p className="form-help">Tìm theo tên hoặc chuyên môn rồi chọn một đầu bếp. Hỗ trợ tìm không dấu.</p>
    <input type="hidden" name="chefId" value={value} />
    <label htmlFor="field-chefId">Tìm đầu bếp<input id="field-chefId" name="chefSearch" maxLength={160} value={search} placeholder="Ví dụ: minh an, mon chay, hai san…" aria-invalid={!!error} aria-describedby={error ? 'field-chefId-error' : undefined} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} /></label>
    <div className="chef-picker-results" aria-busy={loading}>
      {loading && <Skeleton variant="field" count={3} label="Đang tải danh sách đầu bếp…" />}
      {failed && <div className="alert" role="alert">Chưa tải được danh sách đầu bếp. <button type="button" className="text-button" onClick={onRetry}>Thử lại đầu bếp</button></div>}
      {!loading && !failed && <>{chefs.length === 0 ? <p className="form-help">Cần có đầu bếp trước khi thêm món. <Link to="/admin/chefs/new" className="text-link">Thêm đầu bếp</Link></p> : matches.length === 0 ? <p className="form-help" role="status">Chưa tìm thấy đầu bếp phù hợp. Thử tên hoặc chuyên môn khác.</p> : <ul className="chef-options">{matches.map(chef => {
        const active = String(chef.id) === value;
        return <li key={chef.id}><button type="button" data-chef-id={chef.id} className={`chef-option${active ? ' is-selected' : ''}`} aria-pressed={active} aria-label={`${active ? 'Đã chọn' : 'Chọn'} ${chef.name}`} onClick={() => onChange(String(chef.id))}><span className="chef-option-avatar" aria-hidden="true">{chef.name.slice(0, 1)}</span><span className="chef-option-copy"><strong>{chef.name}</strong><small>{chefSpecialties(chef)}</small></span><span className="chef-option-action" aria-hidden="true">{active ? '✓ Đã chọn' : 'Chọn'}</span></button></li>;
      })}</ul>}</>}
    </div>
    {!loading && !failed && <div className="chef-current" role="status">{selected ? <><span>Đầu bếp đã chọn</span><strong>{selected.name}</strong><small>{chefSpecialties(selected)}</small></> : value ? <p className="field-error">Đầu bếp hiện tại không còn trong danh sách. Vui lòng chọn lại.</p> : <span>Chưa chọn đầu bếp.</span>}</div>}
    {error && <p className="field-error" id="field-chefId-error" role="alert">{error}</p>}
  </section>;
}
