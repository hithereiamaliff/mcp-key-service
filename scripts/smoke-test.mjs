import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const port = 19090;
const adminApiKey = 'admin-test-key';
const encryptionSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const nextcloudToken = randomBytes(16).toString('hex');
const ghostToken = randomBytes(16).toString('hex');
const youtubeToken = randomBytes(16).toString('hex');
const zerobounceToken = randomBytes(16).toString('hex');
const plausibleToken = randomBytes(16).toString('hex');
const forgejoToken = randomBytes(16).toString('hex');
const dataDir = path.join(rootDir, '.tmp-smoke-data');

const child = spawn(
  process.execPath,
  ['dist/server.js'],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      ADMIN_API_KEY: adminApiKey,
      KEY_ENCRYPTION_SECRET: encryptionSecret,
      INTERNAL_SERVER_TOKENS: `nextcloud:${nextcloudToken},ghost-cms:${ghostToken},youtube:${youtubeToken},zerobounce:${zerobounceToken},plausible:${plausibleToken},forgejo:${forgejoToken}`,
      TRUST_PROXY: '0',
    },
    stdio: 'inherit',
  }
);

async function waitForHealth() {
  // Up to 20 s: a cold start (first build, native modules) can take ~5 s on its own
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is up.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Server did not become healthy in time');
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  }

  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
  };
}

function buildRegisterBody(label) {
  return JSON.stringify({
    label,
    connector_id: 'nextcloud',
    credentials: {
      nextcloud_host: 'https://cloud.example.com',
      nextcloud_username: 'user',
      nextcloud_password: 'app-pass',
    },
  });
}

async function run() {
  await fs.rm(dataDir, { recursive: true, force: true });
  await waitForHealth();

  // URL fields only accept web URLs (checked directly: every /api/register slot is used below).
  const { validateCredentials } = await import('../dist/connectors.js');
  const forgejoField = (forgejo_url) => validateCredentials('forgejo', { forgejo_url, forgejo_token: 't' });
  assert.equal(forgejoField('https://git.example.com').valid, true);
  assert.equal(forgejoField('http://git.example.com').valid, true);
  assert.match(forgejoField('file:///etc/passwd').error, /must start with https:\/\//);
  assert.match(forgejoField('javascript:alert(1)').error, /must start with https:\/\//);
  assert.match(forgejoField('not a url').error, /valid URL/);
  assert.equal(forgejoField('  ').valid, false, 'blank after trimming counts as missing');
  assert.deepEqual(forgejoField('  https://git.example.com/ ').credentials, { forgejo_url: 'https://git.example.com/', forgejo_token: 't' });

  const registerPage = await request('/register', { redirect: 'manual' });
  assert.equal(registerPage.status, 302);
  assert.equal(registerPage.headers.get('location'), 'https://mcpkeys.techmavie.digital');

  const firstRegister = await request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildRegisterBody('Primary key'),
  });
  assert.equal(firstRegister.status, 201);

  const resolved = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nextcloudToken}`,
    },
    body: JSON.stringify({ key: firstRegister.body.api_key }),
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.connector_id, 'nextcloud');
  assert.equal(resolved.body.credentials.nextcloud_username, 'user');

  // YouTube connector: register + resolve
  const youtubeRegister = await request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'YouTube key',
      connector_id: 'youtube',
      credentials: { apiKey: 'yt-test-key-123' },
    }),
  });
  assert.equal(youtubeRegister.status, 201);

  const youtubeResolved = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${youtubeToken}`,
    },
    body: JSON.stringify({ key: youtubeRegister.body.api_key }),
  });
  assert.equal(youtubeResolved.status, 200);
  assert.equal(youtubeResolved.body.connector_id, 'youtube');
  assert.equal(youtubeResolved.body.credentials.apiKey, 'yt-test-key-123');

  // ZeroBounce connector: register (with optional region) + resolve
  const zerobounceRegister = await request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'ZeroBounce key',
      connector_id: 'zerobounce',
      credentials: { apiKey: 'zb-test-key-123', region: 'us' },
    }),
  });
  assert.equal(zerobounceRegister.status, 201);

  const zerobounceResolved = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${zerobounceToken}`,
    },
    body: JSON.stringify({ key: zerobounceRegister.body.api_key, server_id: 'zerobounce' }),
  });
  assert.equal(zerobounceResolved.status, 200);
  assert.equal(zerobounceResolved.body.connector_id, 'zerobounce');
  assert.equal(zerobounceResolved.body.credentials.apiKey, 'zb-test-key-123');
  assert.equal(zerobounceResolved.body.credentials.region, 'us');

  // Another server's token must not be able to read ZeroBounce credentials
  const crossServerResolve = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${youtubeToken}`,
    },
    body: JSON.stringify({ key: zerobounceRegister.body.api_key }),
  });
  assert.equal(crossServerResolve.status, 401);

  // Plausible Analytics connector: register + resolve
  const plausibleCredentials = {
    plausible_url: 'https://plausible.example.com',
    plausible_api_key: 'test-plausible-key',
    plausible_sites: 'example.com',
  };
  const plausibleRegister = await request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Plausible key',
      connector_id: 'plausible',
      credentials: plausibleCredentials,
    }),
  });
  assert.equal(plausibleRegister.status, 201);
  assert.match(plausibleRegister.body.usage.url_example, /\/plausibleanalytics\/mcp\?api_key=/);

  const plausibleResolved = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${plausibleToken}`,
    },
    body: JSON.stringify({ key: plausibleRegister.body.api_key }),
  });
  assert.equal(plausibleResolved.status, 200);
  assert.equal(plausibleResolved.body.valid, true);
  assert.equal(plausibleResolved.body.connector_id, 'plausible');
  assert.deepEqual(plausibleResolved.body.credentials, plausibleCredentials);

  const spoofedResolve = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ghostToken}`,
    },
    body: JSON.stringify({ key: firstRegister.body.api_key, server_id: 'nextcloud' }),
  });
  assert.equal(spoofedResolve.status, 403);

  const rotated = await request('/api/rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_api_key: firstRegister.body.api_key }),
  });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.body.new_api_key);

  const oldKeyResolve = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nextcloudToken}`,
    },
    body: JSON.stringify({ key: firstRegister.body.api_key }),
  });
  assert.equal(oldKeyResolve.status, 401);

  const rotatedKeyResolve = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nextcloudToken}`,
    },
    body: JSON.stringify({ key: rotated.body.new_api_key }),
  });
  assert.equal(rotatedKeyResolve.status, 200);

  // Forgejo connector: register + resolve. It doubles as the "Second key" that is revoked
  // below, so it doesn't use up another /api/register slot (5 per hour per IP).
  // Whitespace around values is trimmed before the credentials are stored.
  const forgejoCredentials = { forgejo_url: 'https://git.example.com', forgejo_token: 'test-forgejo-token' };
  const secondRegister = await request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: 'Second key',
      connector_id: 'forgejo',
      credentials: { forgejo_url: ' https://git.example.com ', forgejo_token: ' test-forgejo-token\n' },
    }),
  });
  assert.equal(secondRegister.status, 201);
  assert.match(secondRegister.body.usage.url_example, /\/forgejo\/mcp\?api_key=/);

  const forgejoResolved = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${forgejoToken}`,
    },
    body: JSON.stringify({ key: secondRegister.body.api_key, server_id: 'forgejo' }),
  });
  assert.equal(forgejoResolved.status, 200);
  assert.equal(forgejoResolved.body.connector_id, 'forgejo');
  assert.deepEqual(forgejoResolved.body.credentials, forgejoCredentials);

  // Another server's token can't resolve a Forgejo key.
  const forgejoCrossServer = await request('/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${zerobounceToken}`,
    },
    body: JSON.stringify({ key: secondRegister.body.api_key }),
  });
  assert.equal(forgejoCrossServer.status, 401);

  const listBeforeRevoke = await request('/admin/keys', {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  assert.equal(listBeforeRevoke.status, 200);
  assert.equal(listBeforeRevoke.body.total, 5); // rotated nextcloud + youtube + zerobounce + plausible + second (forgejo)
  const rotatedKeyMetadata = listBeforeRevoke.body.keys.find((entry) => entry.label === 'Primary key');
  const secondKeyMetadata = listBeforeRevoke.body.keys.find((entry) => entry.label === 'Second key');
  assert.ok(rotatedKeyMetadata);
  assert.ok(secondKeyMetadata);

  const revoke = await request(`/admin/keys/${encodeURIComponent(secondKeyMetadata.key_prefix)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  assert.equal(revoke.status, 200);

  const listAfterRevoke = await request('/admin/keys', {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  assert.equal(listAfterRevoke.status, 200);
  assert.equal(listAfterRevoke.body.total, 4);
  assert.ok(listAfterRevoke.body.keys.some((entry) => entry.key_prefix === rotatedKeyMetadata.key_prefix));

  // /api/register allows 5 requests per hour per IP. All five were used above (nextcloud,
  // youtube, zerobounce, plausible, second key), so the next one is limited, even with a
  // different X-Forwarded-For (TRUST_PROXY=0 means it must be ignored).
  for (let attempt = 0; attempt < 2; attempt++) {
    const rateLimitedCandidate = await request('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${attempt}`,
      },
      body: buildRegisterBody(`Rate test ${attempt}`),
    });

    assert.equal(rateLimitedCandidate.status, 429);
  }

  const stats = await request('/admin/stats', {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.totalKeys, 4); // active: rotated nextcloud, youtube, zerobounce, plausible
}

try {
  await run();
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await fs.rm(dataDir, { recursive: true, force: true });
}
