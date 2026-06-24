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
const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.5/kakao.min.js';
const KAKAO_SDK_SELECTOR = 'script[data-wowtag-kakao-sdk]';

let kakaoScriptPromise: Promise<boolean> | null = null;

export function getKakaoRedirectUri(): string {
  return `${window.location.origin}${KAKAO_CALLBACK_PATH}`;
}

export function isKakaoScriptReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.Kakao &&
    typeof window.Kakao.init === 'function' &&
    !!window.Kakao.Auth
  );
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

/** index.html 정적 태그 대신 클릭·마운트 시 SDK를 동적으로 로드 */
export function loadKakaoScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (isKakaoScriptReady()) return Promise.resolve(true);
  if (kakaoScriptPromise) return kakaoScriptPromise;

  kakaoScriptPromise = new Promise((resolve) => {
    const finish = (ok: boolean) => {
      if (!ok) kakaoScriptPromise = null;
      resolve(ok);
    };

    const existing = document.querySelector(KAKAO_SDK_SELECTOR) as HTMLScriptElement | null;
    if (existing) {
      void waitForKakaoScript(15000).then(finish);
      return;
    }

    const script = document.createElement('script');
    script.src = KAKAO_SDK_URL;
    script.async = true;
    script.dataset.wowtagKakaoSdk = 'true';
    script.onload = () => {
      void waitForKakaoScript(5000).then(finish);
    };
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });

  return kakaoScriptPromise;
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
