import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: 'AIzaSyBGM4dcF_V9b04W3obwZp1NwMnTV9Ak80M',
  authDomain: 'virtualartplattform.firebaseapp.com',
  projectId: 'virtualartplattform',
  storageBucket: 'virtualartplattform.firebasestorage.app',
  messagingSenderId: '680521841065',
  appId: '1:680521841065:web:f989a53b267e6f6d13acb8'
};

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);
export const firebaseFunctions = getFunctions(firebaseApp, 'europe-west1');

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim();
if (appCheckSiteKey && typeof window !== 'undefined') {
  const debugToken = import.meta.env.DEV
    ? import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim()
    : undefined;
  if (debugToken) {
    (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
