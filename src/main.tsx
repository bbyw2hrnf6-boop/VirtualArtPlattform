import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { reportApplicationError } from './services/telemetry';
import { startWebVitals } from './services/webVitals';
import './styles/global.css';
import './styles/generatedAssets.css';
import './styles/visitorControls.css';
import './styles/p0Consistency.css';
import './styles/mobileExperience.css';

startWebVitals();
addEventListener('error', (event) => reportApplicationError(event.error, 'window_error'));
addEventListener('unhandledrejection', (event) => reportApplicationError(event.reason, 'unhandled_rejection'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<div className="loading" role="status" aria-live="polite">Preparing your space…</div>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>
);
