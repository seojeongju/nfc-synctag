/** NFC 태그 URL(`/t/:tagId`) 또는 태그 스캔 후 홈 안내로 진입한 브라우저 세션 */
export const TAG_SESSION_KEY = 'wowtag_nfc_tag_session';

/** 기기 신뢰(7일) — 태그 스캔 이력. 지갑 접근과 무관, 정품 확인 UX 보조 */
export const DEVICE_TRUST_KEY = 'wowtag_device_tag_trust_v1';
export const DEVICE_TRUST_MS = 7 * 24 * 60 * 60 * 1000;

type DeviceTrustPayload = { expiresAt: number; tagUids: string[] };

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

/** 탭 세션 또는 7일 이내 태그 스캔 이력 — 정품 안내·연결 유도용 (지갑 단독 게이트 아님) */
export function readTagProof(): boolean {
  return readTagSession() || readDeviceTagTrustActive();
}

function readDeviceTrust(): DeviceTrustPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEVICE_TRUST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceTrustPayload;
    if (typeof parsed.expiresAt !== 'number' || !Array.isArray(parsed.tagUids)) return null;
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(DEVICE_TRUST_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readDeviceTagTrustActive(): boolean {
  const t = readDeviceTrust();
  return t != null && t.tagUids.length > 0;
}

/** 태그 스캔 시 7일 기기 신뢰 갱신 */
export function extendDeviceTagTrust(tagUid: string): void {
  const uid = tagUid.trim();
  if (!uid) return;
  try {
    const now = Date.now();
    const prev = readDeviceTrust();
    const tagUids = new Set<string>(prev?.tagUids ?? []);
    tagUids.add(uid);
    const payload: DeviceTrustPayload = {
      expiresAt: now + DEVICE_TRUST_MS,
      tagUids: [...tagUids],
    };
    localStorage.setItem(DEVICE_TRUST_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** 마지막으로 스캔·링크로 진입한 태그 UID — 태그 연결 API용 */
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

/** @deprecated 로그인 지갑은 서버 사용. 태그 미연결 시 게스트 프리뷰만 sessionStorage */
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

/** 게스트: 태그 세션 중 현재 태그 프리뷰만 sessionStorage 복원 */
export function hydrateGuestTagPreviewFromStorage(): unknown[] {
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

export function persistGuestTagPreview(next: unknown[]): void {
  if (!readTagSession()) return;
  try {
    sessionStorage.setItem(WALLET_GOLDBARS_SS_KEY, JSON.stringify(next));
    localStorage.removeItem(LEGACY_WALLET_LS_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated use hydrateGuestTagPreviewFromStorage */
export function hydrateWalletGoldbarsFromStorage(): unknown[] {
  return hydrateGuestTagPreviewFromStorage();
}

/** @deprecated use persistGuestTagPreview */
export function persistWalletGoldbars(next: unknown[]): void {
  persistGuestTagPreview(next);
}
