import { useEffect, useMemo, useRef, useState } from 'react';
import type { Specialty } from '../types';

const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

export default function SearchableSpecialtyFilter({ options, value, onChange, disabled, labelId }: {
  options: Specialty[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
  labelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    return options.filter(option => !needle || normalize(option.name).includes(needle));
  }, [options, query]);
  const selected = useMemo(() => options.filter(option => value.includes(option.id)), [options, value]);
  const summary = value.length === 0 ? 'Tất cả chuyên môn' : value.length + ' chuyên môn đã chọn';

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  }

  return <div className="specialty-filter" ref={root}>
    <button type="button" className="specialty-filter-trigger" aria-labelledby={labelId}
      aria-describedby="chef-specialty-summary" aria-expanded={open} aria-controls="chef-specialty-options"
      disabled={disabled} onClick={() => { setOpen(current => !current); setQuery(''); }}>
      <span id="chef-specialty-summary">{summary}</span>
    </button>
    {open && <div className="specialty-filter-popover" id="chef-specialty-options">
      {selected.length > 0 && <div className="specialty-filter-selected" role="group" aria-label="Chuyên môn đã chọn">
        {selected.map(option => <span className="specialty-tag" key={option.id}>
          {option.name}
          <button type="button" className="specialty-tag-remove" aria-label={`Bỏ lọc chuyên môn ${option.name}`}
            onClick={() => toggle(option.id)}>×</button>
        </span>)}
      </div>}
      <input type="search" autoFocus aria-label="Tìm trong danh mục chuyên môn"
        placeholder="Tìm chuyên môn..." value={query} onChange={event => setQuery(event.target.value)} />
      <div className="specialty-filter-options" role="group" aria-label="Chọn chuyên môn">
        {matches.length ? matches.map(option => <label className="specialty-filter-option" key={option.id}>
          <input type="checkbox" checked={value.includes(option.id)} onChange={() => toggle(option.id)} />
          <span>{option.name}</span>
        </label>) : <p className="specialty-filter-empty">Không tìm thấy chuyên môn phù hợp.</p>}
      </div>
      <button type="button" className="text-button specialty-filter-clear" disabled={!value.length}
        onClick={() => onChange([])}>Xóa lựa chọn</button>
    </div>}
  </div>;
}
