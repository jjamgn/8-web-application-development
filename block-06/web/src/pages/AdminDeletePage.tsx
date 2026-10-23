import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageState from '../components/PageState';
import { resources } from '../config/resources';
import { useLoad } from '../hooks/useLoad';
import { errorMessage, request } from '../lib/api';
import type { Entity, Resource } from '../types';

export default function AdminDeletePage({ resource, id }: { resource: Resource; id: string }) {
  const load = useLoad<Entity>(`/${resource}/${id}`);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function remove() {
    if (inFlight.current || load.status !== 'success') return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    try {
      await request<null>(`/${resource}/${id}`, { method: 'DELETE' });
      if (active.current) navigate(`/admin/${resource}`);
    } catch (error) {
      if (active.current) setMessage(errorMessage(error));
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  }
  const config = resources[resource];
  return <><Link className="back-link" to={`/admin/${resource}`}>← Danh sách {config.singular}</Link>
    {load.status !== 'success' ? <PageState {...load} onRetry={load.reload} /> : <section className="confirm-panel"><span className="confirm-icon" aria-hidden="true">!</span><span className="eyebrow">XÁC NHẬN THAO TÁC</span><h1>Xóa {config.singular} này?</h1><p>Bạn đang xóa <strong>{load.data.name}</strong>.<br />Dữ liệu đã xóa không thể khôi phục.</p>{message && <div className="alert" role="alert">{message}</div>}
      <div className="form-actions"><Link className="button outline" to={`/admin/${resource}`}>Giữ lại</Link><button className="button danger" onClick={remove} disabled={pending}>{pending ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></section>}
  </>;
}
