const SYNTHETIC_KAKAO_EMAIL_SUFFIX = '@users.wowtag.local';

export function isSyntheticKakaoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(SYNTHETIC_KAKAO_EMAIL_SUFFIX);
}

/** 헤더 등 UI에 표시할 소비자 이름 (이메일 대신 닉네임 우선) */
export function getConsumerDisplayName(
  user: { name?: string; email?: string } | null,
  fallback = '회원'
): string {
  if (!user) return fallback;
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  if (name) return name;

  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email && !isSyntheticKakaoEmail(email)) return email;

  return fallback;
}
