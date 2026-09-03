export type GuaranteeIssuerProfile = {
  issuerName: string;
  issuerPlace: string;
  contact: string;
  stampUrl: string;
};

export const DEFAULT_GUARANTEE_ISSUER_PROFILE: GuaranteeIssuerProfile = {
  issuerName: '제이에로스',
  issuerPlace: '',
  contact: '',
  stampUrl: '',
};

let issuerCache: GuaranteeIssuerProfile | null = null;
let issuerPromise: Promise<GuaranteeIssuerProfile> | null = null;

export function invalidateGuaranteeIssuerCache() {
  issuerCache = null;
  issuerPromise = null;
}

export function normalizeGuaranteeIssuer(raw: unknown): GuaranteeIssuerProfile {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    issuerName: str(o.issuerName) || DEFAULT_GUARANTEE_ISSUER_PROFILE.issuerName,
    issuerPlace: str(o.issuerPlace),
    contact: str(o.contact),
    stampUrl: str(o.stampUrl),
  };
}

export async function loadGuaranteeIssuer(): Promise<GuaranteeIssuerProfile> {
  if (issuerCache) return issuerCache;
  if (!issuerPromise) {
    issuerPromise = (async () => {
      try {
        const res = await fetch('/api/guarantee/issuer');
        if (!res.ok) return DEFAULT_GUARANTEE_ISSUER_PROFILE;
        const data = await res.json();
        issuerCache = normalizeGuaranteeIssuer(data);
        return issuerCache;
      } catch {
        return DEFAULT_GUARANTEE_ISSUER_PROFILE;
      }
    })();
  }
  return issuerPromise;
}
