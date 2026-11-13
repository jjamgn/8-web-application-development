import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';

export function AuthPage({ eyebrow, title, description, children, footer }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <Link className="auth-brand" to="/dishes"><span aria-hidden="true">b.</span>Bếp Nhà</Link>
      <span className="auth-eyebrow">{eyebrow}</span>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-description">{description}</p>
      {children}
      {footer && <div className="auth-card-footer">{footer}</div>}
    </section>
  </main>;
}

export function AuthMessage({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'success' | 'info' }) {
  return <div className={`auth-message ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fields[field] : undefined;
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
