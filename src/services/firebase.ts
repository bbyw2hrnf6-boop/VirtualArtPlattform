import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBGM4dcF_V9b04W3obwZp1NwMnTV9Ak80M',
  authDomain: 'virtualartplattform.firebaseapp.com',
  projectId: 'virtualartplattform',
  storageBucket: 'virtualartplattform.firebasestorage.app',
  messagingSenderId: '680521841065',
  appId: '1:680521841065:web:f989a53b267e6f6d13acb8'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);
