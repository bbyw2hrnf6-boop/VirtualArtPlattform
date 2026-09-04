export const APP_CSP_REPORT_URL =
  "https://europe-west1-virtualartplattform.cloudfunctions.net/lieuvaCspReport";
export const APP_REPORTING_ENDPOINTS = `lieuva-csp="${APP_CSP_REPORT_URL}"`;

/** Report-only first: this source list covers the bundled app, Firebase Auth,
 * App Check, Firestore/Storage, callable Functions, and blob-backed 3D media.
 * The same byte-for-byte value is asserted against firebase.json so static and
 * server-rendered HTML can be promoted together before enforcement. */
export const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://www.google.com https://www.recaptcha.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' blob: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://europe-west1-virtualartplattform.cloudfunctions.net https://www.google.com https://www.gstatic.com https://www.recaptcha.net",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://recaptcha.google.com https://www.recaptcha.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "upgrade-insecure-requests",
  "report-to lieuva-csp",
  `report-uri ${APP_CSP_REPORT_URL}`,
].join("; ");
