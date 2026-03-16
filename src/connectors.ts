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
  'keywords-everywhere': {
    label: 'Keywords Everywhere',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'Get your API key from keywordseverywhere.com → API',
      },
    ],
    servers: ['keywords-everywhere'],
  },
  grabmaps: {
    label: 'GrabMaps',
    fields: [
      {
        key: 'grabMapsApiKey',
        label: 'GrabMaps API Key',
        type: 'password',
        required: true,
      },
      {
        key: 'awsAccessKeyId',
        label: 'AWS Access Key ID',
        type: 'text',
        required: true,
      },
      {
        key: 'awsSecretAccessKey',
        label: 'AWS Secret Access Key',
        type: 'password',
        required: true,
      },
      {
        key: 'awsRegion',
        label: 'AWS Region',
        type: 'text',
        required: true,
        placeholder: 'ap-southeast-1',
      },
    ],
    servers: ['grabmaps'],
  },
  github: {
    label: 'GitHub',
    fields: [
      {
        key: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        helpText: 'Generate at GitHub → Settings → Developer settings → Personal access tokens',
      },
    ],
    servers: ['github'],
  },
  'brave-search': {
    label: 'Brave Search',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'Get your API key from brave.com/search/api',
      },
    ],
    servers: ['brave-search'],
  },
  exa: {
    label: 'Exa.ai',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'Get your API key from exa.ai/dashboard',
      },
    ],
    servers: ['exa'],
  },
  perplexity: {
    label: 'Perplexity',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'Get your API key from perplexity.ai/settings/api',
      },
    ],
    servers: ['perplexity'],
  },
  reddit: {
    label: 'Reddit',
    fields: [
      {
        key: 'client_id',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'Create an app at reddit.com/prefs/apps',
      },
      {
        key: 'client_secret',
        label: 'Client Secret',
        type: 'password',
        required: true,
      },
    ],
    servers: ['reddit'],
  },
  openwebui: {
    label: 'Open WebUI',
    fields: [
      {
        key: 'url',
        label: 'Open WebUI URL',
        type: 'url',
        required: true,
        placeholder: 'https://chat.example.com',
      },
      {
        key: 'key',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'Found in Open WebUI → Settings → Account → API Keys',
      },
    ],
    servers: ['openwebui'],
  },
  datagovmy: {
    label: 'Malaysia Open Data',
    fields: [
      {
        key: 'googleMapsApiKey',
        label: 'Google Maps API Key',
        type: 'password',
        required: false,
        helpText: 'Optional — enables enhanced geolocation features',
      },
      {
        key: 'grabMapsApiKey',
        label: 'GrabMaps API Key',
        type: 'password',
        required: false,
      },
      {
        key: 'awsAccessKeyId',
        label: 'AWS Access Key ID',
        type: 'text',
        required: false,
      },
      {
        key: 'awsSecretAccessKey',
        label: 'AWS Secret Access Key',
        type: 'password',
        required: false,
      },
      {
        key: 'awsRegion',
        label: 'AWS Region',
        type: 'text',
        required: false,
        placeholder: 'ap-southeast-1',
      },
    ],
    servers: ['datagovmy'],
  },
  ltadatamallsg: {
    label: 'Singapore LTA DataMall',
    fields: [
      {
        key: 'apiKey',
        label: 'LTA DataMall API Key',
        type: 'password',
        required: false,
        helpText: 'Optional — request at datamall.lta.gov.sg',
      },
    ],
    servers: ['ltadatamallsg'],
  },
  youtube: {
    label: 'YouTube',
    fields: [
      {
        key: 'apiKey',
        label: 'YouTube API Key',
        type: 'password',
        required: true,
        helpText: 'Get your API key from Google Cloud Console → APIs & Services → Credentials',
      },
    ],
    servers: ['youtube'],
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
