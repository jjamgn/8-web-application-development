import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, errorMessage, RequestError } from '../api';
import { Notice } from '../components';
import type { UploadData } from '../types';
import { LIMITS, codePoints } from '../types';
import { invalidateFeeds } from '../lib/gallery-cache';
import { UploadComparison } from '../UploadComparison';

type Entry = { file: File; title: string; alt: string };

export function UploadPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<UploadData | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  function select(files: FileList | null) {
    if (!files || busy || attempted) return;
    setResult(null); setError(''); setAttempted(false); setExpired(false);
    const selected = Array.from(files);
    if (selected.length < 1 || selected.length > LIMITS.files) { setEntries([]); setError('Mỗi lượt chọn từ 1 đến 5 ảnh.'); return; }
    setEntries(selected.map(file => ({ file, title: '', alt: '' })));
  }
  function update(index: number, field: 'title' | 'alt', value: string) {
    setEntries(old => old.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
  }
  function reset() { setEntries([]); setError(''); setResult(null); setAttempted(false); setExpired(false); if (input.current) input.current.value = ''; }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || attempted) return;
    setError('');
    if (!entries.length) { setError('Hãy chọn ít nhất một ảnh.'); return; }
    for (const [index, entry] of entries.entries()) {
      if (entry.file.size > LIMITS.fileBytes) { setError(`Ảnh ${index + 1} vượt quá 10 MiB. Hãy chọn lại ảnh nhỏ hơn.`); return; }
      if (codePoints(entry.title.trim()) < 1 || codePoints(entry.title.trim()) > 120 || codePoints(entry.alt.trim()) < 1 || codePoints(entry.alt.trim()) > 300) {
        setError(`Ảnh ${index + 1}: tiêu đề cần 1–120 ký tự, mô tả thay thế cần 1–300 ký tự.`); return;
      }
    }
    const body = new FormData();
    entries.forEach(entry => body.append('photos', entry.file));
    body.append('metadata', JSON.stringify(entries.map(({ title, alt }) => ({ title: title.trim(), alt: alt.trim() }))));
    lock.current = true; setBusy(true); setAttempted(true);
    try { const uploaded = await api.upload(body); setResult(uploaded); if (uploaded.succeeded) invalidateFeeds(); }
    catch (e) { setError(errorMessage(e)); setExpired(e instanceof RequestError && e.status === 401); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="upload-page">
    <Link className="back-link" to="/photos">Về thư viện</Link>
    <div className="page-heading"><p className="eyebrow">CHIA SẺ GÓC NHÌN CỦA BẠN</p><h1>Thêm một khoảnh khắc<span className="accent">.</span></h1><p className="intro">Chọn ảnh, đặt tên và viết một mô tả để mọi người cùng cảm nhận.</p></div>
    <p className="upload-limits" id="upload-help">JPEG hoặc PNG tĩnh · 1–5 ảnh/lượt · Tối đa 10 MiB và 40 triệu pixel/ảnh. Máy chủ sẽ kiểm tra ảnh trước khi lưu.</p>
    <p className="field-help"><span className="required-marker" aria-hidden="true">*</span> là trường bắt buộc.</p>
    {error && <Notice error>{error}</Notice>}
    {expired && <Notice>Phiên đăng nhập đã hết hạn. <Link to="/login?returnTo=/photos/upload">Đăng nhập lại</Link> để tạo lượt gửi mới.</Notice>}
    <form onSubmit={submit}>
      <fieldset disabled={busy || attempted}>
        <div className={'file-picker drop-zone' + (dragging ? ' is-dragging' : '')} data-testid="upload-dropzone"
          onDragOver={e => { e.preventDefault(); if (!busy && !attempted) { e.dataTransfer.dropEffect = 'copy'; setDragging(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={e => { e.preventDefault(); setDragging(false); select(e.dataTransfer.files); }}>
          <span className="drop-count">{entries.length}/5 ảnh</span>
          <svg className="drop-illustration" viewBox="0 0 200 110" fill="none" aria-hidden="true"><rect x="16" y="28" width="65" height="65" rx="14" transform="rotate(-15 16 28)" fill="#e8f2ec" stroke="currentColor" strokeWidth="4"/><rect x="122" y="12" width="65" height="65" rx="14" transform="rotate(15 122 12)" fill="#e8f2ec" stroke="currentColor" strokeWidth="4"/><rect x="60" y="6" width="80" height="94" rx="20" fill="#e8f2ec" stroke="currentColor" strokeWidth="4"/><circle cx="114" cy="31" r="8" fill="currentColor"/><path d="M74 78l20-33 16 22 9-13 11 24H74z" fill="currentColor"/></svg>
          <h2>{dragging ? 'Thả ảnh vào đây' : 'Kéo thả ảnh để bắt đầu'}</h2><p>Chia sẻ một khoảnh khắc đáng nhớ của bạn.</p>
          <button className="button" type="button" onClick={() => input.current?.click()}>Chọn ảnh từ thiết bị</button>
          <input className="sr-only" ref={input} type="file" accept="image/jpeg,image/png" multiple aria-describedby="upload-help" aria-label="Chọn ảnh" onClick={e => { e.currentTarget.value = ''; }} onChange={e => select(e.target.files)} />
          <span className="field-help">JPEG hoặc PNG · Tối đa 5 ảnh mỗi lượt, 10 MiB mỗi ảnh</span>
        </div>
        <div className="upload-entries">{entries.map((entry, i) => {
          const uploaded = result?.results.find(item => item.index === i);
          return <article className="upload-entry" key={`${i}-${entry.file.name}`}>
          <div className="upload-fields"><h2>Ảnh {i + 1}</h2><p className="file-name">{entry.file.name} · {(entry.file.size / 1_048_576).toFixed(2)} MiB</p>
            <label htmlFor={`title-${i}`}>Tiêu đề ảnh {i + 1}<span className="required-marker" aria-hidden="true"> *</span><input aria-label={`Tiêu đề ảnh ${i + 1}`} id={`title-${i}`} value={entry.title} onChange={e => update(i, 'title', e.target.value)} required aria-describedby={`title-count-${i}`} /></label><p className="field-help" id={`title-count-${i}`}>{[...entry.title.trim()].length}/120 ký tự</p>
            <label htmlFor={`alt-${i}`}>Mô tả thay thế ảnh {i + 1}<span className="required-marker" aria-hidden="true"> *</span><textarea aria-label={`Mô tả thay thế ảnh ${i + 1}`} id={`alt-${i}`} rows={3} value={entry.alt} onChange={e => update(i, 'alt', e.target.value)} required aria-describedby={`alt-count-${i}`} /></label><p className="field-help" id={`alt-count-${i}`}>{[...entry.alt.trim()].length}/300 ký tự · Mô tả nội dung ảnh cho người dùng trình đọc màn hình.</p>
          </div>
          <UploadComparison file={entry.file} photo={uploaded?.ok ? uploaded.photo : undefined} />
        </article>; })}</div>
        <button className="button" disabled={!entries.length} type="submit">{busy ? 'Đang gửi và xử lý ảnh…' : `Đăng ${entries.length || ''} ảnh`}</button>
      </fieldset>
    </form>
    {busy && <Notice>Đang gửi và xử lý ảnh. Vui lòng giữ trang này mở.</Notice>}
    {result && <div className="upload-results"><h2>Kết quả từng ảnh</h2><Notice>{result.succeeded} ảnh thành công · {result.failed} ảnh không thành công.</Notice><ol>{result.results.map(item => <li key={item.index} className={item.ok ? 'result-ok' : 'result-error'}>
      <strong>Ảnh {item.index + 1}: </strong>{item.ok ? <>Đã đăng “{item.photo.title}”. <Link to={`/photos/${item.photo.id}`}>Xem ảnh</Link></> : <>{item.error.message} <span className="error-code">({item.error.code})</span></>}
    </li>)}</ol></div>}
    {attempted && !busy && <div className="upload-next"><p>Hãy <Link to="/photos">kiểm tra thư viện</Link> trước khi gửi lại, nhất là khi mất kết nối. Ảnh đã thành công không cần gửi lại.</p><button className="button secondary" onClick={reset}>Tạo lượt gửi mới</button></div>}
  </section>;
}
