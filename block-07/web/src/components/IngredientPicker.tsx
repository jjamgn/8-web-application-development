import { useMemo, useState } from 'react';
import type { DishIngredientDraft, Ingredient } from '../types';

const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

export default function IngredientPicker({ value, options, onChange, disabled, inputId, labelId, errorId, invalid }: {
  value: DishIngredientDraft[];
  options: Ingredient[];
  onChange: (value: DishIngredientDraft[]) => void;
  disabled: boolean;
  inputId: string;
  labelId: string;
  errorId?: string;
  invalid: boolean;
}) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => options.filter(option => value.some(item => item.ingredientId === option.id)), [options, value]);
  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    return options.filter(option => !needle || normalize(option.name).includes(needle));
  }, [options, query]);

  function toggle(id: number) {
    onChange(value.some(item => item.ingredientId === id)
      ? value.filter(item => item.ingredientId !== id)
      : [...value, { ingredientId: id, quantity: '' }]);
  }

  function changeQuantity(id: number, quantity: string) {
    onChange(value.map(item => item.ingredientId === id ? { ...item, quantity } : item));
  }

  return <div className="ingredient-picker">
    {selected.length > 0 && <div className="ingredient-selected" role="group" aria-label="Nguyên liệu đã chọn">
      {selected.map(ingredient => {
        const recipe = value.find(item => item.ingredientId === ingredient.id)!;
        return <div className="ingredient-selected-row" key={ingredient.id}>
          <span className="specialty-tag ingredient-selected-tag">{ingredient.name}
            <button type="button" className="specialty-tag-remove" aria-label={`Bỏ nguyên liệu ${ingredient.name}`}
              disabled={disabled} onClick={() => toggle(ingredient.id)}>×</button>
          </span>
          <label className="ingredient-quantity">
            <span className="visually-hidden">Định lượng {ingredient.name}</span>
            <input type="number" min="0.01" max="99999999.99" step="0.01" inputMode="decimal"
              value={recipe.quantity} disabled={disabled} aria-invalid={invalid}
              onChange={event => changeQuantity(ingredient.id, event.target.value)} />
            <span>{ingredient.unit}</span>
          </label>
        </div>;
      })}
    </div>}
    <label className="ingredient-search" htmlFor={inputId}>
      <input id={inputId} name="ingredients" type="search" aria-labelledby={labelId}
        aria-describedby={errorId} aria-invalid={invalid} placeholder="Tìm nguyên liệu..."
        value={query} onChange={event => setQuery(event.target.value)} disabled={disabled} />
    </label>
    <div className="ingredient-options" role="group" aria-labelledby={labelId}>
      {matches.length ? matches.map(ingredient => <label className="ingredient-option" key={ingredient.id}>
        <input type="checkbox" checked={value.some(item => item.ingredientId === ingredient.id)} disabled={disabled}
          onChange={() => toggle(ingredient.id)} />
        <span>{ingredient.name}</span><small>({ingredient.unit})</small>
      </label>) : <p className="ingredient-no-results">Không tìm thấy nguyên liệu phù hợp.</p>}
    </div>
    <button type="button" className="text-button ingredient-clear" disabled={disabled || value.length === 0}
      onClick={() => onChange([])}>Xóa lựa chọn</button>
  </div>;
}
