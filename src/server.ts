import { config } from './config.js';
import express from 'express';
import cors from 'cors';
import { KeyDB } from './db.js';
import { encrypt, decrypt, hashKey, generateApiKey, keyPrefix } from './crypto.js';
import { CONNECTORS, validateCredentials } from './connectors.js';
import { RateLimiter } from './rate-limiter.js';

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
    version: '1.0.0',
  });
});

// --- Registration Page ---
app.get('/register', (_req, res) => {
  res.type('html').send(getRegistrationHtml());
});

// --- POST /api/register ---
app.post('/api/register', registerLimiter.middleware(), (req, res) => {
  const { label, connector_id, credentials } = req.body;

  // Validate inputs
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

  // Validate credentials against connector schema
  const validation = validateCredentials(connector_id, credentials);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  // Generate key, encrypt credentials, store
  const apiKey = generateApiKey();
  const hash = hashKey(apiKey);
  const prefix = keyPrefix(apiKey);
  const encrypted = encrypt(JSON.stringify(credentials), config.encryptionSecret);

  db.register(hash, prefix, label.trim(), connector_id, encrypted);
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

// --- POST /api/rotate ---
app.post('/api/rotate', rotateLimiter.middleware(), (req, res) => {
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

// --- POST /internal/resolve ---
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
    res.status(401).json({ valid: false, error: 'Invalid or revoked API key, or server not authorized' });
    return;
  }

  // Decrypt credentials
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

// --- Admin middleware ---
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

// --- GET /admin/keys ---
app.get('/admin/keys', adminAuth, (_req, res) => {
  const keys = db.listKeys();
  res.json({ keys, total: keys.length });
});

// --- DELETE /admin/keys/:prefix ---
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

// --- GET /admin/stats ---
app.get('/admin/stats', adminAuth, (_req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Global error handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---
app.listen(config.port, config.host, () => {
  console.log(`MCP Key Service running on ${config.host}:${config.port}`);
  console.log(`Registration page: http://localhost:${config.port}/register`);
});

// --- Registration HTML ---
function getRegistrationHtml(): string {
  // Build connector options and field configs for the frontend
  const connectorOptions = Object.entries(CONNECTORS).map(
    ([id, c]) => `<option value="${id}">${c.label}</option>`
  ).join('\n');

  const connectorFieldsJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(CONNECTORS).map(([id, c]) => [id, c.fields])
    )
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Key Service — Register</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0;
      min-height: 100vh; display: flex; justify-content: center; align-items: center;
      padding: 2rem;
    }
    .container { max-width: 480px; width: 100%; }
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { font-size: 1.5rem; color: #f8fafc; margin-bottom: 0.5rem; }
    .header p { color: #94a3b8; font-size: 0.9rem; }
    .brand { color: #38bdf8; font-weight: 600; }
    .card {
      background: #1e293b; border-radius: 12px; padding: 2rem;
      border: 1px solid #334155;
    }
    label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.4rem; margin-top: 1rem; }
    label:first-child { margin-top: 0; }
    input, select {
      width: 100%; padding: 0.65rem 0.8rem; border-radius: 8px;
      border: 1px solid #475569; background: #0f172a; color: #e2e8f0;
      font-size: 0.95rem; outline: none; transition: border-color 0.2s;
    }
    input:focus, select:focus { border-color: #38bdf8; }
    .help-text { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    button {
      width: 100%; padding: 0.75rem; border: none; border-radius: 8px;
      background: #2563eb; color: #fff; font-size: 1rem; font-weight: 600;
      cursor: pointer; margin-top: 1.5rem; transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #475569; cursor: not-allowed; }
    .error { color: #f87171; font-size: 0.85rem; margin-top: 0.5rem; }
    .result { display: none; }
    .result.show { display: block; }
    .key-box {
      background: #0f172a; border: 1px solid #334155; border-radius: 8px;
      padding: 1rem; margin: 1rem 0; word-break: break-all;
      font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem;
      position: relative; color: #34d399;
    }
    .copy-btn {
      position: absolute; top: 0.5rem; right: 0.5rem;
      background: #334155; border: none; color: #94a3b8; padding: 0.3rem 0.6rem;
      border-radius: 4px; cursor: pointer; font-size: 0.75rem; width: auto;
      margin-top: 0;
    }
    .copy-btn:hover { background: #475569; }
    .warning {
      background: #451a03; border: 1px solid #92400e; border-radius: 8px;
      padding: 0.75rem 1rem; margin-top: 1rem; font-size: 0.85rem; color: #fbbf24;
    }
    .url-box {
      background: #0f172a; border: 1px solid #334155; border-radius: 8px;
      padding: 0.75rem 1rem; margin-top: 0.75rem; word-break: break-all;
      font-family: monospace; font-size: 0.8rem; color: #93c5fd;
    }
    #dynamic-fields { min-height: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MCP Key Registration</h1>
      <p>Get an API key for <span class="brand">TechMavie</span> MCP servers</p>
    </div>

    <div class="card" id="form-card">
      <form id="register-form">
        <label for="connector">Service Type</label>
        <select id="connector" name="connector_id" required>
          <option value="">Select a service...</option>
          ${connectorOptions}
        </select>

        <div id="dynamic-fields"></div>

        <label for="label">Label (for your reference)</label>
        <input type="text" id="label" name="label" placeholder="e.g. My Nextcloud" required maxlength="100">

        <button type="submit" id="submit-btn">Register & Get API Key</button>
        <div class="error" id="error-msg"></div>
      </form>
    </div>

    <div class="card result" id="result-card">
      <h2 style="font-size:1.1rem; margin-bottom:0.5rem;">Your API Key</h2>
      <div class="key-box">
        <span id="api-key-display"></span>
        <button class="copy-btn" onclick="copyKey()">Copy</button>
      </div>
      <p style="font-size:0.85rem; color:#94a3b8; margin-top:0.5rem;">Ready-to-paste MCP URL:</p>
      <div class="url-box" id="url-display"></div>
      <div class="warning">
        Save this key now — it cannot be retrieved later. If lost, you'll need to register again.
      </div>
      <button onclick="resetForm()" style="background:#334155; margin-top:1rem;">Register Another Key</button>
    </div>
  </div>

  <script>
    const CONNECTOR_FIELDS = ${connectorFieldsJson};

    const connectorSelect = document.getElementById('connector');
    const dynamicFields = document.getElementById('dynamic-fields');
    const form = document.getElementById('register-form');
    const errorMsg = document.getElementById('error-msg');
    const formCard = document.getElementById('form-card');
    const resultCard = document.getElementById('result-card');

    connectorSelect.addEventListener('change', () => {
      const id = connectorSelect.value;
      dynamicFields.innerHTML = '';
      if (!id || !CONNECTOR_FIELDS[id]) return;

      CONNECTOR_FIELDS[id].forEach(field => {
        const lbl = document.createElement('label');
        lbl.setAttribute('for', 'cred_' + field.key);
        lbl.textContent = field.label;
        dynamicFields.appendChild(lbl);

        const input = document.createElement('input');
        input.type = field.type === 'password' ? 'password' : 'text';
        input.id = 'cred_' + field.key;
        input.name = field.key;
        input.placeholder = field.placeholder || '';
        input.required = field.required;
        dynamicFields.appendChild(input);

        if (field.helpText) {
          const help = document.createElement('div');
          help.className = 'help-text';
          help.textContent = field.helpText;
          dynamicFields.appendChild(help);
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.textContent = '';
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Registering...';

      const connectorId = connectorSelect.value;
      const label = document.getElementById('label').value;
      const fields = CONNECTOR_FIELDS[connectorId] || [];

      const credentials = {};
      for (const field of fields) {
        credentials[field.key] = document.getElementById('cred_' + field.key)?.value || '';
      }

      try {
        const res = await fetch('api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, connector_id: connectorId, credentials }),
        });
        const data = await res.json();

        if (!res.ok) {
          errorMsg.textContent = data.error || 'Registration failed';
          btn.disabled = false;
          btn.textContent = 'Register & Get API Key';
          return;
        }

        document.getElementById('api-key-display').textContent = data.api_key;
        document.getElementById('url-display').textContent = data.usage?.url_example || '';
        formCard.style.display = 'none';
        resultCard.classList.add('show');
      } catch (err) {
        errorMsg.textContent = 'Network error — please try again';
        btn.disabled = false;
        btn.textContent = 'Register & Get API Key';
      }
    });

    function copyKey() {
      const key = document.getElementById('api-key-display').textContent;
      navigator.clipboard.writeText(key).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      });
    }

    function resetForm() {
      formCard.style.display = 'block';
      resultCard.classList.remove('show');
      form.reset();
      dynamicFields.innerHTML = '';
      document.getElementById('submit-btn').disabled = false;
      document.getElementById('submit-btn').textContent = 'Register & Get API Key';
    }
  </script>
</body>
</html>`;
}
