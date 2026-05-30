/** 소비자 세션 정책 헬퍼 */

export type ConsumerUser = { id: string; email?: string; name?: string };

export function isConsumerLoggedIn(user: unknown): user is ConsumerUser {
  return !!user && typeof user === 'object' && typeof (user as ConsumerUser).id === 'string';
}

/** 내 지갑·전자앨범 — 로그인 + 서버에 연결된 태그/골드바 */
export function canUseWalletFeatures(user: unknown): boolean {
  return isConsumerLoggedIn(user);
}

export function loginPathWithNext(next?: 'wallet' | 'home'): string {
  if (next === 'wallet') return '/login?next=wallet';
  return '/login';
}
