/** 관리자 세션 — localStorage 토큰 + 만료(기본 12시간) */
const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_SESSION_META_KEY = 'wowtag_admin_session_meta';

const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

type AdminSessionMeta = { expiresAt: number };

function readMeta(): AdminSessionMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSessionMeta;
    if (typeof parsed.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSession(token: string): void {
  const expiresAt = Date.now() + ADMIN_SESSION_MS;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_SESSION_META_KEY, JSON.stringify({ expiresAt }));
}

export function clearAdminSession(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_SESSION_META_KEY);
}

/** 유효한 관리자 토큰이 있는지 (만료 시 자동 정리) */
export function isAdminSessionValid(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) return false;
  const meta = readMeta();
  if (!meta || meta.expiresAt <= Date.now()) {
    clearAdminSession();
    return false;
  }
  return true;
}
