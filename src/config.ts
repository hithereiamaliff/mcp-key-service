import 'dotenv/config';

type TrustProxySetting = boolean | number | string;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function parseEncryptionSecret(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error('FATAL: KEY_ENCRYPTION_SECRET must be exactly 64 hex characters (256 bits)');
    console.error('Generate one with: openssl rand -hex 32');
    process.exit(1);
  }
  return Buffer.from(hex, 'hex');
}

function parseInternalServerTokens(raw: string): Map<string, string> {
  const tokenToServerId = new Map<string, string>();
  const seenServerIds = new Set<string>();

  for (const entry of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      console.error('FATAL: INTERNAL_SERVER_TOKENS entries must use the format server_id:token');
      process.exit(1);
    }

    const serverId = entry.slice(0, separatorIndex).trim();
    const token = entry.slice(separatorIndex + 1).trim();

    if (!/^[a-z0-9-]+$/i.test(serverId)) {
      console.error(`FATAL: Invalid server_id in INTERNAL_SERVER_TOKENS: ${serverId}`);
      process.exit(1);
    }
    if (seenServerIds.has(serverId)) {
      console.error(`FATAL: Duplicate server_id in INTERNAL_SERVER_TOKENS: ${serverId}`);
      process.exit(1);
    }
    if (tokenToServerId.has(token)) {
      console.error(`FATAL: Duplicate token in INTERNAL_SERVER_TOKENS for server_id: ${serverId}`);
      process.exit(1);
    }

    seenServerIds.add(serverId);
    tokenToServerId.set(token, serverId);
  }

  if (tokenToServerId.size === 0) {
    console.error('FATAL: INTERNAL_SERVER_TOKENS must define at least one server_id:token pair');
    process.exit(1);
  }

  return tokenToServerId;
}

function parseTrustProxy(value: string | undefined): TrustProxySetting {
  if (!value || value === '0' || value.toLowerCase() === 'false') {
    return false;
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  return value;
}

const adminApiKey = requireEnv('ADMIN_API_KEY');
const encryptionSecret = parseEncryptionSecret(requireEnv('KEY_ENCRYPTION_SECRET'));
const internalServerTokens = parseInternalServerTokens(requireEnv('INTERNAL_SERVER_TOKENS'));

// Firebase Admin SDK (optional — user auth disabled if not set)
const firebaseAdminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID || '';
const firebaseAdminClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '';
const firebaseAdminPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';

// Admin UIDs: comma-separated Firebase UIDs that get is_admin=1 on first sync
const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '8090', 10),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || './data',
  adminApiKey,
  encryptionSecret,
  internalServerTokens,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  firebaseAdminProjectId,
  firebaseAdminClientEmail,
  firebaseAdminPrivateKey,
  adminUids,
};
