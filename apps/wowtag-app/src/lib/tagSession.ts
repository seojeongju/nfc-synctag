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

/** 내 지갑 골드바 목록 — sessionStorage만 사용(태그 세션과 동일 수명). 예전 localStorage 키는 1회 마이그레이션 후 삭제 */
const WALLET_GOLDBARS_SS_KEY = 'wowtag_wallet_goldbars';
const LEGACY_WALLET_LS_KEY = 'my_scanned_goldbars';

export function clearWalletGoldbarsStorage(): void {
  try {
    sessionStorage.removeItem(WALLET_GOLDBARS_SS_KEY);
    localStorage.removeItem(LEGACY_WALLET_LS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * NFC 태그 세션이 없으면 지갑 저장소를 비우고 [] 반환.
 * 세션이 있으면 sessionStorage에서 복원(구버전 localStorage는 session으로 이전 후 제거).
 */
export function hydrateWalletGoldbarsFromStorage(): unknown[] {
  if (typeof window === 'undefined') return [];
  if (!readTagSession()) {
    clearWalletGoldbarsStorage();
    return [];
  }
  try {
    let raw = sessionStorage.getItem(WALLET_GOLDBARS_SS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_WALLET_LS_KEY);
      if (raw) {
        sessionStorage.setItem(WALLET_GOLDBARS_SS_KEY, raw);
        localStorage.removeItem(LEGACY_WALLET_LS_KEY);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistWalletGoldbars(next: unknown[]): void {
  if (!readTagSession()) return;
  try {
    sessionStorage.setItem(WALLET_GOLDBARS_SS_KEY, JSON.stringify(next));
    localStorage.removeItem(LEGACY_WALLET_LS_KEY);
  } catch {
    /* ignore */
  }
}
