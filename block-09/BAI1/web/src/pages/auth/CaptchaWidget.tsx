import { useEffect, useRef, useState } from 'react';

type TurnstileOptions = {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => boolean;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let turnstileScript: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScript) return turnstileScript;

  turnstileScript = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('bep-turnstile-script') as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    const loaded = () => window.turnstile ? resolve() : reject(new Error('Turnstile chưa sẵn sàng.'));
    const failed = () => {
      script.remove();
      reject(new Error('Không tải được Turnstile.'));
    };
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.id = 'bep-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch(error => {
    turnstileScript = null;
    throw error;
  });

  return turnstileScript;
}

export default function CaptchaWidget({ onToken, resetKey = 0 }: { onToken: (token: string | null) => void; resetKey?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const previousReset = useRef(resetKey);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '';

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    let active = true;
    if (!siteKey || siteKey === 'your-turnstile-site-key') {
      setState('missing');
      return () => { active = false; };
    }
    setState('loading');
    void loadTurnstile().then(() => {
      if (!active || !container.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: token => { onTokenRef.current(token); setState('ready'); },
        'expired-callback': () => { onTokenRef.current(null); },
        'error-callback': () => { onTokenRef.current(null); setState('error'); return true; },
      });
      setState('ready');
    }).catch(() => {
      if (active) setState('error');
    });

    return () => {
      active = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      onTokenRef.current(null);
    };
  }, [siteKey]);

  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    onTokenRef.current(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  return <div className="captcha-field">
    <div ref={container} aria-label="Xác minh Turnstile" />
    {state === 'loading' && <p className="captcha-hint">Đang tải bước xác minh…</p>}
    {state === 'missing' && <p className="captcha-hint error">Cần cấu hình `VITE_TURNSTILE_SITE_KEY` để dùng xác minh CAPTCHA.</p>}
    {state === 'error' && <p className="captcha-hint error">Không tải được bước xác minh. Vui lòng thử tải lại trang.</p>}
  </div>;
}
