import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<div className="loading" role="status" aria-live="polite">Preparing your space…</div>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>
);
