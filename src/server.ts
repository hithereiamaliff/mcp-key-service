import { config } from './config.js';
import express from 'express';
import cors from 'cors';
import { KeyDB } from './db.js';
import { encrypt, decrypt, hashKey, generateApiKey, keyPrefix } from './crypto.js';
import { CONNECTORS, validateCredentials } from './connectors.js';
import { RateLimiter } from './rate-limiter.js';
import { userAuth, requireActiveSubscription, requireKeyOwnership } from './auth-middleware.js';
import { isFirebaseConfigured } from './firebase-admin.js';

const app = express();
const db = new KeyDB(config.dataDir);
const KEY_PREFIX_PATTERN = /^usr_[a-f0-9]{8}\.\.\.[a-f0-9]{4}$/i;

// Rate limiters
const registerLimiter = new RateLimiter(5, 60 * 60 * 1000);   // 5/hour
const rotateLimiter = new RateLimiter(10, 60 * 60 * 1000);    // 10/hour

// --- Middleware ---
app.set('trust proxy', config.trustProxy);
app.use(express.json());
app.use(cors());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} (${req.ip})`);
  next();
});

// --- Health ---
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    version: '2.0.0',
    firebase: isFirebaseConfigured(),
  });
});

// --- Registration Page (redirect to portal) ---
app.get('/register', (_req, res) => {
  res.redirect('https://mcpkeys.techmavie.digital');
});

// --- Connectors info (public, used by portal to render forms) ---
app.get('/api/connectors', (_req, res) => {
  const connectors = Object.fromEntries(
    Object.entries(CONNECTORS).map(([id, c]) => [id, {
      label: c.label,
      fields: c.fields,
      servers: c.servers,
    }])
  );
  res.json({ connectors });
});

// ─── Public Registration (rate-limited, optionally authenticated) ────

app.post('/api/register', registerLimiter.middleware(), (req, res, next) => {
  // If Firebase is configured, require auth + subscription
  if (isFirebaseConfigured()) {
    userAuth(req, res, () => {
      requireActiveSubscription(db)(req, res, next);
    });
  } else {
    // Legacy mode: no auth required
    next();
  }
}, (req, res) => {
  const { label, connector_id, credentials } = req.body;

  if (!label || typeof label !== 'string' || label.length > 100) {
    res.status(400).json({ error: 'Label is required (max 100 chars)' });
    return;
  }
  if (!connector_id || typeof connector_id !== 'string') {
    res.status(400).json({ error: 'connector_id is required' });
    return;
  }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    res.status(400).json({ error: 'credentials must be a non-empty object' });
    return;
  }

  const validation = validateCredentials(connector_id, credentials);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const apiKey = generateApiKey();
  const hash = hashKey(apiKey);
  const prefix = keyPrefix(apiKey);
  const encrypted = encrypt(JSON.stringify(credentials), config.encryptionSecret);

  if (req.user) {
    db.registerWithUser(hash, prefix, label.trim(), connector_id, encrypted, req.user.uid);
  } else {
    db.register(hash, prefix, label.trim(), connector_id, encrypted);
  }
  db.logEvent('register', prefix, null, req.ip || null);

  const connector = CONNECTORS[connector_id];
  const serverName = connector?.servers[0] || connector_id;

  res.status(201).json({
    api_key: apiKey,
    label: label.trim(),
    connector_id,
    created_at: new Date().toISOString(),
    message: 'Save this API key — it cannot be retrieved later.',
    usage: {
      url_example: `https://mcp.techmavie.digital/${serverName}/mcp?api_key=${apiKey}`,
      supported_servers: connector?.servers || [],
    },
  });
});

// ─── Key Rotation (rate-limited, optionally authenticated) ────

app.post('/api/rotate', rotateLimiter.middleware(), (req, res, next) => {
  if (isFirebaseConfigured()) {
    userAuth(req, res, () => {
      requireKeyOwnership(db)(req, res, next);
    });
  } else {
    next();
  }
}, (req, res) => {
  const { current_api_key } = req.body;

  if (!current_api_key || typeof current_api_key !== 'string' || !current_api_key.startsWith('usr_')) {
    res.status(400).json({ error: 'current_api_key is required and must start with usr_' });
    return;
  }

  const oldHash = hashKey(current_api_key);
  const newKey = generateApiKey();
  const newHash = hashKey(newKey);
  const newPrefix = keyPrefix(newKey);

  const success = db.rotate(oldHash, newHash, newPrefix);
  if (!success) {
    res.status(404).json({ error: 'API key not found or already revoked' });
    return;
  }

  db.logEvent('rotate', newPrefix, null, req.ip || null);

  res.json({
    new_api_key: newKey,
    message: 'Old key has been revoked. Update your MCP client URLs.',
  });
});

// ─── Internal Resolve (MCP servers only) ──────────────────────

app.post('/internal/resolve', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const callerServerId = token ? config.internalServerTokens.get(token) : undefined;

  if (!callerServerId) {
    res.status(403).json({ valid: false, error: 'Unauthorized' });
    return;
  }

  const { key, server_id } = req.body;

  if (!key || typeof key !== 'string') {
    res.status(400).json({ valid: false, error: 'key is required' });
    return;
  }
  if (server_id !== undefined && (typeof server_id !== 'string' || server_id !== callerServerId)) {
    res.status(403).json({ valid: false, error: 'server_id does not match the authenticated internal caller' });
    return;
  }

  const hash = hashKey(key);
  const entry = db.resolve(hash, callerServerId);

  if (!entry) {
    res.status(401).json({ valid: false, error: 'Invalid, revoked, or suspended API key, or server not authorized' });
    return;
  }

  try {
    const plaintext = decrypt(
      {
        ciphertext: entry.credentials_encrypted,
        iv: entry.credentials_iv,
        tag: entry.credentials_tag,
      },
      config.encryptionSecret
    );
    const credentials = JSON.parse(plaintext);

    db.logEvent('resolve', null, callerServerId, req.ip || null);

    res.json({
      valid: true,
      credentials,
      label: entry.label,
      connector_id: entry.connector_id,
    });
  } catch (err) {
    console.error('Decryption failed:', err);
    res.status(500).json({ valid: false, error: 'Failed to decrypt credentials' });
  }
});

// ─── User Routes (authenticated) ─────────────────────────────

// Get user profile (subscription status, key count)
app.get('/api/user/profile', userAuth, (req, res) => {
  const user = db.getUser(req.user!.uid);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const keys = db.listKeysByUser(req.user!.uid);
  res.json({
    email: user.email,
    display_name: user.display_name,
    subscription_status: user.subscription_status,
    current_period_end: user.current_period_end,
    is_admin: user.is_admin === 1,
    key_count: keys.length,
  });
});

// List user's own keys
app.get('/api/user/keys', userAuth, (req, res) => {
  const keys = db.listKeysByUser(req.user!.uid);
  res.json({ keys, total: keys.length });
});

// Revoke user's own key
app.delete('/api/user/keys/:prefix', userAuth, (req, res) => {
  const prefix = req.params.prefix;
  if (!KEY_PREFIX_PATTERN.test(prefix)) {
    res.status(400).json({ error: 'Invalid key prefix format' });
    return;
  }

  const success = db.revokeByUser(prefix, req.user!.uid);
  if (!success) {
    res.status(404).json({ error: 'Key not found or already revoked' });
    return;
  }
  db.logEvent('revoke', prefix, null, req.ip || null);
  res.json({ message: 'Key revoked successfully' });
});

// Claim a legacy key (no owner) by presenting the full key
app.post('/api/user/claim-key', userAuth, (req, res) => {
  const { api_key } = req.body;
  if (!api_key || typeof api_key !== 'string' || !api_key.startsWith('usr_')) {
    res.status(400).json({ error: 'api_key is required and must start with usr_' });
    return;
  }

  const hash = hashKey(api_key);
  const success = db.claimKey(hash, req.user!.uid);
  if (!success) {
    res.status(404).json({ error: 'Key not found, already owned, or revoked' });
    return;
  }

  db.logEvent('claim', keyPrefix(api_key), null, req.ip || null);
  res.json({ message: 'Key claimed successfully' });
});

// ─── Admin Routes ─────────────────────────────────────────────

function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  const headerKey = req.headers['x-admin-key'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : headerKey;

  if (!token || token !== config.adminApiKey) {
    res.status(401).json({ error: 'Unauthorized — provide admin key via Authorization: Bearer or x-admin-key header' });
    return;
  }
  next();
}

// List all keys
app.get('/admin/keys', adminAuth, (_req, res) => {
  const keys = db.listKeys();
  res.json({ keys, total: keys.length });
});

// Revoke any key
app.delete('/admin/keys/:prefix', adminAuth, (req, res) => {
  const prefix = req.params.prefix;
  if (!KEY_PREFIX_PATTERN.test(prefix)) {
    res.status(400).json({ error: 'Invalid key prefix format' });
    return;
  }

  const success = db.revoke(prefix);
  if (!success) {
    res.status(404).json({ error: 'Key not found or already revoked' });
    return;
  }
  db.logEvent('revoke', prefix, null, req.ip || null);
  res.json({ message: 'Key revoked successfully' });
});

// Service stats
app.get('/admin/stats', adminAuth, (_req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

// List all users
app.get('/admin/users', adminAuth, (_req, res) => {
  const users = db.listUsers();
  res.json({ users, total: users.length });
});

// Create or update a user (called by portal on Firebase sync)
app.post('/admin/users', adminAuth, (req, res) => {
  const { firebase_uid, email, display_name } = req.body;

  if (!firebase_uid || typeof firebase_uid !== 'string') {
    res.status(400).json({ error: 'firebase_uid is required' });
    return;
  }
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  db.createUser(firebase_uid, email, display_name || null);

  // Seed admin flag if UID is in ADMIN_UIDS
  if (config.adminUids.includes(firebase_uid)) {
    db.setUserAdmin(firebase_uid, true);
  }

  const user = db.getUser(firebase_uid);
  res.json({ user });
});

// Update user's Stripe subscription info
app.put('/admin/users/:uid/subscription', adminAuth, (req, res) => {
  const { uid } = req.params;
  const { stripe_customer_id, subscription_status, subscription_id, current_period_end } = req.body;

  if (!stripe_customer_id || !subscription_status) {
    res.status(400).json({ error: 'stripe_customer_id and subscription_status are required' });
    return;
  }

  db.updateUserStripe(uid, stripe_customer_id, subscription_status, subscription_id || null, current_period_end || null);
  res.json({ message: 'Subscription updated' });
});

// Suspend all keys for a user
app.post('/admin/users/:uid/suspend-keys', adminAuth, (req, res) => {
  const count = db.suspendKeysByUser(req.params.uid);
  db.logEvent('suspend-keys', null, null, req.ip || null);
  res.json({ message: `Suspended ${count} key(s)` });
});

// Reactivate all keys for a user
app.post('/admin/users/:uid/reactivate-keys', adminAuth, (req, res) => {
  const count = db.reactivateKeysByUser(req.params.uid);
  db.logEvent('reactivate-keys', null, null, req.ip || null);
  res.json({ message: `Reactivated ${count} key(s)` });
});

// ─── Fallback Handlers ────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────

app.listen(config.port, config.host, () => {
  console.log(`MCP Key Service v2.0.0 running on ${config.host}:${config.port}`);
  console.log(`Firebase auth: ${isFirebaseConfigured() ? 'enabled' : 'disabled'}`);
});
