// Server-side helper: proxy requests from portal API routes to the Express backend.
// All calls use the admin API key — the portal verifies the Firebase user first.

const KEY_SERVICE_URL = process.env.KEY_SERVICE_URL || 'http://mcp-key-service:8090';
const KEY_SERVICE_ADMIN_KEY = process.env.KEY_SERVICE_ADMIN_KEY || '';

export async function backendFetch(path: string, options: RequestInit = {}) {
  const url = `${KEY_SERVICE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY_SERVICE_ADMIN_KEY}`,
      ...options.headers,
    },
  });
  return res;
}

// Convenience wrappers
export async function backendGet(path: string) {
  return backendFetch(path, { method: 'GET' });
}

export async function backendPost(path: string, body: unknown) {
  return backendFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function backendPut(path: string, body: unknown) {
  return backendFetch(path, { method: 'PUT', body: JSON.stringify(body) });
}

export async function backendDelete(path: string) {
  return backendFetch(path, { method: 'DELETE' });
}
