import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const TAG_LENGTH = 16; // 128 bits

export interface EncryptedData {
  ciphertext: string; // base64
  iv: string;         // base64
  tag: string;        // base64
}

// Encrypt a plaintext string using AES-256-GCM
export function encrypt(plaintext: string, secret: Buffer): EncryptedData {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, secret, iv, { authTagLength: TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

// Decrypt AES-256-GCM encrypted data
export function decrypt(data: EncryptedData, secret: Buffer): string {
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, secret, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// SHA-256 hash of an API key (for storage lookup — never store raw keys)
export function hashKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Generate a new API key: usr_ prefix + 32 random hex chars
export function generateApiKey(): string {
  return 'usr_' + crypto.randomBytes(16).toString('hex');
}

// Create a display-safe prefix: usr_XXXXXXXX...XXXX
export function keyPrefix(apiKey: string): string {
  return apiKey.slice(0, 12) + '...' + apiKey.slice(-4);
}
