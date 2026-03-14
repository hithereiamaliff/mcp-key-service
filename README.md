# MCP Key Service

Shared API key management service for [TechMavie MCP servers](https://techmavie.digital/modelcontextprotocol). Users subscribe through the portal, store their MCP server credentials securely, and receive a single `usr_...` API key per connection. MCP servers resolve these keys at runtime to retrieve decrypted credentials.

**Live portal:** [mcpkeys.techmavie.digital](https://mcpkeys.techmavie.digital)

## Architecture

The project has two components:

| Component | Stack | Port | Description |
|-----------|-------|------|-------------|
| **Backend** (`/src`) | Express + SQLite | 8090 | Credential storage, encryption, key resolution, admin API |
| **Portal** (`/portal`) | Next.js 15 | 3000 | User dashboard, Stripe billing, connection management |

Both run as Docker containers and communicate over an internal Docker network. The portal proxies requests to the backend for credential operations.

## Features

### Backend
- AES-256-GCM encryption for stored credentials
- SHA-256 hashing for API key lookup (raw keys never stored)
- SQLite storage with WAL mode
- Per-connector credential validation and dynamic field schemas
- Per-server internal auth via bearer tokens
- Admin endpoints for user management, key revocation, and usage stats
- Built-in IP rate limiting for public registration and rotation

### Portal
- Firebase Authentication (Google and GitHub sign-in)
- Google/GitHub account linking (link multiple sign-in methods)
- Stripe subscription billing with promotion code support
- Stripe billing portal for subscription management
- Dashboard with connection management (create, view, revoke)
- Admin panel for user and key management
- Dark/light theme support
- Preview mode for development without Firebase

### Deployment
- Docker Compose with multi-stage builds
- GitHub Actions CI/CD (auto-deploy on push to main)
- Health checks for both containers
- Localhost-only port binding (designed for reverse proxy)

## Supported Connectors

| Connector | Label | Required Credentials |
|-----------|-------|---------------------|
| `nextcloud` | Nextcloud | Host URL, Username, App Password |
| `ghost-cms` | Ghost CMS | Site URL, Admin API Key |
| `keywords-everywhere` | Keywords Everywhere | API Key |
| `grabmaps` | GrabMaps | GrabMaps API Key, AWS Access Key, Secret, Region |
| `github` | GitHub | Personal Access Token |
| `brave-search` | Brave Search | API Key |
| `exa` | Exa.ai | API Key |
| `perplexity` | Perplexity | API Key |
| `reddit` | Reddit | Client ID, Client Secret |
| `openwebui` | Open WebUI | URL, API Key |
| `datagovmy` | Malaysia Open Data | Google Maps Key, GrabMaps Key, AWS creds (all optional) |
| `ltadatamallsg` | Singapore LTA DataMall | API Key (optional) |

Connector definitions live in `src/connectors.ts`. The portal renders credential forms dynamically from these schemas.

## How It Works

```
User (Claude, etc.)
  │
  │  Connects with api_key in URL
  ▼
MCP Server (mcp.techmavie.digital/{server}/mcp?api_key=usr_...)
  │
  │  POST /internal/resolve  (Bearer: server-token)
  ▼
MCP Key Service → decrypts credentials → returns to MCP server
  │
  ▼
MCP Server uses credentials to call the actual service (Nextcloud, GitHub, etc.)
```

1. User signs in to the portal via Google or GitHub.
2. User subscribes via Stripe checkout.
3. User creates a connection by selecting a connector and entering credentials.
4. The backend encrypts the credentials and returns a `usr_...` API key.
5. User configures their MCP client URL: `https://mcp.techmavie.digital/{server}/mcp?api_key=usr_...`
6. When the MCP server receives a request, it calls `/internal/resolve` with its own bearer token.
7. The backend verifies the server's identity, decrypts credentials, and returns them.

For detailed integration instructions, see [docs/mcp-server-integration.md](docs/mcp-server-integration.md).

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ADMIN_API_KEY` | Bearer token for `/admin/*` endpoints. Generate with `openssl rand -hex 32` |
| `KEY_ENCRYPTION_SECRET` | 64 hex chars for AES-256-GCM. Generate with `openssl rand -hex 32` |
| `INTERNAL_SERVER_TOKENS` | Comma-separated `server_id:token` pairs (see below) |
| `FIREBASE_API_KEY` | Firebase client SDK — API key (used at portal build time) |
| `FIREBASE_AUTH_DOMAIN` | Firebase client SDK — Auth domain |
| `FIREBASE_PROJECT_ID` | Firebase client SDK — Project ID |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Admin SDK — Project ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Admin SDK — Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase Admin SDK — Service account private key |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Stripe price ID for the subscription product |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8090` | Backend port |
| `HOST` | `0.0.0.0` | Backend bind address |
| `DATA_DIR` | `./data` | SQLite database directory |
| `TRUST_PROXY` | `0` | Set to `1` when behind nginx/reverse proxy |
| `ADMIN_UIDS` | — | Comma-separated Firebase UIDs seeded as admins |

### Server Tokens Format

```
INTERNAL_SERVER_TOKENS=nextcloud:token1,ghost-cms:token2,github:token3,...
```

Supported server IDs: `nextcloud`, `ghost-cms`, `keywords-everywhere`, `grabmaps`, `github`, `brave-search`, `exa`, `perplexity`, `reddit`, `openwebui`, `datagovmy`, `ltadatamallsg`

Generate each token with `openssl rand -hex 32`.

## Local Development

```bash
cp .env.sample .env
# Fill in values (see above)
npm install
npm run dev
```

For the portal:

```bash
cd portal
cp .env.sample .env.local  # if exists, or create from root .env.sample
npm install
npm run dev
```

The portal runs on `http://localhost:3000` and the backend on `http://localhost:8090`.

**Preview mode:** If Firebase client config is not set, the portal runs in preview mode (development only) at `http://localhost:3000/dashboard?preview=1` with mock data.

## Scripts

- `npm run dev` — start backend with `tsx` (hot reload)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled backend
- `npm test` — build and run the smoke test suite

## Portal Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with Google/GitHub sign-in |
| `/dashboard` | Connection management, subscription status, linked accounts |
| `/admin` | Admin panel (users, keys, stats) — requires admin role |
| `/success` | Post-checkout success page |

## Portal API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/user/sync` | POST | Sync Firebase user to backend |
| `/api/connections` | GET | List user's connections |
| `/api/connections` | POST | Create a new connection |
| `/api/connections/[prefix]` | DELETE | Revoke a connection |
| `/api/rotate` | POST | Rotate an API key |
| `/api/connectors-info` | GET | List available connectors and their fields |
| `/api/stripe/create-checkout` | POST | Create Stripe checkout session |
| `/api/stripe/create-portal` | POST | Create Stripe billing portal session |
| `/api/stripe/webhook` | POST | Handle Stripe webhook events |
| `/api/admin/users` | GET | List all users (admin) |
| `/api/admin/keys` | GET | List all keys (admin) |
| `/api/admin/stats` | GET | Service statistics (admin) |
| `/api/claim` | POST | Claim a pre-existing key to a user account |

## Backend API

### Public

#### `GET /health`

Healthcheck endpoint for Docker and uptime monitors.

#### `GET /api/connectors`

Returns all available connector schemas (labels, fields, server IDs).

#### `POST /api/register`

Creates a new API key for a connector. Requires Firebase authentication.

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

#### `POST /api/rotate`

Rotates an existing `usr_...` key, revoking the old one.

### Internal

#### `POST /internal/resolve`

Called by MCP servers only. Each server authenticates with its own bearer token.

```http
Authorization: Bearer <server-specific-token>
```

```json
{ "key": "usr_..." }
```

Response:

```json
{
  "valid": true,
  "credentials": { "nextcloud_host": "...", "nextcloud_username": "...", "nextcloud_password": "..." },
  "label": "My Nextcloud",
  "connector_id": "nextcloud"
}
```

### Admin

All admin routes require `Authorization: Bearer <ADMIN_API_KEY>` or `x-admin-key: <ADMIN_API_KEY>`.

| Route | Method | Description |
|-------|--------|-------------|
| `GET /admin/keys` | GET | List active key metadata |
| `DELETE /admin/keys/:prefix` | DELETE | Revoke a key by exact prefix |
| `GET /admin/stats` | GET | Usage statistics |
| `GET /admin/users` | GET | List all users |
| `PUT /admin/users/:uid/subscription` | PUT | Update subscription status |
| `POST /admin/users/:uid/reactivate-keys` | POST | Reactivate suspended keys |
| `POST /admin/users/:uid/suspend-keys` | POST | Suspend user's keys |

## Stripe Integration

The portal uses Stripe for subscription billing:

- **Checkout:** Creates a subscription checkout session with promotion code support
- **Billing portal:** Allows users to manage their subscription, update payment method, cancel
- **Webhooks:** Handles `customer.subscription.created/updated/deleted` and `invoice.payment_failed/succeeded`
- **Price filtering:** Webhook events are filtered by `STRIPE_PRICE_ID` to prevent cross-talk with other Stripe products on the same account

## Docker Deployment

```bash
docker compose up -d --build
```

The compose file runs two containers:

- `mcp-key-service` (backend) — bound to `127.0.0.1:8090`
- `mcp-key-portal` (Next.js) — bound to `127.0.0.1:3001`

Both containers join an external `mcp-network` for inter-service communication.

**Important:** Firebase client config (`FIREBASE_API_KEY`, etc.) must be available at Docker **build time** for the portal. The compose file passes these as build args.

## CI/CD

GitHub Actions deploys automatically on push to `main`:

1. SSH into the VPS
2. Pull latest code
3. Rebuild containers with `docker compose build --no-cache`
4. Start containers and wait for health checks
5. Fail the deploy if either container doesn't pass health check within 30 seconds

Required GitHub secrets: `VPS_HOST`, `VPS_USERNAME`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

The `.env` file on the VPS is created manually once and persists across deploys.

## nginx

Example reverse proxy configuration:

```nginx
# Portal (mcpkeys.techmavie.digital)
server {
    server_name mcpkeys.techmavie.digital;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API (internal, or exposed under a subpath)
location /keys/ {
    rewrite ^/keys/(.*) /$1 break;
    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Block external access to internal endpoints
location /keys/internal/ {
    deny all;
    return 403;
}
```

Set `TRUST_PROXY=1` when running behind nginx.

## Data Storage

SQLite database path:

- Local: `./data/keys.db`
- Container: `/app/data/keys.db` (persisted via Docker volume `key-data`)

Stored records include:

- Hashed API key (SHA-256)
- Display prefix (`usr_XXXXXXXX...XXXX`)
- Connector ID and label
- Encrypted credentials (AES-256-GCM with per-record IV)
- User ownership (Firebase UID)
- Usage counters and timestamps
- Revocation state
- Audit log entries

Raw API keys are never stored after registration.

## Security Architecture

### Credential Storage

User credentials are never stored in plaintext. The service uses a **split-secret** design:

| Layer | What's Stored | Where |
|-------|--------------|-------|
| API key | SHA-256 hash only | SQLite `key_hash` column |
| Credentials | AES-256-GCM ciphertext | SQLite `credentials_encrypted` column |
| Encryption key | `KEY_ENCRYPTION_SECRET` | `.env` file on VPS (never in database) |
| IV + auth tag | Unique random 12-byte IV per record | SQLite `credentials_iv` and `credentials_tag` columns |

**To decrypt any credential, an attacker would need both:**
1. The SQLite database file (on the VPS filesystem / Docker volume)
2. The `KEY_ENCRYPTION_SECRET` from the `.env` file

Neither alone is useful — the encrypted data without the key is indecipherable, and the key without the database decrypts nothing.

### API Key Handling

- Raw API keys (`usr_...`) are generated once, shown to the user, and **never stored**
- Only the SHA-256 hash is kept for lookup during `/internal/resolve` calls
- Even with full database access, API keys cannot be reversed from their hashes

### Encryption Details

- **Algorithm:** AES-256-GCM (authenticated encryption — same standard used by banks and government systems)
- **Key size:** 256-bit (64 hex characters)
- **IV:** Unique random 12-byte IV generated per record (prevents pattern analysis across entries)
- **Auth tag:** GCM authentication tag stored per record (detects tampering)

### Network Security

- Docker ports bound to `127.0.0.1` only — backend and portal are not directly exposed to the internet
- nginx reverse proxy blocks external access to `/internal/` routes
- `/internal/resolve` requires per-server bearer tokens — each MCP server has its own token
- Connector access is enforced: a server can only resolve credentials for its allowed connectors
- `TRUST_PROXY` defaults to `0` to prevent spoofed client IPs

### Application Security

- Firebase Authentication required for all user-facing operations
- Stripe webhook events filtered by `STRIPE_PRICE_ID` to prevent cross-product interference
- Admin endpoints require a separate `ADMIN_API_KEY`
- Public registration and rotation endpoints are rate-limited per IP
- Admin key revocation uses exact-match only (no partial prefix matching)

### Operational Recommendations

If you're self-hosting this service:

- **SSH access:** Use key-based authentication only, disable password login
- **`.env` file permissions:** Restrict to owner-only (`chmod 600 .env`)
- **Firewall:** Only expose ports 80/443 (nginx) — all service ports should be localhost-only
- **Updates:** Keep Docker, Node.js, and OS packages updated for security patches
- **Backups:** Back up the Docker volume (`key-data`) and `.env` separately — both are needed to restore
- **Token rotation:** Generate strong random tokens (`openssl rand -hex 32`) for all secrets

## Verification

The smoke test in `scripts/smoke-test.mjs` verifies:

- Health endpoint
- Registration page wiring
- Register flow
- Internal resolve flow
- Rotate flow
- Old-key invalidation
- Exact-prefix revoke behavior
- Protection against spoofed internal caller identity
- Protection against rate-limit bypass when `TRUST_PROXY=0`
