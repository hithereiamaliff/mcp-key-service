import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase Admin SDK not configured — user auth endpoints will be disabled');
    return;
  }

  if (getApps().length === 0) {
    const serviceAccount: ServiceAccount = { projectId, clientEmail, privateKey };
    initializeApp({ credential: cert(serviceAccount) });
  }

  initialized = true;
}

export function isFirebaseConfigured(): boolean {
  ensureInitialized();
  return initialized;
}

export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    return await getAuth().verifyIdToken(idToken);
  } catch (err) {
    console.error('[Auth] Failed to verify Firebase token:', (err as Error).message);
    return null;
  }
}
