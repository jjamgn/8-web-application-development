import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, errorMessage, RequestError } from '../api';
import { Notice } from '../components';
import type { UploadData } from '../types';
import { LIMITS, codePoints } from '../types';

type Entry = { file: File; title: string; alt: string };
function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <img src={url || undefined} alt={`Xem trước ${file.name}`} className="upload-preview" />;
}

export function UploadPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<UploadData | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  function select(files: FileList | null) {
    if (!files || busy) return;
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
    try { setResult(await api.upload(body)); }
    catch (e) { setError(errorMessage(e)); setExpired(e instanceof RequestError && e.status === 401); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="upload-page">
    <Link className="back-link" to="/photos">Về thư viện</Link>
    <div className="page-heading"><p className="eyebrow">CHIA SẺ GÓC NHÌN CỦA BẠN</p><h1>Thêm một khoảnh khắc<span className="accent">.</span></h1><p className="intro">Chọn ảnh, đặt tên và viết một mô tả để mọi người cùng cảm nhận.</p></div>
    <p className="upload-limits" id="upload-help">JPEG hoặc PNG tĩnh · 1–5 ảnh/lượt · Tối đa 10 MiB và 40 triệu pixel/ảnh. Máy chủ sẽ kiểm tra ảnh trước khi lưu.</p>
    {error && <Notice error>{error}</Notice>}
    {expired && <Notice>Phiên đăng nhập đã hết hạn. <Link to="/login?returnTo=/photos/upload">Đăng nhập lại</Link> để tạo lượt gửi mới.</Notice>}
    <form onSubmit={submit}>
      <fieldset disabled={busy || attempted}>
        <label className="file-picker"><span aria-hidden="true" className="empty-icon">▧</span><strong>Chọn ảnh từ thiết bị</strong><span>Bạn có thể chọn nhiều ảnh cùng lúc.</span><input ref={input} type="file" accept="image/jpeg,image/png" multiple aria-describedby="upload-help" aria-label="Chọn ảnh" onChange={e => select(e.target.files)} /></label>
        <div className="upload-entries">{entries.map((entry, i) => <article className="upload-entry" key={`${i}-${entry.file.name}`}>
          <FilePreview file={entry.file} />
          <div><h2>Ảnh {i + 1}</h2><p className="file-name">{entry.file.name} · {(entry.file.size / 1_048_576).toFixed(2)} MiB</p>
            <label htmlFor={`title-${i}`}>Tiêu đề ảnh {i + 1}<input id={`title-${i}`} value={entry.title} onChange={e => update(i, 'title', e.target.value)} required aria-describedby={`title-count-${i}`} /></label><p className="field-help" id={`title-count-${i}`}>{[...entry.title.trim()].length}/120 ký tự</p>
            <label htmlFor={`alt-${i}`}>Mô tả thay thế ảnh {i + 1}<textarea id={`alt-${i}`} rows={3} value={entry.alt} onChange={e => update(i, 'alt', e.target.value)} required aria-describedby={`alt-count-${i}`} /></label><p className="field-help" id={`alt-count-${i}`}>{[...entry.alt.trim()].length}/300 ký tự · Mô tả nội dung ảnh cho người dùng trình đọc màn hình.</p>
          </div>
        </article>)}</div>
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
