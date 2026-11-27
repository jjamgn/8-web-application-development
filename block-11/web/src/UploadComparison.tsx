import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { createRawPreview, type RawPreview } from './lib/raw-preview';
import type { PhotoDto } from './types';

export function UploadComparison({ file, photo }: { file: File; photo?: PhotoDto }) {
  const [preview, setPreview] = useState<(Omit<RawPreview, 'blob'> & { url: string }) | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true, url = '';
    setPreview(null); setError('');
    void createRawPreview(file).then(({ blob, ...metadata }) => {
      if (!active) return;
      url = URL.createObjectURL(blob); setPreview({ ...metadata, url });
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tạo được preview.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);
  const variant = photo ? [...photo.variants].sort((a, b) => b.width - a.width)[0] : undefined;
  const orientationText = preview?.orientation === 6 ? '6 · xoay 90° theo chiều kim đồng hồ'
    : preview?.orientation === 8 ? '8 · xoay 90° ngược chiều kim đồng hồ'
      : preview?.orientation === 3 ? '3 · xoay 180°'
        : preview?.orientation ? String(preview.orientation) : 'không có';
  return <section className="upload-comparison" aria-label={`So sánh ảnh ${file.name}`}>
    <div className="comparison-grid">
      <figure className="comparison-panel">
        <figcaption><span className="comparison-step">TRƯỚC XỬ LÝ</span><strong>Pixels gốc · chưa áp dụng EXIF</strong></figcaption>
        <div className="comparison-image">{preview ? <img src={preview.url} alt={`Xem trước ${file.name}`} className="upload-preview" />
          : <p className="comparison-placeholder">{error || 'Đang đọc pixels và thông tin ảnh…'}</p>}</div>
        {preview && <dl className="comparison-metadata">
          <div><dt>Pixels trong file</dt><dd>{preview.width} × {preview.height}</dd></div>
          <div><dt>EXIF Orientation</dt><dd>{orientationText}</dd></div>
          <div><dt>EXIF / GPS</dt><dd>{preview.hasExif ? 'Có EXIF' : 'Không có EXIF'} · {preview.hasGps ? 'Có GPS' : 'Không có GPS'}</dd></div>
        </dl>}
        <p className="comparison-note">Chỉ bản xem trước bỏ qua EXIF để thấy chiều pixels thật. File gốc gửi lên vẫn giữ nguyên.</p>
      </figure>
      <figure className={`comparison-panel ${variant ? 'comparison-ready' : ''}`}>
        <figcaption><span className="comparison-step">SAU UPLOAD THÀNH CÔNG</span><strong>WebP đã chuẩn hóa trên máy chủ</strong></figcaption>
        <div className="comparison-image">{variant ? <img src={variant.url} width={variant.width} height={variant.height} alt={`Ảnh đã chuẩn hóa ${file.name}`} className="upload-preview" />
          : <p className="comparison-placeholder">Sau khi bấm Đăng ảnh và nhận kết quả thành công, ảnh thật từ máy chủ sẽ xuất hiện ở đây.</p>}</div>
        {photo && variant && <dl className="comparison-metadata">
          <div><dt>WebP đang xem</dt><dd>{variant.width} × {variant.height}</dd></div>
          <div><dt>Ảnh gốc sau chuẩn hóa</dt><dd>{photo.width} × {photo.height}</dd></div>
          <div><dt>Nguồn ảnh</dt><dd><Link to={`/photos/${photo.id}`}>Mở ảnh đã đăng</Link></dd></div>
        </dl>}
        <p className="comparison-note">{variant ? 'Đây là WebP thật từ API media. Pipeline máy chủ áp dụng Orientation rồi loại EXIF/GPS.' : 'Chưa có ảnh xử lý trên máy chủ; preview bên trái không được lưu vào gallery.'}</p>
      </figure>
    </div>
    {preview && (!preview.orientation || preview.orientation === 1) && <p className="comparison-note">Ảnh không có chỉ dẫn xoay/lật khác hướng mặc định; hai ảnh có thể nhìn cùng chiều sau xử lý.</p>}
  </section>;
}
