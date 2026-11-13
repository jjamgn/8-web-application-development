import { useEffect, useState } from 'react';
export type ImageDraft = { mode: 'keep' | 'file' | 'url' | 'default'; file: File | null; url: string };
export function validImageUrl(url: string) { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && url.length <= 2048; } catch { return false; } }
export default function DishImageInput({ value, onChange, currentImage, error }: { value: ImageDraft; onChange: (v: ImageDraft) => void; currentImage?: string; error?: string }) {
  const [blob, setBlob] = useState('');
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fileError, setFileError] = useState('');
  useEffect(() => { if (!value.file) { setBlob(''); return; } const url = URL.createObjectURL(value.file); setBlob(url); return () => URL.revokeObjectURL(url); }, [value.file]);
  const preview = value.mode === 'file' ? blob : value.mode === 'url' ? validImageUrl(value.url) ? value.url : '' : value.mode === 'keep' ? currentImage : '/images/beef.png';
  useEffect(() => { setBroken(false); setLoaded(false); }, [preview]);
  return <section className="image-editor" aria-label="Ảnh món ăn"><h2>Ảnh của món ăn</h2><p className="form-help">Chọn ảnh từ máy hoặc dán link ảnh HTTPS trực tiếp. Không nhập mã nhúng HTML.</p>
    <div className="image-options">{(['file', 'url', 'default'] as const).map(mode => <label key={mode}><input type="radio" name="imageSource" value={mode} checked={value.mode === mode} onChange={() => { setFileError(''); onChange({ mode, file: null, url: '' }); }} />{mode === 'file' ? 'Tải ảnh từ máy' : mode === 'url' ? 'Dùng link ảnh' : 'Ảnh mặc định'}</label>)}{currentImage && <label><input type="radio" name="imageSource" value="keep" checked={value.mode === 'keep'} onChange={() => onChange({ mode: 'keep', file: null, url: '' })} />Giữ ảnh hiện tại</label>}</div>
    {value.mode === 'file' && <label>Chọn ảnh (JPEG, PNG, WebP · tối đa 5 MB)<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0] || null; if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) { setFileError('Chọn ảnh JPEG, PNG hoặc WebP có dung lượng từ 1 byte đến 5 MB.'); onChange({ ...value, file: null }); e.target.value = ''; } else { setFileError(''); onChange({ ...value, file }); } }} /></label>}
    {value.mode === 'url' && <label>Link ảnh HTTPS<input type="url" name="imageUrl" value={value.url} maxLength={2048} placeholder="https://.../mon-an.jpg" onChange={e => onChange({ ...value, url: e.target.value.trim() })} /><small>Link phải dẫn đến ảnh có thể nhúng công khai.</small></label>}
    {preview && <div className="image-preview"><img src={preview} alt="Xem trước ảnh món ăn" onLoad={() => setLoaded(true)} onError={() => setBroken(true)} /><p role="status">{broken ? 'Chưa tải được ảnh. Kiểm tra link hoặc chọn ảnh khác.' : loaded ? 'Ảnh xem trước' : 'Đang tải ảnh xem trước…'}</p></div>}
    {(error || fileError) && <p className="field-error" role="alert">{error || fileError}</p>}
  </section>;
}
