export interface ConnectorField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'password';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface Connector {
  label: string;
  fields: ConnectorField[];
  servers: string[]; // which MCP server IDs can resolve these credentials
}

// Known service types and their credential schemas.
// Add new connectors here — the registration form renders dynamically from this.
export const CONNECTORS: Record<string, Connector> = {
  nextcloud: {
    label: 'Nextcloud',
    fields: [
      {
        key: 'nextcloud_host',
        label: 'Nextcloud Host URL',
        type: 'url',
        required: true,
        placeholder: 'https://cloud.example.com',
      },
      {
        key: 'nextcloud_username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'your-username',
      },
      {
        key: 'nextcloud_password',
        label: 'App Password',
        type: 'password',
        required: true,
        helpText: 'Generate an app password in Nextcloud → Settings → Security → Devices & sessions',
      },
    ],
    servers: ['nextcloud'],
  },
  'ghost-cms': {
    label: 'Ghost CMS',
    fields: [
      {
        key: 'ghost_url',
        label: 'Ghost Site URL',
        type: 'url',
        required: true,
        placeholder: 'https://your-ghost-site.com',
      },
      {
        key: 'ghost_admin_key',
        label: 'Admin API Key',
        type: 'password',
        required: true,
        helpText: 'Found in Ghost Admin → Settings → Integrations → Custom Integration',
      },
    ],
    servers: ['ghost-cms'],
  },
};

// Validate credentials against a connector's field schema
export function validateCredentials(
  connectorId: string,
  credentials: Record<string, unknown>
): { valid: boolean; error?: string } {
  const connector = CONNECTORS[connectorId];
  if (!connector) {
    return { valid: false, error: `Unknown connector: ${connectorId}` };
  }

  for (const field of connector.fields) {
    if (field.required && !credentials[field.key]) {
      return { valid: false, error: `Missing required field: ${field.label}` };
    }
    if (credentials[field.key] !== undefined && typeof credentials[field.key] !== 'string') {
      return { valid: false, error: `Field ${field.label} must be a string` };
    }
    if (field.type === 'url' && credentials[field.key]) {
      try {
        new URL(credentials[field.key] as string);
      } catch {
        return { valid: false, error: `Field ${field.label} must be a valid URL` };
      }
    }
  }

  return { valid: true };
}

// Check if a server_id is allowed to access a connector's credentials
export function isServerAllowed(connectorId: string, serverId: string): boolean {
  const connector = CONNECTORS[connectorId];
  if (!connector) return false;
  return connector.servers.includes(serverId);
}
