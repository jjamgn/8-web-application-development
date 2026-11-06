import { useMemo, useState } from 'react';
import type { Specialty } from '../types';

export default function SpecialtyPicker({ value, options, onChange, disabled, inputId, labelId, errorId, invalid }: {
  value: number[];
  options: Specialty[];
  onChange: (value: number[]) => void;
  disabled: boolean;
  inputId: string;
  labelId: string;
  errorId?: string;
  invalid: boolean;
}) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => options.filter(option => value.includes(option.id)), [options, value]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return options.filter(option => !normalized || option.name.toLocaleLowerCase('vi').includes(normalized));
  }, [options, query]);

  return <div className="specialty-picker">
    {selected.length > 0 && <div className="specialty-tags" aria-label="Chuyên môn đã chọn">
      {selected.map(option => <span className="specialty-tag" key={option.id}>
        {option.name}
        <button type="button" className="specialty-tag-remove" aria-label={`Bỏ chuyên môn ${option.name}`}
          disabled={disabled} onClick={() => onChange(value.filter(id => id !== option.id))}>×</button>
      </span>)}
    </div>}
    <label className="specialty-search" htmlFor={inputId}>
      <input id={inputId} name="specialtyIds" type="search" aria-labelledby={labelId}
        aria-describedby={errorId} aria-invalid={invalid} placeholder="Tìm trong danh mục chuyên môn…"
        value={query} onChange={event => setQuery(event.target.value)} disabled={disabled} />
    </label>
    <div className="specialty-options" role="group" aria-labelledby={labelId}>
      {matches.length ? matches.map(option => <label className="specialty-option" key={option.id}>
        <input type="checkbox" checked={value.includes(option.id)} disabled={disabled}
          onChange={event => onChange(event.target.checked ? [...value, option.id] : value.filter(id => id !== option.id))} />
        <span>{option.name}</span>
      </label>) : <p className="specialty-no-results">Không tìm thấy chuyên môn phù hợp.</p>}
    </div>
    <button type="button" className="text-button specialty-picker-clear" disabled={disabled || value.length === 0}
      onClick={() => onChange([])}>Xóa lựa chọn</button>
  </div>;
}
