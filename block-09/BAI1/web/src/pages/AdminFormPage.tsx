import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import DishImageInput, { validImageUrl, type ImageDraft } from '../components/DishImageInput';
import IngredientPicker from '../components/IngredientPicker';
import SearchableChefSelect from '../components/SearchableChefSelect';
import SpecialtyPicker from '../components/SpecialtyPicker';
import { adminReturnPath, uploadDishImage } from '../lib/dishes';
import PageState from '../components/PageState';
import Skeleton from '../components/Skeleton';
import { categories, createDraft, imageSource, resources, toPayload, validateDraft } from '../config/resources';
import { useLoad } from '../hooks/useLoad';
import { ApiError, errorMessage, request } from '../lib/api';
import { recipeError, selectedIngredients } from '../lib/ingredients';
import type { Chef, Dish, DishIngredientDraft, Entity, FieldErrors, Ingredient, Resource, Specialty } from '../types';

export default function AdminFormPage({ resource, id }: { resource: Resource; id?: string }) {
  const [params] = useSearchParams();
  const returnPath = adminReturnPath(resource, params.get('returnTo'));
  const record = useLoad<Entity>(id ? `/${resource}/${id}` : null);
  const chefs = useLoad<Chef[]>(resource === 'dishes' ? '/chefs' : null, 'list');
  const ingredients = useLoad<Ingredient[]>(resource === 'dishes' ? '/ingredients' : null, 'list');
  const specialtyCatalog = useLoad<Specialty[]>(resource === 'chefs' ? '/specialties' : null, 'list');
  if (id && record.status !== 'success') return <><Link className="back-link" to={returnPath}>← Danh sách {resources[resource].singular}</Link><PageState {...record} onRetry={record.reload} loadingVariant="form" loadingLabel="Đang tải thông tin biểu mẫu…" /></>;
  return <Editor resource={resource} id={id} item={record.data ?? undefined} chefs={chefs} ingredients={ingredients} specialtyCatalog={specialtyCatalog} />;
}

function Editor({ resource, id, item, chefs, ingredients, specialtyCatalog }: { resource: Resource; id?: string; item?: Entity; chefs: ReturnType<typeof useLoad<Chef[]>>; ingredients: ReturnType<typeof useLoad<Ingredient[]>>; specialtyCatalog: ReturnType<typeof useLoad<Specialty[]>> }) {
  const config = resources[resource];
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnPath = adminReturnPath(resource, params.get('returnTo'));
  const [image, setImage] = useState<ImageDraft>({ mode: id ? 'keep' : 'default', file: null, url: '' });
  const uploaded = useRef<{ file: File; imagePath: string } | null>(null);
  const [savingStage, setSavingStage] = useState('');
  const [initial] = useState(() => createDraft(resource, item));
  const [draft, setDraft] = useState(initial);
  const [initialRecipe] = useState(() => selectedIngredients(resource === 'dishes' ? item as Dish : undefined));
  const [recipe, setRecipe] = useState(initialRecipe);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const chefOptions = chefs.status === 'success' ? chefs.data : [];
  const ingredientOptions = ingredients.status === 'success' ? ingredients.data : [];
  const specialtyOptions = specialtyCatalog.status === 'success' ? specialtyCatalog.data : [];
  const specialtiesUnavailable = resource === 'chefs' && (specialtyCatalog.status !== 'success' || specialtyOptions.length === 0);
  const missingChef = resource === 'dishes' && !!draft.chefId && chefs.status === 'success' && !chefOptions.some(chef => String(chef.id) === draft.chefId);
  const chefsUnavailable = resource === 'dishes' && (chefs.status !== 'success' || chefOptions.length === 0 || missingChef);
  const ingredientsUnavailable = resource === 'dishes' && (ingredients.status !== 'success' || ingredientOptions.length === 0);
  const resourcesUnavailable = chefsUnavailable || ingredientsUnavailable || specialtiesUnavailable;
  const fieldNames = new Set(config.fields.map(field => field.name));
  if (resource === 'dishes') fieldNames.add('ingredients');
  const extraErrors = Object.entries(errors).filter(([key]) => !fieldNames.has(key));

  function update(name: string, value: string | boolean | number[] | DishIngredientDraft[]) {
    setDraft(current => ({ ...current, [name]: value }));
    setErrors(current => { const next = { ...current }; delete next[name]; return next; });
    setMessage('');
  }
  function updateIngredients(rows: DishIngredientDraft[]) {
    update('ingredients', rows);
    setRecipe(rows.map(row => {
      const ingredient = ingredientOptions.find(option => option.id === row.ingredientId);
      return { ingredientId: row.ingredientId, name: ingredient?.name || `Nguyên liệu #${row.ingredientId}`, unit: ingredient?.unit || '', quantity: String(row.quantity) };
    }));
  }
  function focusError(fields: FieldErrors) {
    requestAnimationFrame(() => {
      const first = config.fields.find(field => fields[field.name]);
      if (first) (formRef.current?.elements.namedItem(first.name === 'chefId' ? 'chefSearch' : first.name) as HTMLElement | null)?.focus();
      else if (fields.ingredients) formRef.current?.querySelector<HTMLInputElement>('[data-ingredients] input[aria-invalid=true], [name=ingredientSearch]')?.focus();
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || resourcesUnavailable) return;
    const validation = validateDraft(resource, draft);
    if (resource === 'dishes') {
      if (image.mode === 'file' && !image.file) validation.imagePath = 'Vui lòng chọn ảnh từ máy.';
      if (image.mode === 'url' && !validImageUrl(image.url)) validation.imagePath = 'Vui lòng nhập link ảnh HTTPS hợp lệ.';
      const invalidRecipe = recipeError(recipe);
      if (invalidRecipe) validation.ingredients = invalidRecipe;
    }
    setErrors(validation);
    setMessage('');
    if (Object.keys(validation).length) { focusError(validation); return; }
    const all = toPayload(resource, draft);
    const original = toPayload(resource, initial);
    const payload = id ? Object.fromEntries(Object.entries(all).filter(([key, value]) =>
      Array.isArray(value) ? JSON.stringify(value) !== JSON.stringify(original[key]) : value !== original[key])) : all;
    if (id && Object.keys(payload).length === 0 && (resource !== 'dishes' || image.mode === 'keep')) { setMessage('Bạn chưa thay đổi thông tin nào.'); return; }
    inFlight.current = true;
    setPending(true);
    try {
      if (resource === 'dishes') {
        if (image.mode === 'file' && image.file) {
          setSavingStage('Đang tải ảnh…');
          if (uploaded.current?.file !== image.file) uploaded.current = { file: image.file, imagePath: (await uploadDishImage(image.file)).imagePath };
          payload.imagePath = uploaded.current.imagePath;
        } else if (image.mode === 'url') payload.imagePath = image.url;
        else if (image.mode === 'default') payload.imagePath = '/images/beef.png';
      }
      setSavingStage(resource === 'dishes' ? 'Đang lưu món…' : 'Đang lưu đầu bếp…');
      await request<Entity>(`/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (active.current) navigate(returnPath);
    } catch (error) {
      if (!active.current) return;
      const fields = error instanceof ApiError ? error.fields : {};
      setErrors(fields);
      setMessage(errorMessage(error));
      focusError(fields);
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  }
  return <><Link className="back-link" to={returnPath}>← Danh sách {config.singular}</Link><span className="eyebrow">BẾP NHÀ / {id ? 'CẬP NHẬT' : 'THÊM MỚI'}</span><h1>{id ? 'Sửa' : 'Thêm'} {config.singular}</h1><p className="muted">Những điều nhỏ làm nên một căn bếp chỉn chu.</p>
    <form className="edit-form" onSubmit={submit} noValidate ref={formRef} aria-busy={pending}>
      {message && <div className="alert" role="alert">{message}</div>}{extraErrors.map(([key, value]) => <div className="alert" role="alert" key={key}>{value}</div>)}
      {resource === 'chefs' && specialtyCatalog.status === 'error' && <div className="alert" role="alert">Chưa tải được danh mục chuyên môn. <button type="button" className="text-button" onClick={specialtyCatalog.reload}>Thử lại</button></div>}
      {resource === 'chefs' && specialtyCatalog.status === 'success' && specialtyOptions.length === 0 && <div className="alert" role="alert">Danh mục chưa có chuyên môn. Hãy thêm dữ liệu danh mục trước khi tạo đầu bếp.</div>}
      {resource === 'dishes' && <>

        {chefs.status === 'error' && <div className="alert" role="alert">Chưa tải được danh sách đầu bếp. <button type="button" className="text-button" onClick={chefs.reload}>Thử lại</button></div>}
        {chefs.status === 'success' && chefOptions.length === 0 && <div className="alert" role="alert">Cần có đầu bếp trước khi thêm món. <Link className="text-link" to="/admin/chefs/new">Thêm đầu bếp</Link></div>}
        {missingChef && <div className="alert" role="alert">Đầu bếp hiện tại không còn trong danh sách. Vui lòng chọn lại.</div>}
        {ingredients.status === 'error' && <div className="alert" role="alert">Chưa tải được danh sách nguyên liệu. <button type="button" className="text-button" onClick={ingredients.reload}>Thử lại</button></div>}
        {ingredients.status === 'success' && ingredientOptions.length === 0 && <div className="alert" role="alert">Cần có nguyên liệu trước khi thêm món. <Link className="text-link" to="/admin/ingredients/new">Thêm nguyên liệu</Link></div>}
      </>}
      <fieldset className="form-panel" disabled={pending}><legend className="visually-hidden">Thông tin {config.singular}</legend><span className="eyebrow">THÔNG TIN {config.label.toLocaleUpperCase('vi')}</span>
        {config.fields.map(field => {
          if (field.name === 'chefId' && (chefs.status === 'loading' || chefs.status === 'idle')) {
            return <Skeleton key={field.name} variant="field" label="Đang tải danh sách đầu bếp…" />;
          }
          if (field.name === 'specialtyIds' && (specialtyCatalog.status === 'loading' || specialtyCatalog.status === 'idle')) {
            return <Skeleton key={field.name} variant="field" label="Đang tải danh mục chuyên môn…" />;
          }
          if (field.name === 'ingredients' && (ingredients.status === 'loading' || ingredients.status === 'idle')) {
            return <Skeleton key={field.name} variant="field" label="Đang tải danh sách nguyên liệu…" />;
          }
          if (field.name === 'chefId') {
            const inputId = 'field-chefId';
            const errorId = inputId + '-error';
            const labelId = inputId + '-label';
            return <div className="chef-picker-field" key={field.name}>
              <span className="chef-picker-label" id={labelId}>{field.label}<b> *</b></span>
              <SearchableChefSelect options={chefOptions} value={String(draft.chefId ?? '')}
                onChange={value => update(field.name, value)} disabled={pending || chefs.status !== 'success'}
                inputId={inputId} labelId={labelId} errorId={errors[field.name] ? errorId : undefined} invalid={!!errors[field.name]} />
              {errors[field.name] && <small className="field-error" id={errorId}>{errors[field.name]}</small>}
            </div>;
          }
          if (field.name === 'ingredients') {
            const inputId = 'field-ingredients';
            const errorId = inputId + '-error';
            const value = Array.isArray(draft.ingredients) ? draft.ingredients.filter((entry): entry is DishIngredientDraft => typeof entry !== 'number') : [];
            return <div className="dish-ingredients-field" key={field.name}>
              <span className="dish-ingredients-label" id={inputId + '-label'}>{field.label}<b> *</b></span>
              <IngredientPicker value={value} options={ingredientOptions}
                onChange={updateIngredients} disabled={pending || ingredients.status !== 'success'}
                inputId={inputId} labelId={inputId + '-label'} errorId={errors[field.name] ? errorId : undefined} invalid={!!errors[field.name]} />
              {errors[field.name] && <small className="field-error" id={errorId}>{errors[field.name]}</small>}
            </div>;
          }
          const inputId = `field-${field.name}`;
          const errorId = `${inputId}-error`;
          const shared = { id: inputId, name: field.name, 'aria-invalid': !!errors[field.name], 'aria-describedby': errors[field.name] ? errorId : undefined };
          let input;
          if (field.type === 'multi-select') {
            const selectedIds = Array.isArray(draft[field.name]) ? draft[field.name] as number[] : [];
            const labelId = inputId + '-label';
            return <div className="chef-specialty-field" key={field.name}>
              <p className="chef-specialty-label" id={labelId}>{field.label}<b> *</b></p>
              <SpecialtyPicker value={selectedIds} options={specialtyOptions}
                onChange={value => update(field.name, value)} disabled={pending || specialtyCatalog.status !== 'success'}
                inputId={inputId} labelId={labelId} errorId={errors[field.name] ? errorId : undefined} invalid={!!errors[field.name]} />
              {errors[field.name] && <small className="field-error" id={errorId}>{errors[field.name]}</small>}
            </div>;
          }
          if (field.type === 'checkbox') input = <input {...shared} type="checkbox" checked={draft[field.name] === true} onChange={e => update(field.name, e.target.checked)} />;
          else if (field.type === 'textarea') input = <textarea {...shared} rows={5} required maxLength={field.maxLength} value={String(draft[field.name])} onChange={e => update(field.name, e.target.value)} />;
          else if (field.type === 'select') {
            const values = field.name === 'chefId' ? chefOptions.map(chef => ({ value: String(chef.id), label: `${chef.name} — ${chef.specialties.map(item => item.name).join(' · ')}` })) : categories.map(category => ({ value: category, label: category }));
            const current = String(draft[field.name]);
            input = <select {...shared} required value={current} onChange={e => update(field.name, e.target.value)}><option value="">Chọn danh mục</option>{current && !values.some(option => option.value === current) && <option value={current}>{current}</option>}{values.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
          } else input = <input {...shared} type={field.type} required maxLength={field.maxLength} min={field.type === 'number' ? 0 : undefined} max={field.type === 'number' ? 999999999 : undefined} step={field.type === 'number' ? 1 : undefined} value={String(draft[field.name])} onChange={e => update(field.name, e.target.value)} />;
          return <label key={field.name} htmlFor={inputId} className={field.type === 'checkbox' ? 'checkbox-label' : undefined}>{field.type === 'checkbox' && input}<span>{field.label}{field.type !== 'checkbox' && <b> *</b>}</span>{field.type !== 'checkbox' && input}{errors[field.name] && <small className="field-error" id={errorId}>{errors[field.name]}</small>}</label>;
        })}
        {resource === 'dishes' && <DishImageInput value={image} onChange={next => { setImage(next); setErrors(current => { const copy = { ...current }; delete copy.imagePath; return copy; }); setMessage(''); }} currentImage={id ? imageSource((item as Dish)?.imageUrl, (item as Dish)?.imagePath) : undefined} error={errors.imagePath || errors.file} />}
      </fieldset><div className="form-actions"><Link className="button outline" to={returnPath}>Hủy</Link><button className="button primary" type="submit" disabled={pending || resourcesUnavailable}>{pending ? savingStage || 'Đang lưu…' : id ? 'Lưu thay đổi' : `Thêm ${config.singular}`}</button></div>
    </form></>;
}
