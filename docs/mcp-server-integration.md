# MCP Server Integration Guide

This guide explains how to integrate any MCP server with the MCP Key Service for credential management. It covers the credential resolution flow, common issues (like empty responses), and troubleshooting steps.

## Architecture Overview

The MCP Key Service is **not a proxy** — it's a credential resolution service. The flow works like this:

```
User (Claude, etc.)
  │
  │  Connects to MCP server with api_key in URL
  ▼
MCP Server (mcp.techmavie.digital/{server-name}/mcp?api_key=usr_...)
  │
  │  POST /internal/resolve  (Bearer: server-token)
  │  Body: { "key": "usr_..." }
  ▼
MCP Key Service (mcpkeys.techmavie.digital)
  │
  │  Returns: { valid: true, credentials: { ... } }
  ▼
MCP Server uses credentials to call the actual service
  │
  │  e.g., Nextcloud API, GitHub API, etc.
  ▼
Returns results to the user
```

## How Credential Resolution Works

1. **User creates a connection** in the portal, providing credentials for a specific connector (e.g., Nextcloud host, username, app password).
2. **Credentials are encrypted** (AES-256-GCM) and stored. The user receives an API key (`usr_...`).
3. **User configures their MCP client** with the URL:
   ```
   https://mcp.techmavie.digital/{server-name}/mcp?api_key=usr_XXXXXXXX...
   ```
4. **MCP server extracts the `api_key`** from the request and calls the key service:
   ```
   POST https://mcpkeys.techmavie.digital/internal/resolve
   Authorization: Bearer {INTERNAL_SERVER_TOKEN}
   Content-Type: application/json

   { "key": "usr_XXXXXXXX..." }
   ```
5. **Key service responds** with decrypted credentials:
   ```json
   {
     "valid": true,
     "credentials": {
       "nextcloud_host": "https://cloud.example.com",
       "nextcloud_username": "user",
       "nextcloud_password": "app-password-here"
     },
     "label": "My Nextcloud",
     "connector_id": "nextcloud"
   }
   ```
6. **MCP server uses the credentials** to make API calls to the actual service.

## Integrating a New MCP Server

### Step 1: Add a Connector Definition

In `src/connectors.ts`, add your connector with the credential fields your MCP server needs:

```typescript
'my-service': {
  label: 'My Service',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'Enter your API key',
      helpText: 'Get your API key from https://my-service.com/settings',
    },
  ],
  servers: ['my-service'],  // Must match the server ID in INTERNAL_SERVER_TOKENS
},
```

**Field types:** `text`, `password`, `url`
- `url` fields are validated for proper URL format
- `password` fields are masked in the portal UI
- `required: false` makes a field optional

### Step 2: Add a Server Token

On the VPS, add your server's token to `INTERNAL_SERVER_TOKENS` in `.env`:

```
INTERNAL_SERVER_TOKENS=nextcloud:token1,ghost-cms:token2,my-service:my-secret-token
```

The server ID (`my-service`) must match what's in the connector's `servers` array.

### Step 3: Implement Credential Resolution in Your MCP Server

Your MCP server needs to:

1. **Extract the `api_key`** from the incoming request URL (query parameter).
2. **Call `/internal/resolve`** to get decrypted credentials.
3. **Use the returned credentials** to authenticate with the downstream service.

#### Example Implementation (TypeScript)

```typescript
const KEY_SERVICE_URL = process.env.KEY_SERVICE_URL || 'https://mcpkeys.techmavie.digital';
const SERVER_TOKEN = process.env.KEY_SERVICE_TOKEN; // Your server's internal token

async function resolveCredentials(apiKey: string): Promise<Record<string, string> | null> {
  const res = await fetch(`${KEY_SERVICE_URL}/internal/resolve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: apiKey }),
  });

  if (!res.ok) {
    console.error(`Credential resolution failed: ${res.status}`);
    return null;
  }

  const data = await res.json();
  if (!data.valid) {
    console.error('Invalid or revoked API key');
    return null;
  }

  return data.credentials;
}
```

#### Example: Using Resolved Credentials

```typescript
// In your MCP server's request handler:
const apiKey = url.searchParams.get('api_key');
if (!apiKey) {
  return { error: 'Missing api_key parameter' };
}

const credentials = await resolveCredentials(apiKey);
if (!credentials) {
  return { error: 'Invalid credentials' };
}

// Now use credentials to call the actual service
// e.g., for Nextcloud:
const response = await fetch(`${credentials.nextcloud_host}/ocs/v2.php/...`, {
  headers: {
    'Authorization': `Basic ${btoa(credentials.nextcloud_username + ':' + credentials.nextcloud_password)}`,
  },
});
```

## Troubleshooting: Empty Results

If your MCP server returns empty arrays or no data despite a successful connection, work through these checks:

### 1. Verify the API Key is Being Passed

The most common issue is the `api_key` not reaching your MCP server or not being forwarded to `/internal/resolve`.

**Check:** Add logging to confirm the API key is extracted from the URL:
```typescript
console.log('Received api_key:', apiKey ? `${apiKey.substring(0, 12)}...` : 'MISSING');
```

### 2. Verify Credential Resolution Succeeds

**Check:** Log the response from `/internal/resolve` (without logging actual credential values):
```typescript
const data = await res.json();
console.log('Resolve response:', {
  valid: data.valid,
  connector_id: data.connector_id,
  credentialKeys: data.credentials ? Object.keys(data.credentials) : [],
});
```

**Expected output:**
```
Resolve response: { valid: true, connector_id: 'nextcloud', credentialKeys: ['nextcloud_host', 'nextcloud_username', 'nextcloud_password'] }
```

If `valid` is `false` or credentials are missing, check:
- The API key hasn't been revoked
- The user's subscription is active
- The server token matches `INTERNAL_SERVER_TOKENS`

### 3. Verify Credentials Are Correct

The key service stores whatever the user entered. If the user provided wrong credentials, the resolution will succeed but the downstream API calls will fail.

**Check:** Test the credentials manually (e.g., curl the downstream API with the same credentials).

### 4. Verify Your Server Uses Credentials (Not Hardcoded/Env Values)

A common bug: the MCP server resolves credentials but then uses hardcoded values or environment variables instead of the resolved credentials.

**Check:** Make sure every downstream API call uses values from `data.credentials`, not from `process.env` or config files.

```typescript
// WRONG — uses env var instead of resolved credentials
const host = process.env.NEXTCLOUD_HOST;

// CORRECT — uses resolved credentials
const host = credentials.nextcloud_host;
```

### 5. Verify the Credential Field Keys Match

The field `key` values in `src/connectors.ts` must match what your MCP server expects.

For example, if the connector defines:
```typescript
fields: [
  { key: 'nextcloud_host', ... },
  { key: 'nextcloud_username', ... },
  { key: 'nextcloud_password', ... },
]
```

Then `data.credentials` will contain `nextcloud_host`, `nextcloud_username`, and `nextcloud_password`. Your MCP server must reference these exact keys.

### 6. Verify the Server ID Authorization

Each connector specifies which server IDs can access its credentials via the `servers` array. If your server ID doesn't match, `/internal/resolve` will reject the request.

**Check:** Ensure the server ID in `INTERNAL_SERVER_TOKENS` matches the `servers` array in the connector definition.

### 7. Check for Caching Issues

If your MCP server caches credentials or API responses, stale data could cause empty results after a credential update.

**Fix:** Clear caches when credentials are resolved, or avoid caching credentials altogether.

## `/internal/resolve` API Reference

### Request

```
POST /internal/resolve
Authorization: Bearer {server-token}
Content-Type: application/json

{
  "key": "usr_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "server_id": "optional-server-id"    // Optional: for multi-server connectors
}
```

### Success Response (200)

```json
{
  "valid": true,
  "credentials": {
    "field_key_1": "value1",
    "field_key_2": "value2"
  },
  "label": "User's connection label",
  "connector_id": "connector-id"
}
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid server token |
| 403 | Server not authorized for this connector |
| 404 | API key not found or revoked |
| 400 | Missing `key` in request body |

## Environment Variables (MCP Server Side)

| Variable | Description |
|----------|-------------|
| `KEY_SERVICE_URL` | URL of the MCP Key Service (e.g., `https://mcpkeys.techmavie.digital`) |
| `KEY_SERVICE_TOKEN` | Your server's internal token (must match `INTERNAL_SERVER_TOKENS` on the key service) |

## Connector Examples

### Single API Key (e.g., Brave Search, Exa, Perplexity)

```typescript
'brave-search': {
  label: 'Brave Search',
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'BSA...' },
  ],
  servers: ['brave-search'],
},
```

### Username + Password (e.g., Nextcloud)

```typescript
'nextcloud': {
  label: 'Nextcloud',
  fields: [
    { key: 'nextcloud_host', label: 'Host URL', type: 'url', required: true, placeholder: 'https://cloud.example.com' },
    { key: 'nextcloud_username', label: 'Username', type: 'text', required: true },
    { key: 'nextcloud_password', label: 'App Password', type: 'password', required: true },
  ],
  servers: ['nextcloud'],
},
```

### Multiple Credentials (e.g., GrabMaps)

```typescript
'grabmaps': {
  label: 'GrabMaps',
  fields: [
    { key: 'grabMapsApiKey', label: 'GrabMaps API Key', type: 'password', required: true },
    { key: 'awsAccessKeyId', label: 'AWS Access Key ID', type: 'text', required: true },
    { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', type: 'password', required: true },
    { key: 'awsRegion', label: 'AWS Region', type: 'text', required: true, placeholder: 'ap-southeast-1' },
  ],
  servers: ['grabmaps'],
},
```

### All-Optional Fields (e.g., DataGovMY)

```typescript
'datagovmy': {
  label: 'Malaysia Open Data',
  fields: [
    { key: 'googleMapsApiKey', label: 'Google Maps API Key', type: 'password', required: false },
    { key: 'grabMapsApiKey', label: 'GrabMaps API Key', type: 'password', required: false },
  ],
  servers: ['datagovmy'],
},
```

For connectors with all-optional fields, the server works without credentials but gains enhanced features when they're provided.
