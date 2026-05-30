/** 서버 지갑 API — 로그인 사용자 + 태그 연결 */

export type WalletItem = Record<string, unknown>;

export async function fetchUserWallet(userId: string): Promise<WalletItem[]> {
  const res = await fetch(`/api/user/wallet?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.items) ? data.items : [];
}

export async function linkTagToUserWallet(
  userId: string,
  tagUid: string
): Promise<{ ok: boolean; error?: string; items?: WalletItem[] }> {
  const res = await fetch('/api/user/wallet/link-tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, tagUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : '태그 연결에 실패했습니다.' };
  }
  return { ok: true, items: Array.isArray(data.items) ? data.items : undefined };
}
