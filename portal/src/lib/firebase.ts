import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';

function normalizeEnv(value: string | undefined): string {
  const normalized = value?.trim() || '';
  if (!normalized) return '';

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'changeme') {
    return '';
  }

  return normalized;
}

const firebaseConfig = {
  apiKey: normalizeEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: normalizeEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: normalizeEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
};

function looksLikeFirebaseApiKey(apiKey: string): boolean {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey);
}

const isConfigured = Boolean(
  looksLikeFirebaseApiKey(firebaseConfig.apiKey) &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let configError: string | null = null;

function getApp() {
  if (!isConfigured || configError) return null;
  if (!app) {
    try {
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    } catch (err) {
      configError = (err as Error).message;
      console.warn('[Firebase] Client auth disabled:', configError);
      return null;
    }
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (!isConfigured || configError) return null;
  if (!auth) {
    const a = getApp();
    if (!a) return null;
    try {
      auth = getAuth(a);
    } catch (err) {
      configError = (err as Error).message;
      console.warn('[Firebase] Client auth unavailable:', configError);
      return null;
    }
  }
  return auth;
}

export function isFirebaseClientConfigured(): boolean {
  return isConfigured && !configError;
}

export function getFirebaseClientConfigError(): string | null {
  return configError;
}

export async function signInWithGoogle() {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  return signInWithPopup(a, provider);
}

export async function signInWithGitHub() {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase not configured');
  const provider = new GithubAuthProvider();
  return signInWithPopup(a, provider);
}

export async function signOut() {
  const a = getFirebaseAuth();
  if (!a) return;
  return firebaseSignOut(a);
}

export function onAuthChange(callback: (user: User | null) => void) {
  const a = getFirebaseAuth();
  if (!a) {
    // Not configured - immediately report no user
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(a, callback);
}

export async function getIdToken(): Promise<string | null> {
  const a = getFirebaseAuth();
  if (!a) return null;
  const user = a.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
