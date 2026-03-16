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
      INTERNAL_SERVER_TOKENS: `nextcloud:${nextcloudToken},ghost-cms:${ghostToken},youtube:${youtubeToken}`,
      TRUST_PROXY: '0',
    },
    stdio: 'inherit',
  }
);

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt++) {
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

  const secondRegister = await request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildRegisterBody('Second key'),
  });
  assert.equal(secondRegister.status, 201);

  const listBeforeRevoke = await request('/admin/keys', {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  assert.equal(listBeforeRevoke.status, 200);
  assert.equal(listBeforeRevoke.body.total, 3);
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
  assert.equal(listAfterRevoke.body.total, 2);
  assert.ok(listAfterRevoke.body.keys.some((entry) => entry.key_prefix === rotatedKeyMetadata.key_prefix));

  for (let attempt = 0; attempt < 3; attempt++) {
    const rateLimitedCandidate = await request('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${attempt}`,
      },
      body: buildRegisterBody(`Rate test ${attempt}`),
    });

    if (attempt < 2) {
      assert.equal(rateLimitedCandidate.status, 201);
    } else {
      assert.equal(rateLimitedCandidate.status, 429);
    }
  }

  const stats = await request('/admin/stats', {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.totalKeys, 4);
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
