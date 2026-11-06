import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageNumbers } from '../components/DishPagination';
import PageState from '../components/PageState';
import SearchableSpecialtyFilter from '../components/SearchableSpecialtyFilter';
import { useLoad } from '../hooks/useLoad';
import type { Chef, Specialty } from '../types';

const pageSize = 12;
const normalizeName = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');

function parsePage(value: string | null) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export default function AdminChefsPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').slice(0, 160);
  const specialtyIds = [...new Set(params.getAll('specialty').filter(value => /^[1-9]\d*$/.test(value)).map(Number))];
  const specialtyKey = specialtyIds.join(',');
  const sort = params.get('sort') === 'name_desc' ? 'name_desc' : 'name_asc';
  const pageParam = params.get('page');
  const page = parsePage(pageParam);
  const [draft, setDraft] = useState({ q, specialtyIds, sort });
  const load = useLoad<Chef[]>('/chefs', 'list');
  const catalog = useLoad<Specialty[]>('/specialties', 'list');
  useEffect(() => { setDraft({ q, specialtyIds, sort }); }, [q, specialtyKey, sort]);

  const specialties = catalog.status === 'success' ? catalog.data : [];
  const items = useMemo(() => {
    const query = normalizeName(q);
    const selectedSpecialties = new Set(specialtyIds);
    const filtered = load.data?.filter(chef => {
      const specialtyNames = chef.specialties.map(item => item.name).join(' ');
      const matchesText = !query || normalizeName(chef.name + ' ' + specialtyNames).includes(query);
      return matchesText && (!selectedSpecialties.size || chef.specialties.some(item => selectedSpecialties.has(item.id)));
    }) || [];
    const direction = sort === 'name_desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }) * direction;
      return byName || a.id - b.id;
    });
  }, [load.data, q, specialtyKey, sort]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage],
  );
  useEffect(() => {
    if (load.status !== 'success' || (pageParam === null && currentPage === 1) || Number(pageParam) === currentPage) return;
    const next = new URLSearchParams(params);
    if (currentPage === 1) next.delete('page');
    else next.set('page', String(currentPage));
    setParams(next, { replace: true });
  }, [load.status, pageParam, currentPage, params, setParams]);

  const returnPath = params.size ? '/admin/chefs?' + params.toString() : '/admin/chefs';
  const returnQuery = '?returnTo=' + encodeURIComponent(returnPath);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (draft.q.trim()) next.set('q', draft.q.trim());
    draft.specialtyIds.forEach(id => next.append('specialty', String(id)));
    if (draft.sort !== 'name_asc') next.set('sort', draft.sort);
    setParams(next);
    setDraft(current => ({ ...current, q: current.q.trim() }));
  }
  function reset() {
    setDraft({ q: '', specialtyIds: [], sort: 'name_asc' });
    setParams({});
  }
  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
  }

  return <>
    <span className="eyebrow">BẾP NHÀ / QUẢN TRỊ</span>
    <div className="admin-heading"><div><h1>Quản lý đầu bếp</h1><p>Chăm chút từng chi tiết cho căn bếp của bạn.</p></div>
      <Link className="button primary" to={'/admin/chefs/new' + returnQuery}>+ Thêm đầu bếp</Link></div>
    <form className="dish-filters chef-filters" onSubmit={submit} role="search" aria-label="Tìm kiếm và lọc đầu bếp">
      <div className="filter-search">
        <label><span>Tìm theo tên hoặc chuyên môn</span><input name="q" type="search" maxLength={160} value={draft.q}
          placeholder="Nhập tên hoặc chuyên môn..." onChange={event => setDraft(current => ({ ...current, q: event.target.value }))} /></label>
        <div className="chef-specialty-filter"><span id="chef-specialty-label">Chuyên môn</span>
          <SearchableSpecialtyFilter options={specialties} value={draft.specialtyIds}
            onChange={ids => setDraft(current => ({ ...current, specialtyIds: ids }))}
            disabled={catalog.status !== 'success'} labelId="chef-specialty-label" />
        </div>
        <label><span id="chef-sort-label">Sắp xếp</span><select name="sort" aria-labelledby="chef-sort-label" value={draft.sort} onChange={event => setDraft(current => ({ ...current, sort: event.target.value as 'name_asc' | 'name_desc' }))}>
          <option value="name_asc">Tên A → Z</option>
          <option value="name_desc">Tên Z → A</option>
        </select></label>
      </div>
      <div className="filter-actions"><small>{catalog.status === 'error' ? <>Chưa tải được danh mục chuyên môn. <button type="button" className="text-button" onClick={catalog.reload}>Thử lại</button></> : 'Tìm theo tên hoặc chuyên môn, có dấu hoặc không dấu.'}</small>
        <button className="button outline" type="button" onClick={reset}>Xóa điều kiện</button>
        <button className="button primary" type="submit">Tìm đầu bếp</button></div>
    </form>
    <section className="table-panel">
      <div className="table-panel-heading"><h2>Danh sách đầu bếp {load.status === 'success' && <span>{items.length}</span>}</h2></div>
      <PageState {...load} onRetry={load.reload} loadingVariant="table" columns={4} loadingLabel="Đang tải danh sách đầu bếp…" empty={load.status === 'success' && items.length === 0} />
      {load.status === 'success' && items.length > 0 && <>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Danh sách đầu bếp, có thể cuộn ngang" data-resource="chefs">
          <table><thead><tr><th scope="col">ID</th><th scope="col">Đầu bếp</th><th scope="col">Chuyên môn</th><th scope="col" className="align-right">Thao tác</th></tr></thead>
            <tbody>{visibleItems.map(chef => <tr key={chef.id}>
              <td className="muted">#{chef.id}</td>
              <td><div className="table-name"><span className="table-avatar" aria-hidden="true">{chef.name.slice(0, 1)}</span><strong title={chef.name}>{chef.name}</strong></div></td>
              <td><div className="specialty-tags chef-specialty-list">
                {chef.specialties.length
                  ? chef.specialties.map(item => <span className="specialty-tag" key={item.id}>{item.name}</span>)
                  : '—'}
              </div></td>
              <td><div className="row-actions"><Link to={'/admin/chefs/' + chef.id + '/edit' + returnQuery} aria-label={'Sửa ' + chef.name}>Sửa</Link>
                <Link className="danger-link" to={'/admin/chefs/' + chef.id + '/delete' + returnQuery} aria-label={'Xóa ' + chef.name}>Xóa</Link></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <PageNumbers page={currentPage} total={items.length} pageSize={pageSize} onPage={changePage}
          ariaLabel="Phân trang đầu bếp" />
      </>}
    </section>
    <p className="admin-hint">Mọi thao tác xóa đều cần xác nhận</p>
  </>;
}
