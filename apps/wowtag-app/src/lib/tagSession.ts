/** NFC 태그 URL(`/t/:tagId`) 또는 태그 스캔 후 홈 안내로 진입한 브라우저 세션만 표시 */
export const TAG_SESSION_KEY = 'wowtag_nfc_tag_session';

export function readTagSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(TAG_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTagSessionActive(): void {
  try {
    sessionStorage.setItem(TAG_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 마지막으로 스캔·링크로 진입한 태그 UID — 내 지갑 자동 매칭용 */
export const WALLET_TAG_UID_KEY = 'wowtag_wallet_tag_uid';

export function rememberWalletTagUid(tagUid: string): void {
  try {
    sessionStorage.setItem(WALLET_TAG_UID_KEY, tagUid);
  } catch {
    /* ignore */
  }
}

export function readWalletTagUid(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(WALLET_TAG_UID_KEY);
  } catch {
    return null;
  }
}
