import { createRoot } from 'react-dom/client';
import AppRouter from './app/router';
import './styles.css';
import './block7.css';
import './pages/auth/auth.css';

// Reset links in the contract use /reset?token=..., while this snapshot uses HashRouter.
const initialUrl = new URL(window.location.href);
if (initialUrl.pathname.replace(/\/+$/, '') === '/reset' && initialUrl.searchParams.has('token') && !initialUrl.hash) {
  const query = initialUrl.search;
  initialUrl.pathname = '/';
  initialUrl.search = '';
  initialUrl.hash = `/reset${query}`;
  window.history.replaceState(null, '', initialUrl);
}

// Appending lists deliberately reopen from the beginning, including browser reload.
window.history.scrollRestoration = 'manual';
createRoot(document.getElementById('root')!).render(<AppRouter />);
