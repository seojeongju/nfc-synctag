/** 제품 보증서 PDF에 채울 데이터 */

export const DEFAULT_GUARANTEE_ISSUER = '제이에로스';

export type GuaranteeCertificateData = {
  productName: string;
  /** 예: 3.75g / 1.00 돈 */
  weightLine: string;
  /** 예: 999.9% Fine Gold */
  purityLine: string;
  /** 관리 번호 */
  serialNo: string;
  /** 발행 일자 전체 문구 */
  issueDateLine: string;
  /** 제품 옵션 요약 (있을 때만) */
  optionsLine?: string;
  /** 발행처 */
  issuerName: string;
};

function parseGrams(weightRaw: unknown): number | null {
  const s = String(weightRaw ?? '').trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 전통 1돈 ≈ 3.75g (순금 표기 관행) */
function formatWeightDonLine(weightRaw: unknown): string {
  const g = parseGrams(weightRaw);
  const raw = String(weightRaw ?? '').trim();
  if (g == null) return raw ? `${raw} / — 돈` : '— / — 돈';
  const don = g / 3.75;
  const gLabel = raw || `${g}g`;
  return `${gLabel} / ${don.toFixed(2)} 돈`;
}

function formatPurityLine(material: unknown, purity: unknown): string {
  const m = String(material ?? '').trim();
  const p = String(purity ?? '').trim();
  if (p && m) return `${p} · ${m}`;
  if (p) return `${p} · 999.9% Fine Gold`;
  if (m) return `${m} · 999.9% Fine Gold`;
  return '999.9% Fine Gold';
}

function formatIssueDate(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function mapProductToGuaranteeData(p: Record<string, unknown>): GuaranteeCertificateData {
  const name = String(p.name ?? '제품').trim() || '제품';
  const serial =
    p.cert_serial_number != null && String(p.cert_serial_number).trim() !== ''
      ? String(p.cert_serial_number).trim()
      : '—';
  return {
    productName: name,
    weightLine: formatWeightDonLine(p.weight),
    purityLine: formatPurityLine(p.material, p.purity),
    serialNo: serial,
    issueDateLine: formatIssueDate(),
    optionsLine:
      p.options != null && String(p.options).trim() !== '' ? String(p.options).trim() : undefined,
    issuerName: DEFAULT_GUARANTEE_ISSUER,
  };
}

export function sanitizeGuaranteeFileBase(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 72) || '제품';
}
