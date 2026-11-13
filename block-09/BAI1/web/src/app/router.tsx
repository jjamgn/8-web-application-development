import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import ExplorePage from '../pages/ExplorePage';
import Layout from '../components/Layout';
import { isResource, validId } from '../config/resources';
import AdminDeletePage from '../pages/AdminDeletePage';
import AdminFormPage from '../pages/AdminFormPage';
import AdminListPage from '../pages/AdminListPage';
import DishDetailPage from '../pages/DishDetailPage';
import DishListPage from '../pages/DishListPage';
import NotFoundPage from '../pages/NotFoundPage';
import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import ActivatePage from '../pages/auth/ActivatePage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';
import ProfilePage from '../pages/auth/ProfilePage';
import { AuthProvider, useAuth } from '../lib/auth';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="page-state"><p>Đang khôi phục phiên đăng nhập…</p></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function AdminRoute({ page }: { page: 'list' | 'new' | 'edit' | 'delete' }) {
  const { resource, id } = useParams();
  if (!isResource(resource) || ((page === 'edit' || page === 'delete') && !validId(id))) return <NotFoundPage />;
  const key = `${resource}:${page}:${id || ''}`;
  if (page === 'list') return <AdminListPage key={key} resource={resource} />;
  if (page === 'new' || page === 'edit') return <AdminFormPage key={key} resource={resource} id={page === 'edit' ? id : undefined} />;
  return <AdminDeletePage key={key} resource={resource} id={id!} />;
}

export default function AppRouter() {
  return <AuthProvider><HashRouter><Routes><Route element={<Layout />}>
    <Route index element={<Navigate to="/dishes" replace />} />
    <Route path="dishes" element={<DishListPage />} />
    <Route path="explore" element={<ExplorePage />} />
    <Route path="dishes/:id" element={<DishDetailPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="register" element={<RegisterPage />} />
    <Route path="activate" element={<ActivatePage />} />
    <Route path="forgot-password" element={<ForgotPasswordPage />} />
    <Route path="reset" element={<ResetPasswordPage />} />
    <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
    <Route path="admin" element={<RequireAuth><Navigate to="/admin/dishes" replace /></RequireAuth>} />
    <Route path="admin/:resource" element={<RequireAuth><AdminRoute page="list" /></RequireAuth>} />
    <Route path="admin/:resource/new" element={<RequireAuth><AdminRoute page="new" /></RequireAuth>} />
    <Route path="admin/:resource/:id/edit" element={<RequireAuth><AdminRoute page="edit" /></RequireAuth>} />
    <Route path="admin/:resource/:id/delete" element={<RequireAuth><AdminRoute page="delete" /></RequireAuth>} />
    <Route path="*" element={<NotFoundPage />} />
  </Route></Routes></HashRouter></AuthProvider>;
}
