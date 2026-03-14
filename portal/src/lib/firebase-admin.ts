import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function ensureInit() {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin SDK not configured');
  }

  const serviceAccount: ServiceAccount = { projectId, clientEmail, privateKey };
  initializeApp({ credential: cert(serviceAccount) });
}

export async function verifyIdToken(token: string) {
  ensureInit();
  return getAuth().verifyIdToken(token);
}
