import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { isResource, validId } from '../config/resources';
import AdminDeletePage from '../pages/AdminDeletePage';
import AdminFormPage from '../pages/AdminFormPage';
import AdminListPage from '../pages/AdminListPage';
import DishDetailPage from '../pages/DishDetailPage';
import DishListPage from '../pages/DishListPage';
import NotFoundPage from '../pages/NotFoundPage';

function AdminRoute({ page }: { page: 'list' | 'new' | 'edit' | 'delete' }) {
  const { resource, id } = useParams();
  if (!isResource(resource) || ((page === 'edit' || page === 'delete') && !validId(id))) return <NotFoundPage />;
  const key = `${resource}:${page}:${id || ''}`;
  if (page === 'list') return <AdminListPage key={key} resource={resource} />;
  if (page === 'new' || page === 'edit') return <AdminFormPage key={key} resource={resource} id={page === 'edit' ? id : undefined} />;
  return <AdminDeletePage key={key} resource={resource} id={id!} />;
}

export default function AppRouter() {
  return <HashRouter><Routes><Route element={<Layout />}>
    <Route index element={<Navigate to="/dishes" replace />} />
    <Route path="dishes" element={<DishListPage />} />
    <Route path="dishes/:id" element={<DishDetailPage />} />
    <Route path="admin" element={<Navigate to="/admin/dishes" replace />} />
    <Route path="admin/:resource" element={<AdminRoute page="list" />} />
    <Route path="admin/:resource/new" element={<AdminRoute page="new" />} />
    <Route path="admin/:resource/:id/edit" element={<AdminRoute page="edit" />} />
    <Route path="admin/:resource/:id/delete" element={<AdminRoute page="delete" />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route></Routes></HashRouter>;
}
