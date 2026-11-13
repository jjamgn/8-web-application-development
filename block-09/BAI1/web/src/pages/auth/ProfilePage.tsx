import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/api';
import { AuthMessage, fieldError, passwordByteLength } from './AuthPage';
import './profile.css';

export default function ProfilePage() {
  const { user, changePassword, logout, updateName } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<unknown>(null);
  const [nameNotice, setNameNotice] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState('');
  const shown = user;
  const initials = (shown?.name.trim().split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('') || shown?.email[0] || 'B').toLocaleUpperCase('vi');

  function editName() {
    setName(user?.name || ''); setNameError(null); setNameNotice(''); setNameSuccess(''); setEditingName(true);
  }
  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null); setNameNotice(''); setNameSuccess('');
    const trimmed = name.trim();
    if (!trimmed) { setNameNotice('Vui lòng nhập họ và tên.'); return; }
    if (trimmed.length > 120) { setNameNotice('Họ và tên tối đa 120 ký tự.'); return; }
    setSavingName(true);
    try {
      const updated = await updateName(trimmed);
      setName(updated.name); setEditingName(false); setNameSuccess('Đã cập nhật họ tên.');
    } catch (caught) { setNameError(caught); }
    finally { setSavingName(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setNotice(''); setSuccess('');
    if ([...password].length < 8) { setNotice('Mật khẩu mới cần ít nhất 8 ký tự.'); return; }
    if (passwordByteLength(password) > 72 || passwordByteLength(currentPassword) > 72) { setNotice('Mật khẩu không được vượt quá 72 byte UTF-8.'); return; }
    if (password !== confirmPassword) { setNotice('Mật khẩu xác nhận chưa khớp.'); return; }
    setBusy(true);
    try {
      await changePassword({ currentPassword, password, confirmPassword });
      setCurrentPassword(''); setPassword(''); setConfirmPassword(''); setShowPasswords(false);
      setSuccess('Đã đổi mật khẩu. Bạn vẫn đang đăng nhập trên thiết bị này; các thiết bị khác cần đăng nhập lại.');
    } catch (caught) { setError(caught); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setSigningOut(true); setProfileError('');
    try { await logout(); }
    catch (caught) { setProfileError(errorMessage(caught)); }
    finally { setSigningOut(false); }
  }
  return <main className="profile-page">
    <div className="profile-heading"><span className="eyebrow">BẾP NHÀ / TÀI KHOẢN</span><h1>Hồ sơ của bạn</h1><p>Thông tin tài khoản và bảo mật, ở cùng một nơi.</p></div>
    <div className="profile-grid">
      <section className="profile-summary" aria-labelledby="profile-info-title">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <h2 id="profile-info-title">{shown?.name || 'Tài khoản Bếp Nhà'}</h2>
        <p className="profile-email">{shown?.email}</p>
        <dl className="profile-details"><div><dt>Họ và tên</dt><dd>{shown?.name || '—'}</dd></div><div><dt>Email</dt><dd>{shown?.email}</dd></div></dl>
        {nameSuccess && <AuthMessage kind="success">{nameSuccess}</AuthMessage>}
        {editingName ? <form className="profile-name-form" onSubmit={saveName} aria-busy={savingName}>
          {nameNotice && <AuthMessage kind="info">{nameNotice}</AuthMessage>}
          {Boolean(nameError) && <AuthMessage>{errorMessage(nameError)}</AuthMessage>}
          <label className="auth-field" htmlFor="profile-name">Họ và tên
            <input id="profile-name" name="name" autoComplete="name" autoFocus required maxLength={120} disabled={savingName || busy || signingOut} value={name} onChange={event => setName(event.target.value)} aria-invalid={!!fieldError(nameError, 'name')} aria-describedby={fieldError(nameError, 'name') ? 'profile-name-error' : undefined} />
            {fieldError(nameError, 'name') && <small id="profile-name-error" className="auth-field-error">{fieldError(nameError, 'name')}</small>}
          </label>
          <div className="profile-name-actions"><button type="submit" className="button primary" disabled={savingName || busy || signingOut}>{savingName ? 'Đang lưu…' : 'Lưu tên'}</button><button type="button" className="button outline" disabled={savingName} onClick={() => { setEditingName(false); setName(user?.name || ''); }}>Hủy</button></div>
        </form> : <button type="button" className="button outline profile-edit-name" disabled={busy || signingOut} onClick={editName}>Chỉnh sửa tên</button>}
        {profileError && <AuthMessage>{profileError}</AuthMessage>}
        <div className="profile-actions"><Link className="button outline" to="/dishes">Về thực đơn</Link><button className="button outline" type="button" disabled={busy || signingOut || savingName} onClick={() => void signOut()}>{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div>
      </section>
      <section className="profile-security" aria-labelledby="profile-password-title">
        <span className="auth-eyebrow">BẢO MẬT TÀI KHOẢN</span><h2 id="profile-password-title">Đổi mật khẩu</h2>
        <p className="profile-help">Xác nhận mật khẩu hiện tại trước khi đặt mật khẩu mới.</p>
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          {success && <AuthMessage kind="success">{success}</AuthMessage>}
          {notice && <AuthMessage kind="info">{notice}</AuthMessage>}
          {Boolean(error) && <AuthMessage>{errorMessage(error)}</AuthMessage>}
          <fieldset className="profile-password-fields" disabled={busy || signingOut || savingName}>
            <legend className="visually-hidden">Thông tin đổi mật khẩu</legend>
            <label className="auth-field" htmlFor="profile-current-password">Mật khẩu hiện tại
              <input id="profile-current-password" name="currentPassword" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} aria-invalid={!!fieldError(error, 'currentPassword')} aria-describedby={fieldError(error, 'currentPassword') ? 'profile-current-error' : undefined} />
              {fieldError(error, 'currentPassword') && <small id="profile-current-error" className="auth-field-error">{fieldError(error, 'currentPassword')}</small>}
            </label>
            <label className="auth-field" htmlFor="profile-new-password">Mật khẩu mới
              <input id="profile-new-password" name="password" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} aria-invalid={!!fieldError(error, 'password')} aria-describedby="profile-password-help" />
              <small id="profile-password-help" className="auth-hint">Tối thiểu 8 ký tự, tối đa 72 byte UTF-8.</small>
              {fieldError(error, 'password') && <small className="auth-field-error">{fieldError(error, 'password')}</small>}
            </label>
            <label className="auth-field" htmlFor="profile-confirm-password">Xác nhận mật khẩu mới
              <input id="profile-confirm-password" name="confirmPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} aria-invalid={!!fieldError(error, 'confirmPassword')} />
              {fieldError(error, 'confirmPassword') && <small className="auth-field-error">{fieldError(error, 'confirmPassword')}</small>}
            </label>
            <label className="profile-show-password"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} />Hiện mật khẩu</label>
            <button className="button primary auth-submit" type="submit">{busy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}</button>
          </fieldset>
          <p className="profile-session-note">Sau khi đổi mật khẩu, bạn tiếp tục sử dụng trên thiết bị này. Các thiết bị khác sẽ cần đăng nhập lại.</p>
        </form>
      </section>
    </div>
  </main>;
}
