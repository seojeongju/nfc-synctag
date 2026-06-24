type GoogleTokenClient = {
  requestAccessToken: () => void;
};

type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
  }) => GoogleTokenClient;
};

type GoogleAccounts = {
  oauth2: GoogleOAuth2;
};

type GoogleIdentity = {
  accounts: GoogleAccounts;
};

export type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_subtype?: string;
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export function isGoogleScriptReady(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts?.oauth2;
}

export function waitForGoogleScript(timeoutMs = 10000): Promise<boolean> {
  if (isGoogleScriptReady()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (isGoogleScriptReady()) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(poll, 100);
    };
    poll();
  });
}

export function requestGoogleAccessToken(
  clientId: string,
  onToken: (accessToken: string) => void,
  onDenied?: () => void
): void {
  const client = window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'openid email profile',
    callback: (tokenResponse) => {
      if (tokenResponse.error_subtype === 'access_denied') {
        onDenied?.();
        return;
      }
      if (tokenResponse.access_token) {
        onToken(tokenResponse.access_token);
      }
    }
  });
  client.requestAccessToken();
}
