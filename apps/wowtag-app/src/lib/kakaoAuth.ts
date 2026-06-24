type KakaoAuth = {
  authorize: (options: { redirectUri: string; scope?: string; state?: string }) => void;
};

type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Auth: KakaoAuth;
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

export const KAKAO_CALLBACK_PATH = '/login/kakao/callback';

export function getKakaoRedirectUri(): string {
  return `${window.location.origin}${KAKAO_CALLBACK_PATH}`;
}

export function isKakaoScriptReady(): boolean {
  return typeof window !== 'undefined' && !!window.Kakao?.Auth;
}

export function waitForKakaoScript(timeoutMs = 10000): Promise<boolean> {
  if (isKakaoScriptReady()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (isKakaoScriptReady()) {
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

export function encodeKakaoOAuthState(next?: string): string | undefined {
  if (!next) return undefined;
  return btoa(JSON.stringify({ next }));
}

export function parseKakaoOAuthState(state: string | null): { next?: string } {
  if (!state) return {};
  try {
    const parsed = JSON.parse(atob(state)) as { next?: string };
    return typeof parsed.next === 'string' ? { next: parsed.next } : {};
  } catch {
    return {};
  }
}

export function startKakaoLogin(jsKey: string, options?: { next?: string }): void {
  if (!window.Kakao) {
    throw new Error('Kakao SDK not loaded');
  }
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(jsKey);
  }

  window.Kakao.Auth.authorize({
    redirectUri: getKakaoRedirectUri(),
    scope: 'account_email profile_nickname',
    state: encodeKakaoOAuthState(options?.next)
  });
}
