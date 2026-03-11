# MCP Key Service

Shared API key management service for TechMavie MCP servers.

Users register once, receive a single `usr_...` API key, and use that key in MCP client URLs. The service stores connector credentials encrypted at rest and resolves them only for authorized internal MCP servers.

## Features

- AES-256-GCM encryption for stored credentials
- SHA-256 hashing for API key lookup
- SQLite storage with WAL mode
- Per-connector credential validation and dynamic registration form
- Per-server internal auth via bearer tokens
- Admin endpoints for listing, revoking, and inspecting usage
- Built-in IP rate limiting for public registration and rotation
- Docker-ready deployment with localhost-only port binding

## Supported Connectors

- `nextcloud`
- `ghost-cms`

Connector definitions live in `src/connectors.ts`.

## How It Works

1. A user opens `/keys/register` and submits credentials for a supported connector.
2. The service generates an API key, hashes it for lookup, encrypts the credential payload, and stores the record in SQLite.
3. The user configures an MCP client URL such as `https://mcp.techmavie.digital/nextcloud/mcp?api_key=usr_...`.
4. The MCP server calls `POST /internal/resolve` with its own bearer token.
5. The key service verifies which server is calling, checks whether that server may use the connector, decrypts the credentials, and returns them.

## Environment Variables

Required:

- `ADMIN_API_KEY`: bearer token for `/admin/*`
- `KEY_ENCRYPTION_SECRET`: 64 hex chars, generated with `openssl rand -hex 32`
- `INTERNAL_SERVER_TOKENS`: comma-separated `server_id:token` pairs, for example `nextcloud:<token>,ghost-cms:<token>`

Optional:

- `PORT`: defaults to `8090`
- `HOST`: defaults to `0.0.0.0`
- `DATA_DIR`: defaults to `./data`
- `TRUST_PROXY`: defaults to `0`; set this only when running behind nginx or another reverse proxy

See `.env.sample`.

## Local Development

```bash
cp .env.sample .env
```

Fill in:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Use the generated values for:

- `ADMIN_API_KEY`
- `KEY_ENCRYPTION_SECRET`
- the `nextcloud` token inside `INTERNAL_SERVER_TOKENS`
- the `ghost-cms` token inside `INTERNAL_SERVER_TOKENS`

Then run:

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev`: start with `tsx`
- `npm run build`: compile TypeScript to `dist/`
- `npm start`: run the compiled service
- `npm test`: build and run the smoke test suite

## Public API

### `GET /health`

Healthcheck endpoint for Docker and uptime checks.

### `GET /register`

Serves the registration form.

### `POST /api/register`

Creates a new API key for a connector.

Example request:

```json
{
  "label": "My Nextcloud",
  "connector_id": "nextcloud",
  "credentials": {
    "nextcloud_host": "https://cloud.example.com",
    "nextcloud_username": "user",
    "nextcloud_password": "app-password"
  }
}
```

Example response:

```json
{
  "api_key": "usr_...",
  "label": "My Nextcloud",
  "connector_id": "nextcloud",
  "created_at": "2026-03-11T10:00:00Z",
  "message": "Save this API key - it cannot be retrieved later.",
  "usage": {
    "url_example": "https://mcp.techmavie.digital/nextcloud/mcp?api_key=usr_...",
    "supported_servers": ["nextcloud"]
  }
}
```

### `POST /api/rotate`

Rotates an existing `usr_...` key and revokes the old one.

Example request:

```json
{
  "current_api_key": "usr_..."
}
```

## Internal API

### `POST /internal/resolve`

Called by MCP servers only.

Auth:

```http
Authorization: Bearer <server-specific-token>
```

Example request:

```json
{
  "key": "usr_..."
}
```

Optional:

- `server_id` may be sent for debugging or explicitness, but if present it must match the authenticated server token.

Example response:

```json
{
  "valid": true,
  "credentials": {
    "nextcloud_host": "https://cloud.example.com",
    "nextcloud_username": "user",
    "nextcloud_password": "app-password"
  },
  "label": "My Nextcloud",
  "connector_id": "nextcloud"
}
```

Important:

- There is no shared internal secret anymore.
- Each MCP server must use its own token from `INTERNAL_SERVER_TOKENS`.
- Connector access is enforced against the authenticated caller, not a user-controlled request field.

## Admin API

All admin routes require:

```http
Authorization: Bearer <ADMIN_API_KEY>
```

Or:

```http
x-admin-key: <ADMIN_API_KEY>
```

### `GET /admin/keys`

Returns active key metadata only.

### `DELETE /admin/keys/:prefix`

Revokes one key by exact display prefix, for example:

```text
usr_a1b2c3d4...e5f6
```

The prefix must match exactly. Partial prefix matching is intentionally not supported.

### `GET /admin/stats`

Returns totals for active keys, revoked keys, validations, and counts by connector.

## MCP Server Integration

Each MCP server should have its own internal token.

Example:

```ts
async function resolveApiKey(apiKey: string) {
  if (!apiKey.startsWith('usr_')) {
    return { valid: false };
  }

  const response = await fetch('http://127.0.0.1:8090/internal/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.KEY_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({ key: apiKey }),
  });

  const data = await response.json();
  if (!response.ok || !data.valid) {
    return { valid: false };
  }

  return {
    valid: true,
    connectorId: data.connector_id,
    credentials: data.credentials,
  };
}
```

Recommended MCP server env vars:

- `KEY_SERVICE_URL=http://127.0.0.1:8090`
- `KEY_SERVICE_TOKEN=<server-specific-token>`

## Docker

Build and run:

```bash
docker-compose up -d --build
```

The compose file binds the service to `127.0.0.1:8090` only. See `docker-compose.yml`.

## nginx

Example configuration:

```nginx
location /keys/ {
    rewrite ^/keys/(.*) /$1 break;
    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /keys/internal/ {
    deny all;
    return 403;
}
```

If nginx is in front of the service, set:

```env
TRUST_PROXY=1
```

If requests reach the service directly, leave `TRUST_PROXY=0`.

## Data Storage

SQLite database path:

- default local path: `./data/keys.db`
- container path: `/app/data/keys.db`

Stored records include:

- hashed API key
- display prefix
- connector ID
- encrypted credentials
- usage counters
- revocation state
- audit log entries

Raw API keys are never stored after registration.

## Security Notes

- Credentials are encrypted with AES-256-GCM using a random IV per record.
- API keys are hashed with SHA-256 before storage.
- Internal access is scoped to authenticated MCP servers.
- Admin revocation is exact-match only.
- Public registration and rotation are rate-limited.
- `trust proxy` is off by default to avoid spoofed client IPs.

## Verification

The smoke test in `scripts/smoke-test.mjs` verifies:

- health endpoint
- registration page wiring
- register flow
- internal resolve flow
- rotate flow
- old-key invalidation
- exact-prefix revoke behavior
- protection against spoofed internal caller identity
- protection against rate-limit bypass when `TRUST_PROXY=0`
