import { randomBytes } from 'node:crypto';

export type OAuthProvider = 'github';

interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string;
  clientSecret: () => string;
  redirectUri: () => string;
}

const PROVIDERS: Record<OAuthProvider, OAuthConfig> = {
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'repo read:user',
    clientId: () => {
      const v = process.env['GITHUB_CLIENT_ID'];
      if (!v) throw new Error('GITHUB_CLIENT_ID is required');
      return v;
    },
    clientSecret: () => {
      const v = process.env['GITHUB_CLIENT_SECRET'];
      if (!v) throw new Error('GITHUB_CLIENT_SECRET is required');
      return v;
    },
    redirectUri: () => {
      const v = process.env['GITHUB_REDIRECT_URI'];
      if (!v) throw new Error('GITHUB_REDIRECT_URI is required');
      return v;
    },
  },
};

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

export function buildAuthUrl(provider: OAuthProvider, state: string): string {
  const config = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: config.clientId(),
    redirect_uri: config.redirectUri(),
    scope: config.scope,
    state,
  });
  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string,
): Promise<{ accessToken: string; scope: string }> {
  const config = PROVIDERS[provider];
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId(),
      client_secret: config.clientSecret(),
      code,
      redirect_uri: config.redirectUri(),
    }),
  });

  if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  if (data['error']) throw new Error(`OAuth error: ${data['error_description'] ?? data['error']}`);

  return {
    accessToken: data['access_token'] as string,
    scope: (data['scope'] as string) ?? '',
  };
}
