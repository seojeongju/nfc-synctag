export const KAKAO_CALLBACK_PATH = '/login/kakao/callback';
const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';

export function getKakaoRedirectUri(): string {
  return `${window.location.origin}${KAKAO_CALLBACK_PATH}`;
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

/** Kakao JS SDK 없이 OAuth authorize URL로 이동 (REST API 키 = client_id) */
export function startKakaoLogin(restApiKey: string, options?: { next?: string }): void {
  const params = new URLSearchParams({
    client_id: restApiKey,
    redirect_uri: getKakaoRedirectUri(),
    response_type: 'code'
  });
  // scope 미지정: 앱에 설정된 필수 동의항목만 요청 (미설정 scope → KOE205)
  const state = encodeKakaoOAuthState(options?.next);
  if (state) params.set('state', state);
  window.location.assign(`${KAKAO_AUTHORIZE_URL}?${params.toString()}`);
}
