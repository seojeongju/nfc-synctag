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

/** 내 지갑 등록 골드바(인증서 연결) — 카탈로그 제품과 동일 스타일 보증서 미리보기/PDF 생성용 */
export function mapGoldbarWalletToGuaranteeData(g: Record<string, unknown>): GuaranteeCertificateData {
  const name =
    String(g.display_name ?? g.serial_number ?? '골드바').trim() || '골드바';
  const serial = String(g.serial_number ?? '—').trim() || '—';
  return {
    productName: name,
    weightLine: formatWeightDonLine(g.weight),
    purityLine: formatPurityLine(g.material, g.purity),
    serialNo: serial,
    issueDateLine: formatIssueDate(),
    issuerName: DEFAULT_GUARANTEE_ISSUER,
  };
}

/** 카탈로그 매칭 지갑 행(API `wallet_source: catalog_product`) → mapProductToGuaranteeData 입력 */
export function catalogWalletRowToProductRecord(g: Record<string, unknown>): Record<string, unknown> {
  const pid = g.product_id;
  const fallbackSerial =
    pid != null && String(pid).trim() !== '' ? `P-${String(pid)}` : undefined;
  return {
    name: g.name ?? g.serial_number ?? '제품',
    description: g.description ?? '',
    weight: g.weight,
    material: g.material,
    purity: g.purity,
    options: g.options,
    image_url: g.image_url,
    cert_serial_number:
      g.cert_serial_number != null && String(g.cert_serial_number).trim() !== ''
        ? g.cert_serial_number
        : fallbackSerial,
  };
}

export function sanitizeGuaranteeFileBase(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 72) || '제품';
}
