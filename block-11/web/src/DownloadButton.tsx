import { useEffect, useId, useRef, useState } from 'react';
import type { PhotoDto } from './types';

export function DownloadButton({ photo, choices = false }: { photo: PhotoDto; choices?: boolean }) {
  const variants = [...photo.variants].sort((a, b) => b.width - a.width);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const url = (width: number) => '/media/photos/' + photo.id + '/' + width + '.webp?download=1';
  function position() {
    const popup = menu.current, button = toggle.current;
    if (!popup || !button || !popup.matches(':popover-open')) return;
    const rect = button.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(innerWidth - popup.offsetWidth - 8, rect.right - popup.offsetWidth)) + 'px';
    popup.style.top = Math.max(8, Math.min(rect.bottom + 8, innerHeight - popup.offsetHeight - 8)) + 'px';
  }
  useEffect(() => {
    if (!open) return;
    position();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  return <div className={'download-split' + (choices ? ' has-choices' : '')}>
    <a className="button secondary action-button download-default" href={url(variants[0].width)} download title={'Tải WebP ' + variants[0].width + ' × ' + variants[0].height}>Tải WebP</a>
    {choices && <>
      <button ref={toggle} type="button" className="button secondary download-toggle" aria-label="Chọn kích thước tải WebP" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => menu.current?.togglePopover()} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); menu.current?.showPopover(); } }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div id={id} ref={menu} popover="auto" className="download-menu" role="menu" aria-label="Kích thước WebP" onToggle={e => {
        const shown = e.currentTarget.matches(':popover-open'); setOpen(shown);
        if (shown) { position(); menu.current?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true }); }
      }} onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menu.current?.hidePopover(); toggle.current?.focus({ preventScroll: true }); return; }
        const entries = Array.from(menu.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
        const current = entries.indexOf(document.activeElement as HTMLAnchorElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? entries.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
          entries[next]?.focus({ preventScroll: true });
        }
      }}>
        <p>Chọn kích thước để tải ngay</p>
        {variants.map((variant, index) => <a key={variant.width} role="menuitem" href={url(variant.width)} download onClick={() => { menu.current?.hidePopover(); toggle.current?.focus({ preventScroll: true }); }}>
          <span>{variant.width} × {variant.height}{index === 0 && <small>Lớn nhất hiện có · Mặc định</small>}</span><span className="download-bytes">{Math.max(1, Math.round(variant.bytes / 1024))} KiB</span>
        </a>)}
      </div>
    </>}
  </div>;
}
