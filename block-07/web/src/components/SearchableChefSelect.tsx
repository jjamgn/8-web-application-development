import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chef } from '../types';

const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

export default function SearchableChefSelect({ options, value, onChange, disabled, inputId, labelId, errorId, invalid }: {
  options: Chef[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  inputId: string;
  labelId: string;
  errorId?: string;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(chef => String(chef.id) === value);
  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    return options.filter(chef => !needle || normalize(chef.name + ' ' + chef.specialties.map(item => item.name).join(' ')).includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function choose(chef: Chef) {
    onChange(String(chef.id));
    setOpen(false);
    setQuery('');
  }

  return <div className="chef-select" ref={root}>
    <button id={inputId} name="chefId" type="button" className="chef-select-trigger"
      aria-labelledby={labelId} aria-describedby={errorId} aria-invalid={invalid}
      aria-expanded={open} aria-controls="chef-select-options" disabled={disabled}
      onClick={() => { setOpen(current => !current); setQuery(''); }}>
      <span className="chef-select-copy">
        <span>{selected ? selected.name : 'Chọn đầu bếp'}</span>
        <small>{selected?.specialties.map(item => item.name).join(' · ') || 'Tìm và chọn đầu bếp'}</small>
      </span>
    </button>
    {open && <div className="chef-select-popover">
      <input type="search" autoFocus aria-label="Tìm đầu bếp"
        placeholder="Tìm theo tên hoặc chuyên môn..." value={query} onChange={event => setQuery(event.target.value)} />
      <div className="chef-select-options" id="chef-select-options" role="listbox" aria-labelledby={labelId}>
        {matches.length ? matches.map(chef => <button type="button" role="option" aria-selected={String(chef.id) === value}
          className="chef-select-option" key={chef.id} onClick={() => choose(chef)}>
          <strong>{chef.name}</strong><small>{chef.specialties.map(item => item.name).join(' · ')}</small>
        </button>) : <p className="chef-select-empty">Không tìm thấy đầu bếp phù hợp.</p>}
      </div>
    </div>}
  </div>;
}
