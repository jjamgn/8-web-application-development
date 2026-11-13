import { createRoot } from 'react-dom/client';
import AppRouter from './app/router';
import './styles.css';
import './block7.css';

// Appending lists deliberately reopen from the beginning, including browser reload.
window.history.scrollRestoration = 'manual';
createRoot(document.getElementById('root')!).render(<AppRouter />);
