import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={<div className="loading">Preparing your space…</div>}><App /></Suspense></StrictMode>
);
