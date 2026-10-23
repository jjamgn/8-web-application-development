import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageState from '../components/PageState';
import { categories, createDraft, resources, toPayload, validateDraft } from '../config/resources';
import { useLoad } from '../hooks/useLoad';
import { ApiError, errorMessage, request } from '../lib/api';
import type { Chef, Entity, FieldErrors, Resource } from '../types';

export default function AdminFormPage({ resource, id }: { resource: Resource; id?: string }) {
  const record = useLoad<Entity>(id ? `/${resource}/${id}` : null);
  const chefs = useLoad<Chef[]>(resource === 'dishes' ? '/chefs' : null, 'list');
  if (id && record.status !== 'success') return <><Link className="back-link" to={`/admin/${resource}`}>← Danh sách {resources[resource].singular}</Link><PageState {...record} onRetry={record.reload} /></>;
  return <Editor resource={resource} id={id} item={record.data ?? undefined} chefs={chefs} />;
}

function Editor({ resource, id, item, chefs }: { resource: Resource; id?: string; item?: Entity; chefs: ReturnType<typeof useLoad<Chef[]>> }) {
  const config = resources[resource];
  const navigate = useNavigate();
  const [initial] = useState(() => createDraft(resource, item));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const chefOptions = chefs.status === 'success' ? chefs.data : [];
  const missingChef = resource === 'dishes' && !!draft.chefId && chefs.status === 'success' && !chefOptions.some(chef => String(chef.id) === draft.chefId);
  const chefsUnavailable = resource === 'dishes' && (chefs.status !== 'success' || chefOptions.length === 0 || missingChef);
  const fieldNames = new Set(config.fields.map(field => field.name));
  const extraErrors = Object.entries(errors).filter(([key]) => !fieldNames.has(key));

  function update(name: string, value: string | boolean) {
    setDraft(current => ({ ...current, [name]: value }));
    setErrors(current => { const next = { ...current }; delete next[name]; return next; });
    setMessage('');
  }
  function focusError(fields: FieldErrors) {
    requestAnimationFrame(() => {
      const first = config.fields.find(field => fields[field.name]);
      if (first) (formRef.current?.elements.namedItem(first.name) as HTMLElement | null)?.focus();
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || chefsUnavailable) return;
    const validation = validateDraft(resource, draft);
    setErrors(validation);
    setMessage('');
    if (Object.keys(validation).length) { focusError(validation); return; }
    const all = toPayload(resource, draft);
    const original = toPayload(resource, initial);
    const payload = id ? Object.fromEntries(Object.entries(all).filter(([key, value]) => value !== original[key])) : all;
    if (id && Object.keys(payload).length === 0) { setMessage('Bạn chưa thay đổi thông tin nào.'); return; }
    inFlight.current = true;
    setPending(true);
    try {
      await request<Entity>(`/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (active.current) navigate(`/admin/${resource}`);
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
  return <><Link className="back-link" to={`/admin/${resource}`}>← Danh sách {config.singular}</Link><span className="eyebrow">BẾP NHÀ / {id ? 'CẬP NHẬT' : 'THÊM MỚI'}</span><h1>{id ? 'Sửa' : 'Thêm'} {config.singular}</h1><p className="muted">Những điều nhỏ làm nên một căn bếp chỉn chu.</p>
    <form className="edit-form" onSubmit={submit} noValidate ref={formRef} aria-busy={pending}>
      {message && <div className="alert" role="alert">{message}</div>}{extraErrors.map(([key, value]) => <div className="alert" role="alert" key={key}>{value}</div>)}
      {resource === 'dishes' && <>
        {(chefs.status === 'loading' || chefs.status === 'idle') && <p role="status" className="form-help">Đang tải danh sách đầu bếp…</p>}
        {chefs.status === 'error' && <div className="alert" role="alert">Chưa tải được danh sách đầu bếp. <button type="button" className="text-button" onClick={chefs.reload}>Thử lại</button></div>}
        {chefs.status === 'success' && chefOptions.length === 0 && <div className="alert" role="alert">Cần có đầu bếp trước khi thêm món. <Link className="text-link" to="/admin/chefs/new">Thêm đầu bếp</Link></div>}
        {missingChef && <div className="alert" role="alert">Đầu bếp hiện tại không còn trong danh sách. Vui lòng chọn lại.</div>}
      </>}
      <fieldset className="form-panel" disabled={pending}><legend className="visually-hidden">Thông tin {config.singular}</legend><span className="eyebrow">THÔNG TIN {config.label.toLocaleUpperCase('vi')}</span>
        {config.fields.map(field => {
          const inputId = `field-${field.name}`;
          const errorId = `${inputId}-error`;
          const shared = { id: inputId, name: field.name, 'aria-invalid': !!errors[field.name], 'aria-describedby': errors[field.name] ? errorId : undefined };
          let input;
          if (field.type === 'checkbox') input = <input {...shared} type="checkbox" checked={draft[field.name] === true} onChange={e => update(field.name, e.target.checked)} />;
          else if (field.type === 'textarea') input = <textarea {...shared} rows={5} required maxLength={field.maxLength} value={String(draft[field.name])} onChange={e => update(field.name, e.target.value)} />;
          else if (field.type === 'select') {
            const values = field.name === 'chefId' ? chefOptions.map(chef => ({ value: String(chef.id), label: `${chef.name} — ${chef.specialty}` })) : categories.map(category => ({ value: category, label: category }));
            const current = String(draft[field.name]);
            input = <select {...shared} required disabled={field.name === 'chefId' && chefs.status !== 'success'} value={current} onChange={e => update(field.name, e.target.value)}><option value="">{field.name === 'chefId' ? 'Chọn đầu bếp' : 'Chọn danh mục'}</option>{current && !values.some(option => option.value === current) && <option value={current}>{field.name === 'chefId' ? `Đầu bếp #${current} (cần chọn lại)` : current}</option>}{values.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
          } else input = <input {...shared} type={field.type} required maxLength={field.maxLength} min={field.type === 'number' ? 0 : undefined} max={field.type === 'number' ? 999999999 : undefined} step={field.type === 'number' ? 1 : undefined} value={String(draft[field.name])} onChange={e => update(field.name, e.target.value)} />;
          return <label key={field.name} htmlFor={inputId} className={field.type === 'checkbox' ? 'checkbox-label' : undefined}>{field.type === 'checkbox' && input}<span>{field.label}{field.type !== 'checkbox' && <b> *</b>}</span>{field.type !== 'checkbox' && input}{errors[field.name] && <small className="field-error" id={errorId}>{errors[field.name]}</small>}</label>;
        })}
      </fieldset><div className="form-actions"><Link className="button outline" to={`/admin/${resource}`}>Hủy</Link><button className="button primary" type="submit" disabled={pending || chefsUnavailable}>{pending ? 'Đang lưu…' : id ? 'Lưu thay đổi' : `Thêm ${config.singular}`} <span aria-hidden="true">→</span></button></div>
    </form></>;
}
