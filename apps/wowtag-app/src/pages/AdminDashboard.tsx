import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Tag, Package, Plus, Bell, Loader2, X, Smartphone, PenTool, Hash, Link as LinkIcon, Link2Off, Award, FileText, Calendar, Search, Filter, Edit3, Trash2, LogOut, Eye, ChevronDown, ChevronUp, RefreshCw, Download, Box, User, Activity, ScanLine, Bookmark, CheckCircle2 } from 'lucide-react';
import { ImeTextInput } from '../components/ImeTextInput';
import { GuaranteePdfHost } from '../components/ProductGuaranteeCertificate';
import { GuaranteeCertificatePreviewModal } from '../components/GuaranteeCertificatePreviewModal';
import { mapProductToGuaranteeData } from '../lib/guaranteeCertificateData';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';

const ADMIN_TAB_IDS = ['dashboard', 'products', 'nfc', 'goldbars', 'assetMarket', 'releaseRequests'] as const;
type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

/** NFC 탭 내부: 제품 매칭 / UID 등록 / 목록 조회 */
type NfcWorkbenchTab = 'match' | 'register' | 'browse';

type NfcUrlWriteStatus = 'idle' | 'writing' | 'done' | 'error';
type NfcWriteContext = 'match' | 'register' | 'modal';

const NFC_WRITE_TIMEOUT_MS = 45_000;

function buildTagLandingUrl(tagUid: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
  return `${base}/t/${encodeURIComponent(tagUid.trim())}`;
}

/** 삼성 등 기본 NFC 앱에서 「비어있는 태그」가 되지 않도록 URL + 텍스트 레코드 기록 */
async function writeNdefLandingUrl(ndef: { write: (message: unknown, options?: unknown) => Promise<void> }, tagUid: string) {
  const url = buildTagLandingUrl(tagUid);
  const records = [
    { recordType: 'url', data: url },
    { recordType: 'text', data: `Gold SyncTag\n${url}`, lang: 'en' },
  ];
  try {
    await ndef.write({ records }, { overwrite: true });
  } catch {
    await ndef.write({ records });
  }
}

type NfcMatchSnapshot =
  | { kind: 'new' }
  | { kind: 'asset' }
  | { kind: 'linked'; productName?: string | null; productId?: string }
  | { kind: 'blocked'; message: string };

/** 제품 폼: 등록가·중량 기준 g당 환산 (표시용) */
function formatProductGoldSummary(weight: string, price: string) {
  const w = parseFloat(String(weight ?? '').replace(/[^0-9.]/g, ''));
  const pr = parseFloat(String(price ?? '').replace(/[^0-9.]/g, ''));
  const totalStr =
    pr > 0 && Number.isFinite(pr) ? `${Math.round(pr).toLocaleString('ko-KR')}원` : '0원';
  const perG =
    w > 0 && pr > 0 && Number.isFinite(w) && Number.isFinite(pr)
      ? `${Math.round(pr / w).toLocaleString('ko-KR')}원`
      : '0원';
  return { totalStr, perG };
}

/** 골드바 카탈로그 일련번호 자동 생성 (GB + 연도 + 랜덤 6자리 16진) */
function generateGoldbarSerialNumber(): string {
  const y = new Date().getFullYear();
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `GB${y}-${hex}`;
}

type CertCatalogRow = {
  id: number;
  tag_uid: string;
  serial_number: string;
  display_name?: string | null;
};

function isPendingCertTagUid(uid: string) {
  return uid.startsWith('__PENDING_GB_') && uid.endsWith('__');
}

/** DB placeholder(`__PENDING_GB_*`)는 화면에 기술 문자열로 노출하지 않음 */
function formatCertTagForUi(uid: string) {
  return isPendingCertTagUid(uid) ? 'NFC 태그 미등록' : uid;
}

/** NFC UID 표기(콜론·대소문자) 차이 무시 비교 */
function normalizeNfcUidKey(uid: string) {
  return uid.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

function nfcUidsMatch(a: string, b: string) {
  if (a.trim() === b.trim()) return true;
  const ka = normalizeNfcUidKey(a);
  const kb = normalizeNfcUidKey(b);
  return ka.length >= 8 && ka === kb;
}

/** 모달·overflow 안에서 네이티브 select 옵션이 잘리는 문제 → viewport 고정 + 스크롤 목록 */
function ProductCertificatePicker({
  value,
  onChange,
  options,
  buttonId,
  searchQuery,
  onSearchQueryChange,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  options: CertCatalogRow[];
  buttonId: string;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  const measure = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const cap = Math.min(vh * 0.55, 360);
    let top = r.bottom + 4;
    let maxH = Math.min(cap, spaceBelow - 4);
    if (maxH < 160 && spaceAbove > spaceBelow) {
      maxH = Math.min(cap, spaceAbove - 4);
      top = Math.max(margin, r.top - maxH - 4);
    } else {
      maxH = Math.min(cap, spaceBelow - 4);
    }
    maxH = Math.max(140, maxH);
    const width = Math.min(Math.max(r.width, 200), vw - 2 * margin);
    const left = Math.max(margin, Math.min(r.left, vw - width - margin));
    setPanel({ top, left, width, maxH });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanel(null);
      return;
    }
    measure();
    const onScrollResize = () => measure();
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const selected = options.find((c) => c.id === value);
  const label =
    value === ''
      ? '연결 안 함'
      : selected
        ? `${selected.serial_number}${selected.display_name ? ` · ${selected.display_name}` : ''} · ${formatCertTagForUi(selected.tag_uid)}`
        : '선택됨';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={buttonId}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full h-12 bg-white rounded-xl px-3 font-bold border border-amber-100 text-left flex items-center justify-between gap-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-200/80"
      >
        <span className="truncate min-w-0">{label}</span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-amber-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        panel &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[280] touch-none" aria-hidden onClick={() => setOpen(false)} />
            <div
              role="listbox"
              aria-labelledby={buttonId}
              className="fixed z-[290] overflow-y-auto overscroll-y-contain rounded-xl border border-amber-200 bg-white py-1 shadow-2xl [scrollbar-width:thin]"
              style={{
                top: panel.top,
                left: panel.left,
                width: panel.width,
                maxHeight: panel.maxH,
              }}
            >
              <div className="sticky top-0 z-10 border-b border-amber-100 bg-white px-2 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-amber-600/70" aria-hidden />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                    placeholder="일련번호 · 보증서명 · NFC UID"
                    className="w-full rounded-lg border border-amber-100 bg-amber-50/40 py-2 pl-9 pr-2 text-xs font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:border-amber-200 focus:bg-white"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-sm font-bold hover:bg-amber-50 ${
                  value === '' ? 'bg-amber-50 text-amber-900' : 'text-slate-800'
                }`}
              >
                연결 안 함
              </button>
              {options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={value === c.id}
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm font-bold hover:bg-amber-50 border-t border-slate-100 ${
                    value === c.id ? 'bg-amber-50 text-amber-900' : 'text-slate-800'
                  }`}
                >
                  <span className="block font-sans leading-snug">
                    {c.serial_number}
                    {c.display_name ? (
                      <span className="font-bold text-slate-600"> · {c.display_name}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] font-bold break-all text-slate-500">
                    {formatCertTagForUi(c.tag_uid)}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

type NfcUidScanAccent = 'emerald' | 'amber';

/** NFC 워크벤치 1단계: 스캔 CTA를 강조하고 직접 입력은 보조로 배치 */
function NfcUidScanStep({
  stepNumber,
  stepTitle,
  tagUid,
  onTagUidChange,
  onScan,
  scanning,
  accent,
  placeholder = '04:51:4b:fa:c1:1c:91',
  onClear,
  scanLabel = 'NFC 태그 스캔 시작',
  scanSubLabel = '태그를 스마트폰 뒷면에 대면 UID가 자동으로 입력됩니다',
}: {
  stepNumber: number;
  stepTitle: string;
  tagUid: string;
  onTagUidChange: (value: string) => void;
  onScan: () => void;
  scanning: boolean;
  accent: NfcUidScanAccent;
  placeholder?: string;
  onClear?: () => void;
  scanLabel?: string;
  scanSubLabel?: string;
}) {
  const scanGradient =
    accent === 'emerald'
      ? 'from-emerald-600 via-emerald-500 to-teal-600 shadow-emerald-500/35 ring-emerald-400/40'
      : 'from-amber-500 via-amber-500 to-orange-500 shadow-amber-500/35 ring-amber-400/40';
  const stepChip = accent === 'emerald' ? 'bg-emerald-600' : 'bg-amber-500';
  const inputFocus = accent === 'emerald' ? 'focus:border-emerald-500' : 'focus:border-amber-400';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 w-7 h-7 rounded-lg ${stepChip} text-white text-xs font-black flex items-center justify-center shadow-sm`}
          >
            {stepNumber}
          </span>
          <label className="text-xs sm:text-sm font-black text-slate-800 leading-snug">{stepTitle}</label>
        </div>
        {onClear && tagUid.trim() ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-black text-slate-500 hover:text-rose-600 flex items-center gap-1 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            초기화
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onScan}
        disabled={scanning}
        className={`w-full rounded-2xl bg-gradient-to-r ${scanGradient} text-white p-4 sm:p-5 shadow-lg ring-2 ring-offset-2 ring-offset-white transition-all active:scale-[0.99] disabled:opacity-95`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/35">
            {scanning ? (
              <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin" aria-hidden />
            ) : (
              <ScanLine className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={2.25} aria-hidden />
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm sm:text-base font-black leading-tight">
              {scanning ? '태그를 기기에 대 주세요…' : scanLabel}
            </p>
            <p className="text-[10px] sm:text-[11px] font-bold text-white/90 mt-1 leading-snug">
              {scanning ? '스캔이 끝나면 아래 UID 칸에 자동 입력됩니다' : scanSubLabel}
            </p>
          </div>
          {!scanning ? <Smartphone className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 opacity-90" /> : null}
        </div>
      </button>

      {scanning ? (
        <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          NFC 스캔 대기 중 — 태그를 떼지 마세요.
        </p>
      ) : null}

      <div className="flex items-center gap-3 py-0.5">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">또는 UID 직접 입력</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <input
        type="text"
        value={tagUid}
        onChange={(e) => onTagUidChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm font-bold outline-none focus:bg-white ${inputFocus}`}
      />
    </div>
  );
}

/** 워크벤치 3단계: URL 굽기 상태 표시 및 건너뛰기 */
function NfcUrlWritePanel({
  accent,
  status,
  uidReady,
  onWrite,
  onSkip,
  optionalLabel = true,
  showSkip = false,
}: {
  accent: NfcUidScanAccent;
  status: NfcUrlWriteStatus;
  uidReady: boolean;
  onWrite: () => void;
  onSkip?: () => void;
  /** true면 매칭/등록과 별도 선택 작업임을 표시 */
  optionalLabel?: boolean;
  showSkip?: boolean;
}) {
  const title = optionalLabel ? '태그 URL 굽기 (선택 · 나중에 해도 됨)' : '태그 URL 기록';
  const doneRing = accent === 'emerald' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900';
  const activeRing =
    accent === 'emerald'
      ? 'border-emerald-400 bg-white text-emerald-800 hover:bg-emerald-50'
      : 'border-amber-400 bg-white text-amber-900 hover:bg-amber-50';
  const errorRing = 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100';

  let btnClass = 'w-full min-h-11 rounded-xl border text-sm font-black flex items-center justify-center gap-2 transition-all disabled:opacity-50 ';
  if (status === 'done') btnClass += doneRing;
  else if (status === 'error') btnClass += errorRing;
  else if (status === 'writing') btnClass += 'border-amber-300 bg-amber-50 text-amber-900';
  else btnClass += activeRing;

  let label = '태그에 URL 굽기';
  if (status === 'writing') label = '태그를 대 주세요… 기록 중';
  else if (status === 'done') label = '기록 완료';
  else if (status === 'error') label = '기록 실패 — 다시 시도';

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 min-w-6 h-6 px-1 rounded-md text-[10px] font-black flex items-center justify-center ${
            status === 'done'
              ? accent === 'emerald'
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-500 text-white'
              : optionalLabel
                ? 'bg-slate-100 text-slate-500 border border-slate-200'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          {status === 'done' ? '✓' : optionalLabel ? '선택' : '3'}
        </span>
        <p className="text-xs font-black text-slate-600">{title}</p>
      </div>

      {optionalLabel ? (
        <p className="text-[11px] font-bold text-slate-500 leading-relaxed -mt-1">
          폰에서 「<strong className="text-slate-700">비어있는 태그</strong>」로 보이면 여기서 기록하세요. 매칭 직후 안내창에서
          기록하는 것을 권장합니다.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onWrite}
        disabled={!uidReady || status === 'writing' || status === 'done'}
        className={btnClass}
      >
        {status === 'writing' ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : status === 'done' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <PenTool className="w-4 h-4 shrink-0" />
        )}
        {label}
      </button>

      {status === 'writing' ? (
        <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
          {Math.round(NFC_WRITE_TIMEOUT_MS / 1000)}초 안에 태그를 스마트폰 <strong>NFC 안테나</strong>에 대 주세요. 기록이 끝나면
          「기록 완료」로 바뀝니다.
        </p>
      ) : null}

      {status === 'done' ? (
        <p
          className={`text-[11px] font-bold rounded-lg px-3 py-2 border ${
            accent === 'emerald'
              ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
              : 'text-amber-900 bg-amber-50 border-amber-200'
          }`}
        >
          {optionalLabel ? '태그에 URL을 기록했습니다.' : 'URL 기록이 완료되었습니다. 이제 마지막 단계 버튼을 눌러 주세요.'}
        </p>
      ) : null}

      {showSkip && onSkip && status !== 'done' && status !== 'writing' ? (
        <button
          type="button"
          onClick={onSkip}
          disabled={!uidReady}
          className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline disabled:opacity-40"
        >
          URL이 이미 태그에 기록됨 — 건너뛰기
        </button>
      ) : null}
    </div>
  );
}

function NfcWorkflowSteps({
  accent,
  labels,
}: {
  accent: NfcUidScanAccent;
  labels: string[];
}) {
  const active = accent === 'emerald' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white';
  const line = accent === 'emerald' ? 'bg-emerald-200' : 'bg-amber-200';
  const wrap = accent === 'emerald' ? 'bg-emerald-50/90 border-emerald-100' : 'bg-amber-50/90 border-amber-100';

  return (
    <div className={`flex items-center gap-1 sm:gap-2 mb-5 p-3 sm:p-3.5 rounded-2xl border ${wrap}`}>
      {labels.map((label, i) => (
        <Fragment key={label}>
          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[10px] sm:text-[11px] font-black flex items-center justify-center shrink-0 ${
                i === 0 ? active : 'bg-white text-slate-400 border border-slate-200'
              }`}
            >
              {i + 1}
            </span>
            <span className="text-[9px] sm:text-[10px] font-black text-slate-600 text-center leading-tight px-0.5">
              {label}
            </span>
          </div>
          {i < labels.length - 1 ? <div className={`w-3 sm:w-6 h-0.5 ${line} shrink-0`} /> : null}
        </Fragment>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const navigate = useNavigate();

  const currentTab: AdminTabId =
    tabParam && ADMIN_TAB_IDS.includes(tabParam as AdminTabId) ? (tabParam as AdminTabId) : 'dashboard';

  useEffect(() => {
    if (tabParam && !ADMIN_TAB_IDS.includes(tabParam as AdminTabId)) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [tabParam, navigate]);

  const [isAdminGuideOpen, setIsAdminGuideOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  /** 제품에 연결 가능한 정품인증서 행 목록 (GET /certificates) */
  const [certificateCatalog, setCertificateCatalog] = useState<
    {
      id: number;
      goldbar_id: number;
      tag_uid: string;
      serial_number: string;
      display_name?: string | null;
    }[]
  >([]);
  /** 보증서 피커 검색 (일련번호·표시명·UID) — API q 파라미터 */
  const [certificateSearchQuery, setCertificateSearchQuery] = useState('');
  const [goldbars, setGoldbars] = useState<any[]>([]);
  const [bulkMarketPrice, setBulkMarketPrice] = useState('');
  const [bulkShowMarket, setBulkShowMarket] = useState(true);
  const [bulkShowStart, setBulkShowStart] = useState('');
  const [bulkShowEnd, setBulkShowEnd] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);

  const [stats, setStats] = useState<any>({
    scanCount: 0,
    scanCountToday: 0,
    activeTags: 0,
    tagsRegistered: 0,
    tagsLinked: 0,
    userCount: 0,
    recentLogs: [],
    topGoldbars: []
  });
  const [statsLoading, setStatsLoading] = useState(true);
  
  const [currentPageLogs, setCurrentPageLogs] = useState(1);
  const LOGS_PER_PAGE = 3;
  const [logsLoading, setLogsLoading] = useState(false);
  
  // 검색 및 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPurity, setFilterPurity] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // 모달 상태
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [isGoldbarModalOpen, setIsGoldbarModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // 폼 상태 (제품 등록)
  const [productFormData, setProductFormData] = useState({
    name: '',
    material: '999.9',
    purity: '24K',
    weight: '',
    width_mm: '',
    height_mm: '',
    price: '',
    memo: '',
    description: '',
    video_url: '',
    manual_url: '',
    image_url: '/jewelry.png',
    options: '',
    image_file_base64: '',
    file_name: '',
    certificate_id: '' as number | ''
  });

  // 폼 상태 (제품 수정용)
  const [editProductFormData, setEditProductFormData] = useState({
    id: '',
    name: '',
    material: '999.9',
    purity: '24K',
    weight: '',
    width_mm: '',
    height_mm: '',
    price: '',
    memo: '',
    description: '',
    video_url: '',
    manual_url: '',
    image_url: '/jewelry.png',
    options: '',
    image_file_base64: '',
    file_name: '',
    /** 판매 완료 시 태그 매칭 해제에 NFC 인증 필요 */
    sold: false,
    certificate_id: '' as number | '',
  });

  // 폼 상태 (NFC 매핑)
  const [nfcFormData, setNfcFormData] = useState({
    tag_uid: '',
    product_id: ''
  });

  // 폼 상태 (골드바 & 보증서 등록)
  const [goldbarFormData, setGoldbarFormData] = useState({
    serial_number: '',
    display_name: '',
    material: '999.9',
    purity: '24K',
    weight: '',
    width_mm: '',
    height_mm: '',
    price: '',
    memo: '',
    minted_at: '',
    tag_uid: '',
    cert_file_base64: '',
    file_name: '',
    status: 'CATALOG',
    cert_url: ''
  });

  // 폼 상태 (골드바 수정용)
  const [editGoldbarData, setEditGoldbarData] = useState({
    id: '',
    serial_number: '',
    display_name: '',
    material: '999.9',
    purity: '24K',
    weight: '',
    width_mm: '',
    height_mm: '',
    price: '',
    memo: '',
    minted_at: '',
    tag_uid: '',
    cert_file_base64: '',
    file_name: '',
    status: 'CATALOG',
    cert_url: ''
  });

  const [currentPageProducts, setCurrentPageProducts] = useState(1);
  const [currentPageNfcAsset, setCurrentPageNfcAsset] = useState(1);
  const [currentPageNfcLinked, setCurrentPageNfcLinked] = useState(1);
  const [currentPageGoldbars, setCurrentPageGoldbars] = useState(1);
  const ITEMS_PER_PAGE = 3;
  /** 골드바 카드 펼침: 인증서 기준 UID 목록 페이지 크기 */

  const [activeReleaseRequests, setActiveReleaseRequests] = useState<any[]>([]);
  const [loadingRelease, setLoadingRelease] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [currentPageAssets, setCurrentPageAssets] = useState(1);
  const [expandedAssetId, setExpandedAssetId] = useState<number | string | null>(null);


  const [activeGuide, setActiveGuide] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcWriting, setNfcWriting] = useState(false);
  /** NFC 기본 모드(읽기/쓰기) 설정을 이미 확인한 경우 true — localStorage 영속화 */
  const [nfcModeConfirmed, setNfcModeConfirmed] = useState<boolean>(() => {
    try { return localStorage.getItem('nfc_mode_confirmed') === '1'; } catch { return false; }
  });
  /** NFC 모드 안내 모달 표시 여부 */
  const [nfcWriteGuideOpen, setNfcWriteGuideOpen] = useState(false);
  /** 빈 태그 자산만 등록 vs 제품 동시 매핑 */
  const [nfcRegisterMode, setNfcRegisterMode] = useState<'asset' | 'product'>('asset');
  const [allTags, setAllTags] = useState<any[]>([]);
  /** 스캔/목록에서 기존 태그를 열 때 서버 등록 스냅샷 (덮어쓰기 안내) */
  const [nfcExistingSnapshot, setNfcExistingSnapshot] = useState<{
    hasProduct: boolean;
    productName: string | null;
    createdAt?: string;
  } | null>(null);
  const [unmapSoldModalTag, setUnmapSoldModalTag] = useState<any | null>(null);
  /** NFC 태그 관리: 매칭된 리스트 필터링 */
  const [nfcFilterProductId, setNfcFilterProductId] = useState('');
  const [nfcFilterCertSerial, setNfcFilterCertSerial] = useState('');
  const [nfcSearchUid, setNfcSearchUid] = useState('');
  const [nfcWorkbenchTab, setNfcWorkbenchTab] = useState<NfcWorkbenchTab>('match');
  /** 제품 매칭 워크벤치: 스캔·수동 입력 후 즉시 출고 연결 */
  const [nfcMatchForm, setNfcMatchForm] = useState({ tag_uid: '', product_id: '' });
  const nfcMatchUidRef = useRef('');
  const [nfcMatchSnapshot, setNfcMatchSnapshot] = useState<NfcMatchSnapshot | null>(null);
  /** UID만 자산 등록 워크벤치 */
  const [nfcRegisterOnlyForm, setNfcRegisterOnlyForm] = useState({ tag_uid: '' });
  const [nfcPendingWriteUid, setNfcPendingWriteUid] = useState('');
  const [nfcPendingWriteContext, setNfcPendingWriteContext] = useState<NfcWriteContext>('modal');
  const [nfcMatchUrlWrite, setNfcMatchUrlWrite] = useState<NfcUrlWriteStatus>('idle');
  const [nfcRegisterUrlWrite, setNfcRegisterUrlWrite] = useState<NfcUrlWriteStatus>('idle');
  /** 매칭·등록 직후 실물 태그 URL 기록 안내 (DB 저장과 NFC 칩 기록은 별도) */
  /** URL 기록 실패 시에만 표시 (성공 시 별도 클릭 불필요) */
  const [nfcTagWritePrompt, setNfcTagWritePrompt] = useState<{
    open: boolean;
    uid: string;
    kind: 'match' | 'register';
  }>({ open: false, uid: '', kind: 'match' });
  const nfcPendingWriteOnSuccessRef = useRef<(() => void) | null>(null);
  const nfcPendingQuickMatchRef = useRef<{ uid: string; product_id: string } | null>(null);
  const nfcPendingUidRegisterRef = useRef<string | null>(null);
  /** 제품 보증서 PDF 생성 (화면 밖 렌더 → html2canvas) */
  const [guaranteePdfPayload, setGuaranteePdfPayload] = useState<GuaranteeCertificateData | null>(null);
  /** 제품 보증서 미리보기 모달 */
  const [guaranteePreviewData, setGuaranteePreviewData] = useState<GuaranteeCertificateData | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const nfcProductTags = useMemo(() => allTags.filter((t: any) => t.target_type === 'product'), [allTags]);
  const nfcUnlinkedList = useMemo(
    () => nfcProductTags.filter((t: any) => t.target_id == null || t.target_id === ''),
    [nfcProductTags]
  );
  const nfcLinkedList = useMemo(() => {
    let list = nfcProductTags.filter((t: any) => t.target_id != null && t.target_id !== '');
    
    if (nfcFilterProductId) {
      list = list.filter((t: any) => String(t.target_id) === nfcFilterProductId);
    }
    if (nfcFilterCertSerial) {
      list = list.filter((t: any) => t.goldbar_serial_number?.toLowerCase().includes(nfcFilterCertSerial.toLowerCase()));
    }
    if (nfcSearchUid) {
      list = list.filter((t: any) => t.tag_uid?.toLowerCase().includes(nfcSearchUid.toLowerCase()));
    }
    
    return list;
  }, [nfcProductTags, nfcFilterProductId, nfcFilterCertSerial, nfcSearchUid]);

  /** 전체 product 태그 중 제품 연결 완료 비율(%) — 태그가 없으면 null */
  const nfcProductMatchRate = useMemo<number | null>(() => {
    const total = nfcProductTags.length;
    if (total === 0) return null;
    const linked = nfcProductTags.filter((t: any) => t.target_id != null && t.target_id !== '').length;
    return Math.round((linked / total) * 100);
  }, [nfcProductTags]);

  const closeAllAdminModals = useCallback(() => {
    setIsProductModalOpen(false);
    setIsEditProductModalOpen(false);
    setIsNfcModalOpen(false);
    setIsGoldbarModalOpen(false);
    setIsEditModalOpen(false);
    setIsAdminGuideOpen(false);
    setNfcExistingSnapshot(null);
    setUnmapSoldModalTag(null);
    setGuaranteePreviewData(null);
    setGuaranteePdfPayload(null);
  }, []);

  const adminAuthHeaders = (): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const executeTagUnmap = async (tagUid: string) => {
    const res = await fetch(`/api/tags/${encodeURIComponent(tagUid)}/unmap`, {
      method: 'POST',
      headers: adminAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.code === 'NEEDS_NFC_SCAN') {
        showToast('error', data?.error || '실제 NFC 태그를 스캔한 뒤 다시 시도해 주세요.');
      } else {
        showToast('error', data?.error || '매칭 해제에 실패했습니다.');
      }
      return false;
    }
    showToast('success', '매칭이 해제되었습니다. 태그는 출고 전 자산 목록으로 이동합니다.');
    setNfcMatchForm((prev) => {
      if (!nfcUidsMatch(prev.tag_uid, tagUid)) return prev;
      return { tag_uid: prev.tag_uid.trim(), product_id: '' };
    });
    fetchTags();
    return true;
  };

  const handleUnmapTagClick = (t: any) => {
    if (!t?.tag_uid) return;
    if (t.product_sold_at) {
      setUnmapSoldModalTag(t);
      return;
    }
    if (
      !confirm(
        '이 태그와 제품의 매칭을 해제할까요?\n태그는 「① UID만 등록된 태그」 목록(출고 전 자산)으로 돌아갑니다.'
      )
    ) {
      return;
    }
    void executeTagUnmap(t.tag_uid);
  };

  const copyUnmapScanUrl = async (tagUid: string) => {
    const url = `${window.location.origin}/t/${encodeURIComponent(tagUid)}?unmap=1`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('success', '링크가 복사되었습니다. 태그 스캔으로 이 주소를 여세요.');
    } catch {
      prompt('아래 URL을 복사해 태그에 연결된 기기에서 여세요:', url);
    }
  };

  const goToTab = useCallback(
    (id: AdminTabId) => {
      closeAllAdminModals();
      navigate(`/admin/${id}`);
    },
    [closeAllAdminModals, navigate]
  );

  useEffect(() => {
    closeAllAdminModals();
  }, [currentTab, closeAllAdminModals]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  const fetchCertificateCatalog = useCallback(async (search?: string) => {
    try {
      const q = (search ?? '').trim();
      const url = q ? `/api/certificates?${new URLSearchParams({ q })}` : '/api/certificates';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setCertificateCatalog(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch certificates catalog', err);
    }
  }, []);

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      if (!res.ok) return;
      const data = await res.json();
      setAllTags(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch tags', err);
    }
  };

  const fetchGoldbars = async () => {
    try {
      const res = await fetch('/api/goldbars');
      const data = await res.json();
      if (Array.isArray(data)) {
        setGoldbars(data);
      }
    } catch (err) {
      console.error('Failed to fetch goldbars', err);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      // stats는 기본 데이터만 가져오고 로그는 fetchLogs에서 별도 처리
      const res = await fetch('/api/admin/stats?logsLimit=0');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchLogs = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const offset = (page - 1) * LOGS_PER_PAGE;
      const res = await fetch(`/api/admin/stats?logsLimit=${LOGS_PER_PAGE}&logsOffset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        setStats((prev: any) => ({
          ...prev,
          recentLogs: data.recentLogs || []
        }));
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLogsLoading(false);
    }
  }, [LOGS_PER_PAGE]);



  const handleBulkApplyAssetMarket = async () => {
    if (selectedAssetIds.length === 0) {
      showToast('error', '적용할 자산을 최소 하나 이상 선택해 주세요.');
      return;
    }
    const price = Number(String(bulkMarketPrice).replace(/,/g, '').trim());
    if (!Number.isFinite(price) || price <= 0) {
      showToast('error', '유효한 1g당 매입 시세를 입력해 주세요.');
      return;
    }

    if (!confirm(`${selectedAssetIds.length}개의 자산에 시세를 일괄 적용하시겠습니까?`)) return;

    setSubmitting(true);
    try {
      let successCount = 0;
      for (const idOrUid of selectedAssetIds) {
        const asset = assets.find(a => (a.id === idOrUid || a.tag_uid === idOrUid));
        if (!asset) continue;

        // 개별 업데이트 함수 재활용
        const goldbarId = asset.id;
        const payload = {
          ...asset,
          market_price_per_gram: price,
          show_market_price: bulkShowMarket,
          show_start_at: bulkShowStart || null,
          show_end_at: bulkShowEnd || null,
          // 보증서가 없는 경우 기본값 설정
          serial_number: asset.serial_number || `AUTO-${Date.now()}`,
          weight: asset.weight || '0',
          purity: asset.purity || '24K',
          status: asset.status || 'TAGGED',
          display_name: asset.product_name || asset.display_name || ''
        };

        const url = goldbarId ? `/api/goldbars/${goldbarId}` : `/api/goldbars/by-tag/${encodeURIComponent(asset.tag_uid)}`;
        const res = await fetch(url, {
          method: goldbarId ? 'PUT' : 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify(payload)
        });

        if (res.ok) successCount++;
      }

      showToast('success', `${successCount}개의 자산 시세 정보가 업데이트되었습니다.`);
      setSelectedAssetIds([]);
      setBulkMarketPrice('');
      fetchAssets();
    } catch (err: any) {
      showToast('error', `오류 발생: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchAssets = async () => {
    setLoadingAssets(true);
    try {
      const res = await fetch('/api/admin/assets', {
        headers: adminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAssets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch assets', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleUpdateAssetMarket = async (asset: any, updateData: any) => {
    try {
      let goldbarId = asset.id;

      // 만약 goldbar_id가 없다면 (제품 매칭 태그만 있는 경우), 보증서 레코드 생성을 위해 정보를 구성
      const payload = {
        ...asset,
        ...updateData,
        // 보증서가 없는 경우 기본값 설정
        serial_number: asset.serial_number || `AUTO-${Date.now()}`,
        weight: asset.weight || '0',
        purity: asset.purity || '24K',
        status: asset.status || 'TAGGED',
        display_name: asset.product_name || asset.display_name || ''
      };

      const url = goldbarId ? `/api/goldbars/${goldbarId}` : `/api/goldbars/by-tag/${encodeURIComponent(asset.tag_uid)}`;
      const res = await fetch(url, {
        method: goldbarId ? 'PUT' : 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('success', '시세 정보가 업데이트되었습니다.');
        fetchAssets();
      } else {
        const d = await res.json();
        showToast('error', d.error || '업데이트 실패');
      }
    } catch (err: any) {
      showToast('error', `오류 발생: ${err.message}`);
    }
  };


  const fetchReleaseRequests = async () => {
    setLoadingRelease(true);
    try {
      const res = await fetch('/api/admin/release-requests', {
        headers: adminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveReleaseRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch release requests', err);
    } finally {
      setLoadingRelease(false);
    }
  };

  const handleHandleRelease = async (id: number, action: 'APPROVE' | 'REJECT') => {
    if (!confirm(`정말 이 요청을 ${action === 'APPROVE' ? '승인' : '반려'}하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/admin/release-requests/${id}`, {
        method: 'PUT',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        showToast('success', '처리되었습니다.');
        fetchReleaseRequests();
        fetchAssets(); // 목록 갱신
      } else {
        const d = await res.json();
        showToast('error', d.error || '처리에 실패했습니다.');
      }
    } catch (err) {
      showToast('error', '오류 발생');
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchGoldbars();
    fetchStats();
    fetchAssets();
    fetchTags();
    fetchReleaseRequests();
  }, []);

  useEffect(() => {
    if (currentTab !== 'dashboard') return;
    fetchStats();
    fetchLogs(currentPageLogs);
    fetchTags();
    fetchAssets(); // 대시보드 통계 계산을 위해 호출
  }, [currentTab, currentPageLogs, fetchLogs]);

  // 자산 시장 탭 진입 시 데이터 로드
  useEffect(() => {
    if (currentTab === 'assetMarket') {
      fetchAssets();
    }
  }, [currentTab]);

  useEffect(() => {
    if (!isProductModalOpen && !isEditProductModalOpen) {
      setCertificateSearchQuery('');
    }
  }, [isProductModalOpen, isEditProductModalOpen]);

  useEffect(() => {
    if (!(currentTab === 'products' || isProductModalOpen || isEditProductModalOpen)) return;
    const delayMs = certificateSearchQuery.trim() ? 280 : 0;
    const t = window.setTimeout(() => {
      void fetchCertificateCatalog(certificateSearchQuery);
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [
    currentTab,
    isProductModalOpen,
    isEditProductModalOpen,
    certificateSearchQuery,
    fetchCertificateCatalog,
  ]);

  // --- NFC 로직 ---
  const handleNFCScan = async (target: 'nfc' | 'goldbar' | 'edit') => {
    if (!('NDEFReader' in window)) {
      showToast('error', '현재 환경에서 Web NFC를 지원하지 않습니다. 안드로이드 Chrome + HTTPS(PWA) 환경에서 다시 시도해 주세요.');
      return;
    }

    try {
      setNfcScanning(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      
      ndef.onreading = async ({ serialNumber }: { serialNumber: string }) => {
        if ('vibrate' in navigator) navigator.vibrate(200);

        if (target === 'nfc') {
          const res = await fetch(`/api/tags/${encodeURIComponent(serialNumber)}`);
          const existingData = await res.json();

          if (existingData?.message === 'goldbar_pool') {
            showToast('error', '이 UID는 골드바 자산 풀(인증서 연결 전)에 등록되어 있습니다. 골드바 탭에서 관리하세요.');
            setNfcScanning(false);
            return;
          }

          if (existingData?.reserved || existingData?.message === 'goldbar_tag') {
            showToast('error', '이 UID는 골드바 정품 태그로 이미 사용 중입니다.');
            setNfcScanning(false);
            return;
          }

          if (existingData?.tag_uid && existingData?.message !== 'not_found') {
            const pid =
              existingData.product_id != null && existingData.product_id !== ''
                ? String(existingData.product_id)
                : '';
            setNfcRegisterMode(pid ? 'product' : 'asset');
            setNfcFormData({ tag_uid: serialNumber, product_id: pid });
            setNfcExistingSnapshot({
              hasProduct: !!pid,
              productName: (existingData.product_name as string) || null,
              createdAt: existingData.created_at as string | undefined
            });
          } else {
            setNfcFormData((prev) => ({ ...prev, tag_uid: serialNumber }));
            setNfcExistingSnapshot(null);
          }
        } else if (target === 'goldbar') {
          setGoldbarFormData(prev => ({ ...prev, tag_uid: serialNumber }));
        } else if (target === 'edit') {
          setEditGoldbarData(prev => ({ ...prev, tag_uid: serialNumber }));
        }
        setNfcScanning(false);
      };
    } catch (error) {
      setNfcScanning(false);
    }
  };

  const setWorkbenchUrlWriteStatus = (context: NfcWriteContext, status: NfcUrlWriteStatus) => {
    if (context === 'match') setNfcMatchUrlWrite(status);
    else if (context === 'register') setNfcRegisterUrlWrite(status);
  };

  /** NFC 쓰기 실제 실행 — 안내 모달 확인 후 또는 이미 확인된 경우 바로 호출 */
  const closeTagWritePrompt = useCallback(() => {
    setNfcTagWritePrompt({ open: false, uid: '', kind: 'match' });
  }, []);

  const beginTagUrlWrite = (tagUid: string, context: NfcWriteContext, onSuccess?: () => void) => {
    const uid = tagUid.trim();
    if (!uid) return;
    nfcPendingWriteOnSuccessRef.current = onSuccess ?? null;
    const run = () => {
      void executeNFCWriteForUid(uid, context).then((ok) => {
        if (ok) nfcPendingWriteOnSuccessRef.current?.();
        nfcPendingWriteOnSuccessRef.current = null;
      });
    };
    if (nfcModeConfirmed) {
      run();
      return;
    }
    setNfcPendingWriteUid(uid);
    setNfcPendingWriteContext(context);
    setNfcWriteGuideOpen(true);
  };

  const executeNFCWriteForUid = async (
    tagUid: string,
    context: NfcWriteContext = 'modal',
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const uid = tagUid.trim();
    if (!uid) return false;

    if (!('NDEFReader' in window)) {
      showToast('error', '현재 환경에서 Web NFC 쓰기를 지원하지 않습니다. 안드로이드 Chrome + HTTPS에서 시도해 주세요.');
      if (context !== 'modal') setWorkbenchUrlWriteStatus(context, 'error');
      return false;
    }

    if (context !== 'modal') setWorkbenchUrlWriteStatus(context, 'writing');
    setNfcWriting(true);

    try {
      const ndef = new (window as any).NDEFReader();
      const writeOp = writeNdefLandingUrl(ndef, uid);
      await Promise.race([
        writeOp,
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('NFC_WRITE_TIMEOUT')), NFC_WRITE_TIMEOUT_MS);
        }),
      ]);
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      if (context !== 'modal') setWorkbenchUrlWriteStatus(context, 'done');
      if (!options?.silent) showToast('success', '태그 URL 기록이 완료되었습니다.');
      return true;
    } catch (err) {
      const timedOut = err instanceof Error && err.message === 'NFC_WRITE_TIMEOUT';
      if (context !== 'modal') setWorkbenchUrlWriteStatus(context, 'error');
      if (!options?.silent) {
        showToast(
          'error',
          timedOut
            ? `제한 시간(${Math.round(NFC_WRITE_TIMEOUT_MS / 1000)}초) 안에 태그를 인식하지 못했습니다. 태그를 기기에 대고 다시 시도해 주세요.`
            : '쓰기 실패: 태그를 단말기 뒷면에 정확하게 대어 주시거나, NFC가 "기본 모드"인지 다시 확인해 주세요.'
        );
      }
      return false;
    } finally {
      setNfcWriting(false);
    }
  };

  const handleNFCWriteFor = (tagUid: string, context: NfcWriteContext = 'modal') => {
    if (!tagUid.trim()) {
      showToast('error', '먼저 UID를 스캔하세요.');
      return;
    }
    beginTagUrlWrite(tagUid, context);
  };

  const handleNFCWrite = () => handleNFCWriteFor(nfcFormData.tag_uid);

  const applyTagScanLookup = async (
    serialNumber: string,
    onResolved: (data: Record<string, unknown>, uid: string) => void
  ): Promise<boolean> => {
    const res = await fetch(`/api/tags/${encodeURIComponent(serialNumber)}`);
    const existingData = (await res.json()) as Record<string, unknown>;

    if (existingData?.message === 'goldbar_pool') {
      showToast('error', '이 UID는 골드바 자산 풀(인증서 연결 전)에 등록되어 있습니다. 골드바 탭에서 관리하세요.');
      return false;
    }
    if (existingData?.reserved || existingData?.message === 'goldbar_tag') {
      showToast('error', '이 UID는 골드바 정품 태그로 이미 사용 중입니다.');
      return false;
    }

    onResolved(existingData, serialNumber);
    return true;
  };

  const clearNfcMatchWorkbench = useCallback(() => {
    setNfcMatchForm({ tag_uid: '', product_id: '' });
    setNfcMatchSnapshot(null);
    setNfcMatchUrlWrite('idle');
  }, []);

  const refreshNfcMatchSnapshot = useCallback(async (uid: string) => {
    const trimmed = uid.trim();
    if (!trimmed) {
      setNfcMatchSnapshot(null);
      setNfcMatchForm((prev) => ({ ...prev, product_id: '' }));
      return;
    }
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as Record<string, unknown>;

      if (data.message === 'goldbar_pool') {
        setNfcMatchSnapshot({
          kind: 'blocked',
          message: '골드바 자산 풀에 등록된 UID입니다. 골드바 탭에서 관리하세요.',
        });
        setNfcMatchForm((prev) => ({ ...prev, tag_uid: trimmed, product_id: '' }));
        return;
      }
      if (data.reserved || data.message === 'goldbar_tag') {
        setNfcMatchSnapshot({
          kind: 'blocked',
          message: '골드바 전용 정품 태그입니다. 제품 매칭 워크벤치에서 사용할 수 없습니다.',
        });
        setNfcMatchForm((prev) => ({ ...prev, tag_uid: trimmed, product_id: '' }));
        return;
      }
      if (data.message === 'not_found') {
        setNfcMatchSnapshot({ kind: 'new' });
        setNfcMatchForm((prev) => ({ ...prev, tag_uid: trimmed, product_id: '' }));
        return;
      }
      if (data.tag_uid) {
        const canonicalUid = String(data.tag_uid);
        const hasProduct = data.product_id != null && data.product_id !== '';
        setNfcMatchSnapshot({
          kind: hasProduct ? 'linked' : 'asset',
          productName: (data.product_name as string) || null,
          productId: hasProduct ? String(data.product_id) : '',
        });
        setNfcMatchForm((prev) => ({
          ...prev,
          tag_uid: canonicalUid,
          product_id: hasProduct ? String(data.product_id) : '',
        }));
        return;
      }
      setNfcMatchSnapshot({ kind: 'new' });
      setNfcMatchForm((prev) => ({ ...prev, tag_uid: trimmed, product_id: '' }));
    } catch {
      setNfcMatchSnapshot(null);
    }
  }, []);

  useEffect(() => {
    nfcMatchUidRef.current = nfcMatchForm.tag_uid;
  }, [nfcMatchForm.tag_uid]);

  /** 목록에서 매칭 해제·삭제 후 제품 매칭 폼이 이전 연결 정보를 보여주지 않도록 동기화 */
  useEffect(() => {
    if (nfcWorkbenchTab !== 'match') return;
    const uid = nfcMatchUidRef.current.trim();
    if (!uid) return;
    void refreshNfcMatchSnapshot(uid);
  }, [allTags, nfcWorkbenchTab, refreshNfcMatchSnapshot]);

  const openMatchWorkbench = (uid?: string) => {
    setNfcWorkbenchTab('match');
    if (uid) {
      setNfcMatchUrlWrite('idle');
      setNfcMatchForm({ tag_uid: uid, product_id: '' });
      void refreshNfcMatchSnapshot(uid);
    } else {
      clearNfcMatchWorkbench();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNFCScanMatch = async () => {
    if (!('NDEFReader' in window)) {
      showToast('error', '현재 환경에서 Web NFC를 지원하지 않습니다. 안드로이드 Chrome + HTTPS(PWA) 환경에서 다시 시도해 주세요.');
      return;
    }
    try {
      setNfcScanning(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = async ({ serialNumber }: { serialNumber: string }) => {
        if ('vibrate' in navigator) navigator.vibrate(200);
        const ok = await applyTagScanLookup(serialNumber, (_data, uid) => {
          setNfcMatchUrlWrite('idle');
          setNfcMatchForm({ tag_uid: uid, product_id: '' });
        });
        if (ok) await refreshNfcMatchSnapshot(serialNumber);
        setNfcScanning(false);
      };
    } catch {
      setNfcScanning(false);
    }
  };

  const handleNFCScanRegisterOnly = async () => {
    if (!('NDEFReader' in window)) {
      showToast('error', '현재 환경에서 Web NFC를 지원하지 않습니다. 안드로이드 Chrome + HTTPS(PWA) 환경에서 다시 시도해 주세요.');
      return;
    }
    try {
      setNfcScanning(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = async ({ serialNumber }: { serialNumber: string }) => {
        if ('vibrate' in navigator) navigator.vibrate(200);
        await applyTagScanLookup(serialNumber, (_data, uid) => {
          setNfcRegisterUrlWrite('idle');
          setNfcRegisterOnlyForm({ tag_uid: uid });
        });
        setNfcScanning(false);
      };
    } catch {
      setNfcScanning(false);
    }
  };

  /** 제품 매칭 API — submit 버튼 제스처 직후 NFC URL 기록과 병행 */
  const submitProductMatchWithTagWrite = async (uid: string, pid: string) => {
    setSubmitting(true);
    const canNfcWrite = typeof window !== 'undefined' && 'NDEFReader' in window;
    const writePromise = canNfcWrite ? executeNFCWriteForUid(uid, 'match', { silent: true }) : null;

    try {
      const tagRes = await fetch(`/api/tags/${encodeURIComponent(uid)}`);
      const tagData = (await tagRes.json()) as Record<string, unknown>;

      let res: Response;
      const isUnlinkedAsset =
        tagData.tag_uid &&
        tagData.message !== 'not_found' &&
        (tagData.product_id == null || tagData.product_id === '');

      if (isUnlinkedAsset) {
        res = await fetch('/api/tags/link-product', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_uid: uid, product_id: Number(pid) }),
        });
      } else {
        res = await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_uid: uid, product_id: pid }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('error', typeof data.error === 'string' ? data.error : '제품 매칭에 실패했습니다.');
        return;
      }

      const writeOk = writePromise ? await writePromise : false;
      if (!canNfcWrite) {
        showToast('success', '제품 매칭이 완료되었습니다. (Chrome Android에서 URL 굽기를 해 주세요.)');
        setNfcMatchForm({ tag_uid: '', product_id: '' });
        setNfcMatchSnapshot(null);
      } else if (writeOk) {
        showToast('success', '제품 매칭 및 태그 URL 기록이 완료되었습니다.');
        setNfcMatchForm({ tag_uid: '', product_id: '' });
        setNfcMatchSnapshot(null);
        setNfcMatchUrlWrite('done');
      } else {
        showToast(
          'error',
          '제품 매칭은 완료됐습니다. 같은 태그를 대고 아래 「태그 URL 굽기」 또는 안내창에서 다시 기록해 주세요.'
        );
        setNfcMatchForm({ tag_uid: uid, product_id: '' });
        setNfcMatchSnapshot(null);
        setNfcTagWritePrompt({ open: true, uid, kind: 'match' });
      }

      fetchTags();
      fetchProducts();
      fetchAssets();
      fetchGoldbars();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '요청 실패';
      showToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickProductMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = nfcMatchForm.tag_uid.trim();
    const pid = nfcMatchForm.product_id;
    if (!uid) {
      showToast('error', '태그 UID를 스캔하거나 입력하세요.');
      return;
    }
    if (!pid) {
      showToast('error', '연결할 제품을 선택하세요.');
      return;
    }
    if (nfcMatchSnapshot?.kind === 'blocked') {
      showToast('error', nfcMatchSnapshot.message);
      return;
    }

    if (!nfcModeConfirmed && typeof window !== 'undefined' && 'NDEFReader' in window) {
      nfcPendingQuickMatchRef.current = { uid, product_id: pid };
      setNfcWriteGuideOpen(true);
      return;
    }

    await submitProductMatchWithTagWrite(uid, pid);
  };

  const submitUidRegisterWithTagWrite = async (uid: string) => {
    setSubmitting(true);
    const canNfcWrite = typeof window !== 'undefined' && 'NDEFReader' in window;
    const writePromise = canNfcWrite ? executeNFCWriteForUid(uid, 'register', { silent: true }) : null;

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_uid: uid, product_id: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('error', typeof data.error === 'string' ? data.error : '등록에 실패했습니다.');
        return;
      }

      const writeOk = writePromise ? await writePromise : false;
      if (!canNfcWrite) {
        showToast('success', 'UID 자산 등록이 완료되었습니다.');
        setNfcRegisterOnlyForm({ tag_uid: '' });
      } else if (writeOk) {
        showToast('success', 'UID 등록 및 태그 URL 기록이 완료되었습니다.');
        setNfcRegisterOnlyForm({ tag_uid: '' });
        setNfcRegisterUrlWrite('done');
      } else {
        showToast('error', 'UID 등록은 완료됐습니다. 같은 태그를 대고 URL을 다시 기록해 주세요.');
        setNfcRegisterOnlyForm({ tag_uid: uid });
        setNfcTagWritePrompt({ open: true, uid, kind: 'register' });
      }
      fetchTags();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUidOnlyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = nfcRegisterOnlyForm.tag_uid.trim();
    if (!uid) {
      showToast('error', '태그 UID를 스캔하거나 입력하세요.');
      return;
    }

    if (!nfcModeConfirmed && typeof window !== 'undefined' && 'NDEFReader' in window) {
      nfcPendingUidRegisterRef.current = uid;
      setNfcWriteGuideOpen(true);
      return;
    }

    await submitUidRegisterWithTagWrite(uid);
  };

  // --- 이미지 압축 및 자동 리사이징 (Canvas 사용) ---
  const handleProductImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (evt) => {
      if (evt.target?.result) {
        img.src = evt.target.result as string;
      }
    };

    img.onload = () => {
      // 500x500 크기로 강제 자동 리사이징
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 500;
      canvas.height = 500;

      if (ctx) {
        ctx.drawImage(img, 0, 0, 500, 500);
        const base64Resized = canvas.toDataURL('image/jpeg', 0.85); // 퀄리티 85% 최적화
        
        if (target === 'create') {
          setProductFormData(prev => ({
            ...prev,
            file_name: file.name,
            image_file_base64: base64Resized
          }));
        } else {
          setEditProductFormData(prev => ({
            ...prev,
            file_name: file.name,
            image_file_base64: base64Resized
          }));
        }
      }
    };

    reader.readAsDataURL(file);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormData.name) {
      showToast('error', '제품 이름을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const { certificate_id, ...productPayload } = productFormData;
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...productPayload,
          certificate_id: certificate_id === '' ? null : certificate_id,
        }),
      });
      if (res.ok) {
        setIsProductModalOpen(false);
        setProductFormData({
          name: '',
          material: '999.9',
          purity: '24K',
          weight: '',
          width_mm: '',
          height_mm: '',
          price: '',
          memo: '',
          description: '',
          video_url: '',
          manual_url: '',
          image_url: '/jewelry.png',
          options: '',
          image_file_base64: '',
          file_name: '',
          certificate_id: '',
        });
        fetchProducts();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // --- 제품 수정 ---
  const handleEditProductOpen = (p: any) => {
    setEditProductFormData({
      id: p.id,
      name: p.name,
      material: p.material ?? '999.9',
      purity: p.purity ?? '24K',
      weight: p.weight ?? '',
      width_mm: p.width_mm ?? '',
      height_mm: p.height_mm ?? '',
      price: p.price ?? '',
      memo: p.memo ?? '',
      description: p.description || '',
      video_url: p.video_url || '',
      manual_url: p.manual_url || '',
      image_url: p.image_url || '/jewelry.png',
      options: p.options || '',
      image_file_base64: '',
      file_name: '',
      sold: !!p.sold_at,
      certificate_id:
        p.certificate_id != null && p.certificate_id !== ''
          ? Number(p.certificate_id)
          : '',
    });
    setIsEditProductModalOpen(true);
  };

  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProductFormData.name) {
      showToast('error', '이름을 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const normalizedProductId = String(editProductFormData.id).match(/^(?:product_)?(\d+)$/)?.[1];
      if (!normalizedProductId) {
        showToast('error', '유효하지 않은 제품 ID입니다. 목록을 새로고침한 뒤 다시 시도해 주세요.');
        return;
      }
      const { certificate_id, ...editPayload } = editProductFormData;
      const res = await fetch(`/api/products/${normalizedProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editPayload,
          certificate_id: certificate_id === '' ? null : certificate_id,
        }),
      });
      if (res.ok) {
        setIsEditProductModalOpen(false);
        showToast('success', '수정되었습니다.');
        fetchProducts();
      } else {
        const d = await res.json();
        showToast('error', `수정 실패: ${d.error}`);
      }
    } catch (err: any) {
      showToast('error', `수정 요청 실패: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // --- 제품 삭제 ---
  const handleDeleteProduct = async (id: string) => {
    if (!confirm('정말로 이 제품 정보와 연관된 NFC 태그 매핑 정보를 모두 영구 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', '삭제 성공!');
        fetchProducts();
        fetchTags();
      }
    } catch (err: any) {
      showToast('error', '삭제 요청 실패');
    }
  };

  const handleNfcMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nfcFormData.tag_uid) {
      showToast('error', '태그 UID를 스캔하세요.');
      return;
    }
    if (nfcRegisterMode === 'product' && !nfcFormData.product_id) {
      showToast('error', '제품을 선택하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const body =
        nfcRegisterMode === 'asset'
          ? { tag_uid: nfcFormData.tag_uid, product_id: null }
          : { tag_uid: nfcFormData.tag_uid, product_id: nfcFormData.product_id };
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsNfcModalOpen(false);
        setNfcRegisterMode('asset');
        setNfcFormData({ tag_uid: '', product_id: '' });
        setNfcExistingSnapshot(null);
        showToast('success', data.mode === 'asset' ? '자산 태그로 등록되었습니다.' : '태그 매핑이 완료되었습니다.');
        fetchProducts();
        fetchTags();
        fetchAssets();
        fetchGoldbars();
      } else {
        showToast('error', typeof data.error === 'string' ? data.error : '등록에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (target === 'create') {
      setGoldbarFormData(prev => ({ ...prev, file_name: file.name }));
    } else {
      setEditGoldbarData(prev => ({ ...prev, file_name: file.name }));
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        if (target === 'create') {
          setGoldbarFormData(prev => ({
            ...prev,
            cert_file_base64: evt.target?.result as string
          }));
        } else {
          setEditGoldbarData(prev => ({
            ...prev,
            cert_file_base64: evt.target?.result as string
          }));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGoldbarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goldbarFormData.serial_number || !goldbarFormData.weight) {
      showToast('error', '필수 입력 항목을 모두 채워주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/goldbars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goldbarFormData)
      });
      if (res.ok) {
        setIsGoldbarModalOpen(false);
        setGoldbarFormData({
          serial_number: '',
          display_name: '',
          material: '999.9',
          purity: '24K',
          weight: '',
          width_mm: '',
          height_mm: '',
          price: '',
          memo: '',
          minted_at: '',
          tag_uid: '',
          cert_file_base64: '',
          file_name: '',
          status: 'CATALOG',
          cert_url: ''
        });
        showToast('success', '골드바 및 정품인증서 등록 성공!');
        fetchGoldbars();
        fetchStats();
      } else {
        const errData = await res.json();
        showToast('error', `오류 발생: ${errData.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      showToast('error', `요청 실패: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // --- 골드바 수정 ---
  const handleEditOpen = (g: any) => {
    setEditGoldbarData({
      id: g.id,
      serial_number: g.serial_number,
      display_name: g.display_name || '',
      material: g.material || '999.9',
      purity: g.purity || '24K',
      weight: g.weight,
      width_mm: g.width_mm || '',
      height_mm: g.height_mm || '',
      price: g.price || '',
      memo: g.memo || '',
      minted_at: g.minted_at || '',
      tag_uid: g.tag_uid || '',
      cert_file_base64: '',
      file_name: '',
      status: g.status || 'CATALOG',
      cert_url: g.cert_url || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGoldbarData.serial_number || !editGoldbarData.weight) {
      showToast('error', '정보를 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/goldbars/${editGoldbarData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editGoldbarData)
      });
      if (res.ok) {
        setIsEditModalOpen(false);
        showToast('success', '수정되었습니다.');
        fetchGoldbars();
      } else {
        const d = await res.json();
        showToast('error', `수정 실패: ${d.error}`);
      }
    } catch (err: any) {
      showToast('error', `수정 요청 실패: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // --- 골드바 삭제 ---
  const handleDeleteGoldbar = async (id: string) => {
    if (!confirm('정말로 이 골드바와 연결된 모든 보증서 정보를 영구 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/goldbars/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', '삭제 성공!');
        fetchGoldbars();
        fetchStats();
      }
    } catch (err: any) {
      showToast('error', '삭제 요청 실패');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
  };

  // 검색 및 필터링된 골드바 리스트
  const filteredGoldbars = goldbars.filter(g => {
    const matchesSearch = g.serial_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPurity = filterPurity ? g.purity === filterPurity : true;
    return matchesSearch && matchesPurity;
  });

  // 검색된 일반 제품 리스트
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  /** 모바일 하단 탭(z-140)이 모달(z-130)보다 위에 있어 키보드·폼이 겹침 → 모달 열릴 때 탭 숨김 */
  const blockMobileBottomNav =
    isProductModalOpen ||
    isEditProductModalOpen ||
    isNfcModalOpen ||
    isGoldbarModalOpen ||
    isEditModalOpen ||
    !!unmapSoldModalTag;

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#F8FAFC] flex font-sans leading-relaxed text-slate-900 animate-in fade-in duration-300">
      {/* 사이드바 - 데스크탑 */}
      <aside className="hidden lg:flex w-72 flex-col p-6 bg-white border-r border-slate-100 shadow-sm fixed h-full z-20">
        <div className="flex items-center gap-3 mb-12 px-2 select-none">
          <img src="/gold_synctag_logo_v2.png" alt="Logo" className="w-9 h-9 object-contain rounded-lg" />
          <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-500">Gold SyncTag</span>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: '통계' },
            { id: 'products', icon: Package, label: '제품 정보 관리' },
            { id: 'nfc', icon: Tag, label: 'NFC 태그 관리' },
            { id: 'goldbars', icon: Award, label: '골드바 정품인증 관리' },
            { id: 'assetMarket', icon: Hash, label: '자산별 시세 및 유통 관리' },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => goToTab(item.id as AdminTabId)}
              className={`flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group ${
                currentTab === item.id ? 'bg-primary text-white shadow-xl shadow-primary/30' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* 사용자 화면 보기 & 로그아웃 버튼 */}
        <div className="mt-auto flex flex-col gap-2">
          <button 
            onClick={() => window.open('/', '_blank')}
            className="flex items-center gap-4 px-5 py-3.5 rounded-2xl text-purple-600 bg-purple-50/40 hover:bg-purple-50 hover:text-purple-700 border border-purple-100/40 hover:border-purple-200/60 transition-all font-black text-sm shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <Eye className="w-5 h-5 transition-transform" />
            사용자 화면 보기
          </button>

          <button 
            onClick={handleLogout}
            className="flex items-center gap-4 px-5 py-3.5 rounded-2xl text-rose-500 bg-rose-50/30 hover:bg-rose-50 hover:text-rose-600 border border-rose-100/40 hover:border-rose-200/60 transition-all font-black text-sm shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <LogOut className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 w-full overflow-x-hidden lg:ml-72 flex flex-col min-h-screen">
        {/* 헤더 */}
        <header className="h-16 lg:h-20 bg-white/80 backdrop-blur-xl border-b border-slate-50 px-3 sm:px-4 lg:px-10 flex items-center justify-between sticky top-0 z-10 transition-all min-w-0 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-initial cursor-pointer select-none" onClick={() => goToTab('dashboard')}>
            <img src="/gold_synctag_logo_v2.png" alt="Logo" className="w-7 h-7 shrink-0 object-contain rounded-lg" />
            <span className="font-black text-slate-800 truncate lg:hidden">Gold SyncTag</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
              title="사용자 화면 보기"
              aria-label="사용자 화면 보기"
              className="p-2.5 rounded-2xl text-purple-500 hover:bg-purple-50 hover:text-purple-600 transition-colors border border-transparent hover:border-purple-100"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                void fetchStats();
                void fetchTags();
                void fetchProducts();
                void fetchGoldbars();
                void fetchAssets();
              }}
              title="대시보드 데이터 새로고침"
              className="p-2.5 rounded-2xl text-slate-400 hover:bg-slate-50 hover:text-amber-600 transition-colors"
              aria-label="새로고침"
            >
              <RefreshCw className={`w-5 h-5 ${statsLoading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" className="p-2.5 rounded-2xl text-slate-400 hover:bg-slate-50 transition-colors relative" aria-label="알림">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0" title="관리자">
              <User className="w-5 h-5" />
            </div>
          </div>
        </header>

        {/* 탭 기반 콘텐츠 */}
        <div className="p-3 sm:p-4 lg:p-10 pb-28 lg:pb-10 space-y-8 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full min-w-0 max-w-full overflow-x-hidden box-border">
          
          {/* 1. 대시보드 탭 */}
          {currentTab === 'dashboard' && (
            <>
              {/* PWA & NFC 실행 환경 안내 배너 (사용설명 아이콘 및 토글 기능) */}
              <div className="bg-white border border-slate-100 rounded-3xl p-4 flex flex-col gap-3 shadow-sm select-none transition-all duration-300">
                <div 
                  onClick={() => setIsAdminGuideOpen(!isAdminGuideOpen)} 
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center text-amber-600 border border-amber-200/30 transition-colors">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm flex items-center gap-2 group-hover:text-amber-700 transition-colors">
                        📱 모바일 앱(PWA) NFC 사용방법 및 주의사항
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">NFC 발행 및 안정적인 백그라운드 작동 가이드</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-100 transition-all">
                    {isAdminGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {isAdminGuideOpen && (
                  <div className="bg-amber-50/50 border border-amber-100/50 p-4 rounded-2xl animate-in slide-in-from-top duration-300">
                    <p className="text-xs font-bold text-amber-700/90 leading-relaxed">
                      1. 안드로이드 스마트폰 상단 바의 <strong className="text-amber-900 font-black">NFC를 "기본 모드(읽기/쓰기)"</strong>로 활성화했는지 확인해 주세요.<br />
                      2. 이 페이지를 홈 화면에 앱(PWA)으로 설치하여 실행하면 백그라운드 끊김 없이 더욱 안정적으로 동작합니다.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  <h2 className="text-2xl lg:text-4xl font-black text-slate-900 tracking-tight">운영 현황</h2>
                  <p className="text-sm font-bold text-slate-400 mt-1">
                    카탈로그·골드바·NFC 태그·스캔 로그를 실시간 집계합니다. 카드 클릭 시 해당 메뉴로 이동합니다.
                  </p>
                </div>
              </div>

              {/* 핵심 KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 min-w-0 w-full">
                {[
                  {
                    label: '카탈로그 제품',
                    sub: '판매용 제품 등록',
                    value: products.length,
                    icon: Package,
                    color: 'text-blue-600',
                    bg: 'bg-blue-50',
                    tab: 'products' as AdminTabId
                  },
                  {
                    label: '골드바 인증',
                    sub: '정품 골드바 행',
                    value: goldbars.length,
                    icon: Award,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                    tab: 'goldbars' as AdminTabId
                  },
                  {
                    label: '누적 NFC 스캔',
                    sub: `오늘 ${statsLoading ? '…' : Number(stats.scanCountToday ?? 0).toLocaleString()}건`,
                    value: statsLoading ? '…' : Number(stats.scanCount ?? 0).toLocaleString(),
                    icon: ScanLine,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                    tab: 'dashboard' as AdminTabId
                  },
                  {
                    label: '제품 매칭률',
                    sub: '출고 완료 / 제품용 태그',
                    value:
                      nfcProductMatchRate === null
                        ? '—'
                        : `${nfcProductMatchRate}%`,
                    icon: Tag,
                    color: 'text-violet-600',
                    bg: 'bg-violet-50',
                    tab: 'nfc' as AdminTabId
                  }
                ].map((stat, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => stat.tab && goToTab(stat.tab)}
                    className="text-left bg-white p-4 sm:p-5 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-50 hover:border-slate-200/60 hover:shadow-xl transition-all cursor-pointer group hover:scale-[1.02] active:scale-[0.98] flex flex-col justify-between min-h-[140px] sm:min-h-[160px] min-w-0 max-w-full"
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4 transition-transform group-hover:scale-105`}
                    >
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-widest">{stat.label}</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900 mt-1 tabular-nums">{stat.value}</h3>
                      <p className="text-[10px] font-bold text-slate-400 mt-1 leading-snug">{stat.sub}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* 부가 지표 — 출고·유저 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => goToTab('nfc')}
                  className="bg-white rounded-2xl border border-amber-100 p-4 sm:p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 text-amber-700 mb-2">
                    <Box className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider">출고 대기</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{nfcUnlinkedList.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">제품 미연결 NFC (자산 태그)</p>
                </button>
                <button
                  type="button"
                  onClick={() => goToTab('nfc')}
                  className="bg-white rounded-2xl border border-emerald-100 p-4 sm:p-5 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 text-emerald-700 mb-2">
                    <LinkIcon className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider">출고 완료</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">{nfcLinkedList.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">제품과 매칭된 태그</p>
                </button>
                <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Activity className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider">스캔한 UID 수</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">
                    {statsLoading ? '…' : Number(stats.activeTags ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">누적 고유 태그(verification_logs)</p>
                </div>
                <button
                  type="button"
                  onClick={() => goToTab('assetMarket')}
                  className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:border-purple-200 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 text-purple-600 mb-2">
                    <Activity className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider">자산별 시세 관리</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 tabular-nums">
                    {loadingAssets ? '…' : assets.length.toLocaleString()}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">시세 설정 가능 자산(보증서)</p>
                </button>
              </div>

              {/* 정품인증 태그 등록 가이드 섹션 */}
              <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border border-slate-50 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-purple-600 rounded-full"></div>
                  <h3 className="text-lg font-black text-slate-800">정품인증 태그(NFC) 등록 및 출고 프로세스 가이드</h3>
                </div>

                {/* 1행×3열 아이콘 — 설명은 아래 전체 너비 패널 */}
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {/* 1단계 */}
                    <div
                      onClick={() => setActiveGuide(activeGuide === 1 ? null : 1)}
                      className={`bg-slate-50/60 p-3 sm:p-5 rounded-2xl sm:rounded-3xl border flex flex-col gap-2 sm:gap-4 relative overflow-hidden hover:border-purple-200/60 hover:shadow-md transition-all group cursor-pointer min-h-0 ${
                        activeGuide === 1 ? 'border-amber-300 ring-2 ring-amber-200/80 shadow-md' : 'border-slate-100'
                      }`}
                    >
                      <span className="absolute -right-1 -bottom-2 sm:-right-4 sm:-bottom-4 text-5xl sm:text-7xl font-black text-slate-100/60 tracking-tighter select-none pointer-events-none">01</span>
                      <div className="flex flex-col items-center text-center gap-1.5 sm:gap-2 relative z-[1]">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100/60 shadow-sm transition-transform group-hover:scale-105">
                          <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-black uppercase text-amber-600 tracking-widest">STEP 01</span>
                        <h4 className="font-black text-slate-800 text-[11px] sm:text-base leading-snug">카탈로그(제품) 생성</h4>
                        <div className="text-slate-400 mt-0.5">
                          {activeGuide === 1 ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 mx-auto" />}
                        </div>
                      </div>
                    </div>

                    {/* 2단계 */}
                    <div
                      onClick={() => setActiveGuide(activeGuide === 2 ? null : 2)}
                      className={`bg-slate-50/60 p-3 sm:p-5 rounded-2xl sm:rounded-3xl border flex flex-col gap-2 sm:gap-4 relative overflow-hidden hover:border-purple-200/60 hover:shadow-md transition-all group cursor-pointer min-h-0 ${
                        activeGuide === 2 ? 'border-blue-300 ring-2 ring-blue-200/80 shadow-md' : 'border-slate-100'
                      }`}
                    >
                      <span className="absolute -right-1 -bottom-2 sm:-right-4 sm:-bottom-4 text-5xl sm:text-7xl font-black text-slate-100/60 tracking-tighter select-none pointer-events-none">02</span>
                      <div className="flex flex-col items-center text-center gap-1.5 sm:gap-2 relative z-[1]">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100/60 shadow-sm transition-transform group-hover:scale-105">
                          <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-black uppercase text-blue-600 tracking-widest">STEP 02</span>
                        <h4 className="font-black text-slate-800 text-[11px] sm:text-base leading-snug">신규 NFC 태그 등록</h4>
                        <div className="text-slate-400 mt-0.5">
                          {activeGuide === 2 ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 mx-auto" />}
                        </div>
                      </div>
                    </div>

                    {/* 3단계 */}
                    <div
                      onClick={() => setActiveGuide(activeGuide === 3 ? null : 3)}
                      className={`bg-slate-50/60 p-3 sm:p-5 rounded-2xl sm:rounded-3xl border flex flex-col gap-2 sm:gap-4 relative overflow-hidden hover:border-purple-200/60 hover:shadow-md transition-all group cursor-pointer min-h-0 ${
                        activeGuide === 3 ? 'border-emerald-300 ring-2 ring-emerald-200/80 shadow-md' : 'border-slate-100'
                      }`}
                    >
                      <span className="absolute -right-1 -bottom-2 sm:-right-4 sm:-bottom-4 text-5xl sm:text-7xl font-black text-slate-100/60 tracking-tighter select-none pointer-events-none">03</span>
                      <div className="flex flex-col items-center text-center gap-1.5 sm:gap-2 relative z-[1]">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center border border-emerald-100/60 shadow-sm transition-transform group-hover:scale-105">
                          <LinkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-black uppercase text-emerald-600 tracking-widest">STEP 03</span>
                        <h4 className="font-black text-slate-800 text-[11px] sm:text-base leading-snug">정품인증 및 출고 연동</h4>
                        <div className="text-slate-400 mt-0.5">
                          {activeGuide === 3 ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 mx-auto" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 선택된 단계 설명: 카드 전체 가로 폭 */}
                  {activeGuide !== null && (
                    <div
                      className={`w-full rounded-2xl sm:rounded-3xl border px-4 py-4 sm:px-6 sm:py-5 animate-in fade-in slide-in-from-top-2 duration-300 ${
                        activeGuide === 1
                          ? 'bg-amber-50/80 border-amber-200/70'
                          : activeGuide === 2
                            ? 'bg-blue-50/80 border-blue-200/70'
                            : 'bg-emerald-50/80 border-emerald-200/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                        <span
                          className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${
                            activeGuide === 1 ? 'text-amber-700' : activeGuide === 2 ? 'text-blue-700' : 'text-emerald-700'
                          }`}
                        >
                          STEP 0{activeGuide}
                        </span>
                        <span className="text-xs sm:text-sm font-black text-slate-800">
                          {activeGuide === 1 && '카탈로그(제품) 생성'}
                          {activeGuide === 2 && '신규 NFC 태그 등록'}
                          {activeGuide === 3 && '정품인증 및 출고 연동'}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed max-w-none">
                        {activeGuide === 1 && (
                          <>
                            골드바의 <strong className="text-slate-800 font-black">일련번호, 중량, 순도, 제조일자</strong> 등의 제원 정보를 등록하여 정품인증서 카탈로그를 생성합니다.
                          </>
                        )}
                        {activeGuide === 2 && (
                          <>
                            실물 NFC 태그의 고유 <strong className="text-slate-800 font-black">UID를 스캔하여 매핑</strong>하고, 카탈로그와 연결하여 데이터가 태그에 반영될 수 있도록 준비합니다.
                          </>
                        )}
                        {activeGuide === 3 && (
                          <>
                            출고 시점에 <strong className="text-slate-800 font-black">정품인증서 URL을 등록</strong>하면 최종 출고 처리가 되며, 사용자는 태그 스캔 시 웹 보증서로 바로 연결됩니다.
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 인기 골드바 순위 & 최근 스캔 기록 */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* 1) 인기 골드바 리스트 */}
                <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-6 lg:p-8 border border-slate-50 shadow-sm flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                    <h3 className="text-lg font-black text-slate-800">스캔 Top (태그·제품·골드바)</h3>
                  </div>

                  <div className="space-y-3 flex-1 flex flex-col justify-start">
                    {stats.topGoldbars && stats.topGoldbars.map((g: any, i: number) => (
                      <div key={`${g.tag_uid ?? i}-${i}`} className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100 flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-amber-700 uppercase tracking-widest">#{i + 1}</p>
                          <p className="text-sm font-black text-slate-800 mt-0.5 break-words line-clamp-2">{g.serial_number}</p>
                          {g.tag_uid ? (
                            <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5 truncate" title={g.tag_uid}>
                              {g.tag_uid}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-400">누적</p>
                          <p className="text-lg font-black text-amber-600 tabular-nums">{g.scan_count}회</p>
                        </div>
                      </div>
                    ))}
                    {(!stats.topGoldbars || stats.topGoldbars.length === 0) && (
                      <p className="text-xs font-bold text-slate-400 text-center py-6">아직 스캔된 데이터가 없습니다.</p>
                    )}
                  </div>
                </div>

                {/* 2) 최근 스캔 로그 리스트 (Timeline) */}
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-6 lg:p-8 border border-slate-50 shadow-sm flex flex-col h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                      <h3 className="text-lg font-black text-slate-800">최근 스캔 기록</h3>
                    </div>
                    {logsLoading && <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />}
                  </div>

                  <div className="space-y-3 flex-1">
                    {stats.recentLogs && stats.recentLogs.map((log: any, idx: number) => (
                      <div key={idx} className={`flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100/60 hover:border-amber-400/30 transition-all ${logsLoading ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-amber-500">
                            <Award className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 line-clamp-2">
                              {log.display_label || log.serial_number || '이름 없음'}
                            </p>
                            <p className="text-xs font-bold text-slate-400 font-mono mt-0.5 break-all">UID: {log.tag_uid}</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-xl flex items-center gap-1 mb-1">
                            정품인증 성공
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {new Date(log.scanned_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}

                    {(!stats.recentLogs || stats.recentLogs.length === 0) && !logsLoading && (
                      <div className="p-8 text-center text-slate-400 font-bold">
                        아직 접수된 스캔 기록이 없습니다.
                      </div>
                    )}

                    {/* 최근 스캔 페이지네이션 */}
                    <div className="flex justify-center items-center gap-3 mt-6">
                      <button
                        disabled={currentPageLogs === 1 || logsLoading}
                        onClick={() => setCurrentPageLogs(p => Math.max(1, p - 1))}
                        className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm"
                      >
                        이전
                      </button>
                      <span className="text-xs font-black text-slate-400 px-2">
                        {currentPageLogs} 페이지
                      </span>
                      <button
                        disabled={(stats.recentLogs?.length ?? 0) < LOGS_PER_PAGE || logsLoading}
                        onClick={() => setCurrentPageLogs(p => p + 1)}
                        className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 2. 제품 정보 관리 탭 */}
          {currentTab === 'products' && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between w-full min-w-0">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 break-words">제품 정보 관리</h2>
                  <p className="text-[11px] sm:text-xs font-bold text-slate-400 mt-1 leading-relaxed">NFC 태그를 매핑할 순수 제품의 제원 정보를 관리합니다.</p>
                </div>
                <button type="button" onClick={() => setIsProductModalOpen(true)} className="purple-btn !py-3 !px-5 sm:!py-3.5 sm:!px-6 flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm">
                  <Plus className="w-5 h-5 shrink-0" /> 제품 등록
                </button>
              </div>

              {/* 검색 바 */}
              <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 flex items-center gap-3 shadow-sm w-full min-w-0 max-w-full">
                <Search className="w-5 h-5 text-slate-300" />
                <input 
                  type="text" 
                  placeholder="제품 이름 검색..." 
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full text-sm font-bold outline-none bg-transparent"
                />
              </div>

              <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 w-full min-w-0">
                {filteredProducts.slice((currentPageProducts - 1) * ITEMS_PER_PAGE, currentPageProducts * ITEMS_PER_PAGE).map((p) => (
                  <div key={p.id} className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] border border-slate-100 flex flex-col gap-3 sm:gap-4 hover:border-primary/30 transition-all group shadow-sm w-full min-w-0 max-w-full overflow-hidden">
                    <div className="flex gap-2 sm:gap-3 w-full min-w-0 items-start">
                      <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-slate-50 overflow-hidden ring-2 sm:ring-4 ring-slate-50">
                        <img src={p.image_url.startsWith('/') ? p.image_url : p.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="font-black text-slate-800 text-base sm:text-lg break-words line-clamp-2">{p.name}</h4>
                          {p.sold_at ? (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg border border-rose-100 shrink-0">
                              판매완료
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-400 font-bold line-clamp-2 mt-0.5 break-words">{p.description || '상세 설명 없음'}</p>
                        {(p.cert_serial_number || p.cert_tag_uid || p.cert_display_name) && (
                          <p className="text-[10px] font-bold text-amber-700 mt-1.5 flex items-start gap-1.5 min-w-0">
                            <Award className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="min-w-0 leading-snug">
                              <span className="text-amber-800/90">인증서 </span>
                              {p.cert_display_name ? (
                                <>
                                  <span className="font-black text-amber-900">{p.cert_display_name}</span>
                                  {p.cert_serial_number ? (
                                    <span className="text-amber-700/85 font-mono text-[9px] font-bold ml-1">
                                      ({p.cert_serial_number})
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="font-mono font-black text-amber-900">
                                  {p.cert_serial_number || '?'}
                                </span>
                              )}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col sm:flex-row items-end sm:items-start gap-0.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setGuaranteePreviewData(mapProductToGuaranteeData(p as Record<string, unknown>))}
                          className="p-2 rounded-lg sm:rounded-xl hover:bg-slate-100 text-slate-400 hover:text-amber-600 transition-all"
                          aria-label="보증서 미리보기"
                          title="보증서 미리보기"
                        >
                          <Eye className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuaranteePdfPayload(mapProductToGuaranteeData(p as Record<string, unknown>))}
                          className="p-2 rounded-lg sm:rounded-xl hover:bg-amber-50 text-slate-400 hover:text-amber-700 transition-all"
                          aria-label="제품 보증서 PDF"
                          title="제품 보증서 PDF"
                        >
                          <Download className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </button>
                        <button type="button" onClick={() => handleEditProductOpen(p)} className="p-2 rounded-lg sm:rounded-xl hover:bg-slate-50 text-slate-400 hover:text-primary transition-all" aria-label="수정">
                          <Edit3 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </button>
                        <button type="button" onClick={() => handleDeleteProduct(p.id)} className="p-2 rounded-lg sm:rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all" aria-label="삭제">
                          <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </button>
                      </div>
                    </div>

                    {/* 옵션 뱃지 리스트 */}
                    {p.options && (
                      <div className="border-t border-slate-50 pt-3 mt-1 flex flex-wrap gap-1.5">
                        {p.options.split(',').map((opt: string, i: number) => (
                          <span key={i} className="text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl uppercase">
                            {opt.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {filteredProducts.length === 0 && (
                  <div className="col-span-2 bg-white rounded-3xl border border-slate-100 p-12 flex flex-col items-center justify-center text-center">
                    <Package className="w-16 h-16 text-slate-200 mb-4" />
                    <p className="font-black text-slate-400">등록된 제품이 없거나 검색 결과가 없습니다.</p>
                  </div>
                )}
              </div>

              {/* 제품 페이지네이션 */}
              {filteredProducts.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center items-center gap-2 mt-6 flex-wrap max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                  <button
                    disabled={currentPageProducts === 1}
                    onClick={() => setCurrentPageProducts(p => p - 1)}
                    className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                  >
                    이전
                  </button>
                  {Array.from({ length: Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPageProducts(i + 1)}
                      className={`w-10 h-10 text-xs font-black rounded-xl border transition-all shrink-0 ${currentPageProducts === i + 1 ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-transparent shadow-md' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={currentPageProducts === Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)}
                    onClick={() => setCurrentPageProducts(p => p + 1)}
                    className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}

          {/* 3. NFC 태그 관리 탭 */}
          {currentTab === 'nfc' && (
            <div className="space-y-8 sm:space-y-10 w-full min-w-0">
              <div className="flex flex-col gap-4 w-full min-w-0 bg-white/40 p-4 sm:p-5 rounded-3xl backdrop-blur-xl border border-slate-200/40">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-gradient-to-b from-emerald-400 to-teal-600 rounded-full"></div>
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">NFC 태그 관리</h2>
                  </div>
                  <p className="text-[11px] sm:text-xs font-bold text-slate-400 mt-1 leading-relaxed pl-3.5">
                    UID 등록과 제품 매칭을 분리했습니다. 출고 시에는 「제품 매칭」에서 태그를 스캔해 바로 연결하세요.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/60">
                  {(
                    [
                      { id: 'match' as NfcWorkbenchTab, label: '제품 매칭', icon: LinkIcon },
                      { id: 'register' as NfcWorkbenchTab, label: 'UID 등록', icon: Hash },
                      { id: 'browse' as NfcWorkbenchTab, label: '태그 목록', icon: Tag },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setNfcWorkbenchTab(tab.id)}
                      className={`flex-1 min-w-[7.5rem] py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 ${
                        nfcWorkbenchTab === tab.id
                          ? tab.id === 'match'
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                            : tab.id === 'register'
                              ? 'bg-white text-amber-800 shadow-md border border-amber-100'
                              : 'bg-white text-slate-800 shadow-md border border-slate-100'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                      }`}
                    >
                      <tab.icon className="w-4 h-4 shrink-0" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-2">
                    <p className="text-lg font-black text-amber-900 tabular-nums">{nfcUnlinkedList.length}</p>
                    <p className="text-[10px] font-bold text-amber-700/90">UID만 등록</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-3 py-2">
                    <p className="text-lg font-black text-emerald-900 tabular-nums">{nfcLinkedList.length}</p>
                    <p className="text-[10px] font-bold text-emerald-700/90">제품 매칭 완료</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 col-span-2 sm:col-span-1">
                    <p className="text-lg font-black text-slate-800 tabular-nums">
                      {nfcProductMatchRate === null ? '—' : `${nfcProductMatchRate}%`}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">매칭률</p>
                  </div>
                </div>
              </div>

              {/* 제품 매칭 워크벤치 */}
              {nfcWorkbenchTab === 'match' && (
                <div className="bg-white rounded-3xl p-5 sm:p-8 border border-emerald-200/60 shadow-xl shadow-emerald-100/40 w-full min-w-0">
                  <div className="flex items-start gap-3 mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-emerald-600 shrink-0">
                      <LinkIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900">제품 매칭 (출고)</h3>
                      <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                        <strong className="text-slate-700">① 태그 스캔 → ② 제품 선택 → ③ 제품 매칭 완료</strong> 한 번이면 서버 저장과
                        태그 URL 기록이 함께 진행됩니다. 버튼을 누른 뒤 <strong className="text-slate-700">같은 태그</strong>를
                        폰에 대 주세요.
                      </p>
                    </div>
                  </div>

                  <NfcWorkflowSteps accent="emerald" labels={['NFC 스캔', '제품 선택', '매칭 완료']} />

                  <form onSubmit={handleQuickProductMatch} className="space-y-5">
                    <NfcUidScanStep
                      stepNumber={1}
                      stepTitle="태그 UID — 아래 초록 버튼부터 누르세요"
                      accent="emerald"
                      tagUid={nfcMatchForm.tag_uid}
                      scanning={nfcScanning}
                      onScan={() => void handleNFCScanMatch()}
                      onClear={clearNfcMatchWorkbench}
                      scanLabel="제품 매칭 · NFC 스캔 시작"
                      scanSubLabel="① 이 버튼 → ② 제품 선택 → ③ 맨 아래 「제품 매칭 완료」"
                      onTagUidChange={(v) => {
                        if (!v.trim()) {
                          clearNfcMatchWorkbench();
                          return;
                        }
                        setNfcMatchUrlWrite('idle');
                        setNfcMatchForm((prev) => ({ ...prev, tag_uid: v }));
                        void refreshNfcMatchSnapshot(v);
                      }}
                    />

                    {nfcMatchSnapshot && (
                      <div
                        className={`rounded-xl px-4 py-3 text-xs font-bold border ${
                          nfcMatchSnapshot.kind === 'blocked'
                            ? 'bg-rose-50 border-rose-100 text-rose-800'
                            : nfcMatchSnapshot.kind === 'linked'
                              ? 'bg-blue-50 border-blue-100 text-blue-900'
                              : nfcMatchSnapshot.kind === 'asset'
                                ? 'bg-amber-50 border-amber-100 text-amber-900'
                                : 'bg-slate-50 border-slate-100 text-slate-700'
                        }`}
                      >
                        {nfcMatchSnapshot.kind === 'blocked' && nfcMatchSnapshot.message}
                        {nfcMatchSnapshot.kind === 'new' && '신규 태그입니다. 매칭 시 UID 등록과 제품 연결이 한 번에 진행됩니다.'}
                        {nfcMatchSnapshot.kind === 'asset' && '자산으로 등록된 태그입니다. 아래에서 제품을 선택해 출고(매칭)하세요.'}
                        {nfcMatchSnapshot.kind === 'linked' && (
                          <>
                            이미 「{nfcMatchSnapshot.productName || '제품'}」에 연결되어 있습니다. 제품을 바꾸면 덮어쓰기 됩니다.
                          </>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pl-0.5">
                        <span className="shrink-0 w-7 h-7 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center shadow-sm">
                          2
                        </span>
                        <label className="text-xs sm:text-sm font-black text-slate-800">출고할 제품 선택</label>
                      </div>
                      <div className="relative">
                        <select
                          required
                          value={nfcMatchForm.product_id}
                          onChange={(e) => setNfcMatchForm((prev) => ({ ...prev, product_id: e.target.value }))}
                          className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 pl-4 pr-10 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white appearance-none cursor-pointer"
                        >
                          <option value="">제품을 선택하세요</option>
                          {products.map((p: { id: number | string; name: string }) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        !nfcMatchForm.tag_uid.trim() ||
                        !nfcMatchForm.product_id ||
                        nfcMatchSnapshot?.kind === 'blocked'
                      }
                      className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-base rounded-2xl shadow-lg shadow-emerald-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {(submitting || nfcWriting) && <Loader2 className="w-5 h-5 animate-spin" />}
                      {nfcWriting
                        ? '태그를 기기에 대 주세요…'
                        : submitting
                          ? '매칭 저장 중…'
                          : '제품 매칭 완료 (URL 자동 기록)'}
                    </button>

                    <NfcUrlWritePanel
                      accent="emerald"
                      status={nfcMatchUrlWrite}
                      uidReady={!!nfcMatchForm.tag_uid.trim()}
                      optionalLabel
                      onWrite={() => handleNFCWriteFor(nfcMatchForm.tag_uid, 'match')}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNfcRegisterMode('product');
                        setNfcFormData({
                          tag_uid: nfcMatchForm.tag_uid,
                          product_id: nfcMatchForm.product_id,
                        });
                        setNfcExistingSnapshot(
                          nfcMatchSnapshot?.kind === 'linked'
                            ? {
                                hasProduct: true,
                                productName: nfcMatchSnapshot.productName ?? null,
                              }
                            : nfcMatchSnapshot?.kind === 'asset'
                              ? { hasProduct: false, productName: null }
                              : null
                        );
                        setIsNfcModalOpen(true);
                      }}
                      className="w-full text-center text-[11px] font-bold text-slate-400 hover:text-emerald-700 underline-offset-2 hover:underline"
                    >
                      통합 발행 모달 (고급 · URL 덮어쓰기)
                    </button>
                  </form>
                </div>
              )}

              {/* UID 등록 워크벤치 */}
              {nfcWorkbenchTab === 'register' && (
                <div className="bg-white rounded-3xl p-5 sm:p-8 border border-amber-200/60 shadow-xl shadow-amber-100/30 w-full min-w-0">
                  <div className="flex items-start gap-3 mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-600 shrink-0">
                      <Hash className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900">UID만 등록 (자산)</h3>
                      <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                        제품 연결 없이 NFC UID만 재고 자산으로 등록합니다. 출고는 「제품 매칭」 탭에서 진행하세요.
                      </p>
                    </div>
                  </div>

                  <NfcWorkflowSteps accent="amber" labels={['NFC 스캔', 'UID 확인', '자산 등록']} />

                  <form onSubmit={handleUidOnlyRegister} className="space-y-5">
                    <NfcUidScanStep
                      stepNumber={1}
                      stepTitle="태그 UID — 아래 주황 버튼부터 누르세요"
                      accent="amber"
                      tagUid={nfcRegisterOnlyForm.tag_uid}
                      scanning={nfcScanning}
                      onScan={() => void handleNFCScanRegisterOnly()}
                      scanLabel="UID 자산 등록 · NFC 스캔 시작"
                      scanSubLabel="① 이 버튼 → ② UID 확인 → ③ 맨 아래 「UID 자산 등록」"
                      onTagUidChange={(v) => {
                        setNfcRegisterOnlyForm({ tag_uid: v });
                        setNfcRegisterUrlWrite('idle');
                      }}
                    />

                    <button
                      type="submit"
                      disabled={submitting || !nfcRegisterOnlyForm.tag_uid.trim()}
                      className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-base rounded-2xl shadow-lg shadow-amber-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {(submitting || nfcWriting) && <Loader2 className="w-5 h-5 animate-spin" />}
                      {nfcWriting
                        ? '태그를 기기에 대 주세요…'
                        : submitting
                          ? '등록 중…'
                          : 'UID 자산 등록 (URL 자동 기록)'}
                    </button>

                    <NfcUrlWritePanel
                      accent="amber"
                      status={nfcRegisterUrlWrite}
                      uidReady={!!nfcRegisterOnlyForm.tag_uid.trim()}
                      optionalLabel
                      showSkip
                      onWrite={() => handleNFCWriteFor(nfcRegisterOnlyForm.tag_uid, 'register')}
                      onSkip={() => setNfcRegisterUrlWrite('idle')}
                    />
                  </form>
                </div>
              )}

              {nfcWorkbenchTab === 'browse' && (
              <>
              {/* UID만 등록 (제품 미연결) — 목록 */}
              <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200/60 shadow-xl shadow-slate-100/50 overflow-hidden w-full min-w-0 max-w-full hover:border-slate-300/60 transition-all duration-300">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-600">
                      <Hash className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg lg:text-xl font-black text-slate-900 flex items-center gap-2">① UID만 등록된 태그 <span className="text-xs font-black text-amber-700 bg-amber-50/80 px-2 py-0.5 rounded-lg border border-amber-200/50">(자산)</span></h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 leading-relaxed">
                        출고 전 재고 목록입니다. 「이 태그로 매칭」을 누르면 제품 매칭 워크벤치로 이동합니다.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-800 bg-amber-50 px-3.5 py-1.5 rounded-2xl border border-amber-200/80 shadow-sm shrink-0">
                    총 {nfcUnlinkedList.length}건
                  </span>
                </div>

                <div className="space-y-4">
                  {nfcUnlinkedList
                    .slice((currentPageNfcAsset - 1) * ITEMS_PER_PAGE, currentPageNfcAsset * ITEMS_PER_PAGE)
                    .map((t: any) => (
                      <div
                        key={`un-${t.id}-${t.tag_uid}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-4 sm:px-6 rounded-2xl border min-w-0 max-w-full bg-slate-50/40 border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 transition-all"
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className="w-11 h-11 shrink-0 rounded-2xl bg-white flex items-center justify-center text-amber-600 border border-amber-100/80 shadow-sm">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="font-black text-slate-800 text-sm sm:text-base break-all leading-snug font-mono">
                              {t.tag_uid}
                            </p>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">
                              등록일{' '}
                              <span className="font-mono bg-white px-1.5 py-0.5 border border-slate-100 rounded text-slate-500 text-[10px]">
                                {t.created_at
                                  ? new Date(t.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                                  : '-'}
                              </span>
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openMatchWorkbench(t.tag_uid)}
                          className="shrink-0 h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
                        >
                          <LinkIcon className="w-4 h-4" /> 이 태그로 매칭
                        </button>
                      </div>
                    ))}
                  {nfcUnlinkedList.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200/80">
                      <Smartphone className="w-12 h-12 text-slate-200 mb-2" />
                      <p className="text-xs sm:text-sm font-black text-slate-400">등록된 빈 자산 태그가 없습니다.</p>
                    </div>
                  )}
                </div>

                {nfcUnlinkedList.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-center items-center gap-2 mt-6 flex-wrap max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <button
                      disabled={currentPageNfcAsset === 1}
                      onClick={() => setCurrentPageNfcAsset((p) => p - 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm shrink-0"
                    >
                      이전
                    </button>
                    {Array.from({ length: Math.ceil(nfcUnlinkedList.length / ITEMS_PER_PAGE) }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentPageNfcAsset(i + 1)}
                        className={`w-10 h-10 text-xs font-black rounded-xl border transition-all shrink-0 ${
                          currentPageNfcAsset === i + 1
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-md font-black scale-105'
                            : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      disabled={currentPageNfcAsset === Math.ceil(nfcUnlinkedList.length / ITEMS_PER_PAGE)}
                      onClick={() => setCurrentPageNfcAsset((p) => p + 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm shrink-0"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>

              {/* 제품 매칭 완료 */}
              <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200/60 shadow-xl shadow-slate-100/50 overflow-hidden w-full min-w-0 max-w-full hover:border-slate-300/60 transition-all duration-300">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-emerald-600">
                      <LinkIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg lg:text-xl font-black text-slate-900 flex items-center gap-2">② 제품과 매칭된 태그 <span className="text-xs font-black text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-lg border border-emerald-200/50">(매칭 완료)</span></h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 leading-relaxed">
                        출고 완료된 태그입니다. 필요시 제품을 변경하거나 URL을 덮어써 재발행할 수 있습니다.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-2xl border border-emerald-200/80 shadow-sm shrink-0">
                    총 {nfcLinkedList.length}건
                  </span>
                </div>

                {/* 섹션 ② 필터바 */}
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="relative flex items-center">
                    <Search className="absolute left-3.5 w-4 h-4 text-slate-300" />
                    <input 
                      type="text"
                      placeholder="태그 UID 검색"
                      value={nfcSearchUid}
                      onChange={(e) => {
                        setNfcSearchUid(e.target.value);
                        setCurrentPageNfcLinked(1);
                      }}
                      className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 text-xs font-bold outline-none focus:border-emerald-200 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="relative flex items-center">
                    <Award className="absolute left-3.5 w-4 h-4 text-slate-300" />
                    <input 
                      type="text"
                      placeholder="보증서 일련번호 검색"
                      value={nfcFilterCertSerial}
                      onChange={(e) => {
                        setNfcFilterCertSerial(e.target.value);
                        setCurrentPageNfcLinked(1);
                      }}
                      className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 text-xs font-bold outline-none focus:border-emerald-200 focus:bg-white transition-all"
                    />
                  </div>
                  <select
                    value={nfcFilterProductId}
                    onChange={(e) => {
                      setNfcFilterProductId(e.target.value);
                      setCurrentPageNfcLinked(1);
                    }}
                    className="h-11 bg-slate-50 border border-slate-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-emerald-200 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="">모든 제품 보기</option>
                    {products.map(p => (
                      <option key={p.id} value={String(p.id)}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  {nfcLinkedList
                    .slice((currentPageNfcLinked - 1) * ITEMS_PER_PAGE, currentPageNfcLinked * ITEMS_PER_PAGE)
                    .map((t: any) => (
                      <div
                        key={`lk-${t.id}-${t.tag_uid}`}
                        className="flex flex-col lg:flex-row lg:items-center gap-4 py-4 px-4 sm:px-6 bg-slate-50/40 hover:bg-white hover:border-emerald-200 border border-slate-100/80 rounded-2xl transition-all duration-300 hover:shadow-lg hover:shadow-emerald-50/20"
                      >
                        <div className="flex items-start gap-3.5 flex-1 min-w-0 select-none">
                          <div className="w-11 h-11 shrink-0 rounded-2xl bg-white flex items-center justify-center text-emerald-600 border border-emerald-100/60 shadow-sm">
                            <LinkIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="font-black text-slate-800 text-sm sm:text-base break-all leading-snug">{t.tag_uid}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-[10px] font-black tracking-wider uppercase bg-emerald-50 border border-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl">
                                {t.target_name || '(알 수 없음)'}
                              </span>
                              <span className="text-[10px] font-bold bg-white text-slate-500 border border-slate-100 px-2 py-0.5 rounded-xl flex items-center gap-1">
                                <span>등록</span>
                                {t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}
                              </span>
                              {t.product_sold_at ? (
                                <span className="text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-xl flex items-center gap-1 animate-pulse">
                                  판매완료
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row sm:items-center gap-2 shrink-0 self-start lg:self-center w-full lg:w-auto">
                          <button
                            type="button"
                            onClick={() => openMatchWorkbench(t.tag_uid)}
                            className="h-10 flex-1 lg:flex-initial lg:px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.98] select-none"
                          >
                            <LinkIcon className="w-4 h-4" />
                            <span>제품 변경 매칭</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnmapTagClick(t)}
                            className="h-10 flex-1 lg:flex-initial lg:px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-black hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-sm select-none"
                          >
                            <Link2Off className="w-4 h-4" />
                            <span>매칭 해제</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  {nfcLinkedList.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200/80">
                      <LinkIcon className="w-12 h-12 text-slate-200 mb-2" />
                      <p className="text-xs sm:text-sm font-black text-slate-400">매칭된 태그 데이터가 없습니다.</p>
                    </div>
                  )}
                </div>

                {nfcLinkedList.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-center items-center gap-2 mt-6 flex-wrap max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <button
                      disabled={currentPageNfcLinked === 1}
                      onClick={() => setCurrentPageNfcLinked((p) => p - 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm shrink-0"
                    >
                      이전
                    </button>
                    {Array.from({ length: Math.ceil(nfcLinkedList.length / ITEMS_PER_PAGE) }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentPageNfcLinked(i + 1)}
                        className={`w-10 h-10 text-xs font-black rounded-xl border transition-all shrink-0 ${
                          currentPageNfcLinked === i + 1
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-md font-black scale-105'
                            : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      disabled={currentPageNfcLinked === Math.ceil(nfcLinkedList.length / ITEMS_PER_PAGE)}
                      onClick={() => setCurrentPageNfcLinked((p) => p + 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm shrink-0"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          )}

          {/* 4. 골드바 정품인증 관리 탭 */}
          {currentTab === 'goldbars' && (
            <>
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black text-slate-900">골드바 정품인증 관리</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">정품인증서(보증서)를 등록·수정·삭제합니다.</p>
                </div>
                <button onClick={() => setIsGoldbarModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white font-black py-3.5 px-6 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all"><Award className="w-5 h-5" /> 골드바 & 보증서 등록</button>
              </div>

              {/* 검색 및 필터 패널 */}
              <div className="bg-white rounded-3xl p-5 border border-slate-100 flex flex-col sm:flex-row items-center gap-4 shadow-sm">
                <div className="flex-1 relative flex items-center w-full">
                  <Search className="absolute left-4 w-5 h-5 text-slate-300" />
                  <input 
                    type="text" 
                    placeholder="일련번호 검색 (예: GB)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-12 bg-slate-50 rounded-xl pl-12 pr-4 text-sm font-bold border border-transparent focus:border-amber-200 focus:bg-white outline-none transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select 
                    value={filterPurity} 
                    onChange={(e) => setFilterPurity(e.target.value)}
                    className="h-12 bg-slate-50 rounded-xl px-4 text-sm font-bold border-none outline-none ring-1 ring-slate-100 cursor-pointer flex-1 sm:flex-initial"
                  >
                    <option value="">순도 전체</option>
                    <option value="99.99%">99.99%</option>
                    <option value="99.9%">99.9%</option>
                    <option value="24K">24K</option>
                  </select>
                </div>
              </div>

              {/* 골드바 리스트 */}
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredGoldbars.slice((currentPageGoldbars - 1) * ITEMS_PER_PAGE, currentPageGoldbars * ITEMS_PER_PAGE).map((g) => (
                  <div key={g.id} className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-slate-100 flex flex-col gap-3 sm:gap-4 hover:border-amber-400/50 hover:shadow-xl transition-all group w-full min-w-0 max-w-full overflow-hidden">
                    <div className="flex gap-2 sm:gap-3 w-full min-w-0 items-start">
                      <div className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500"><Award className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-slate-800 text-base sm:text-lg break-words line-clamp-3">
                          {g.display_name ? (
                            <>
                              <span className="block line-clamp-2">{g.display_name}</span>
                              <span className="block text-xs font-mono font-bold text-slate-500 mt-1">{g.serial_number}</span>
                            </>
                          ) : (
                            <>일련번호: {g.serial_number}</>
                          )}
                        </h4>
                        <p className="text-xs font-bold text-slate-400 mt-0.5">등록일: {new Date(g.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="shrink-0 flex flex-col sm:flex-row items-end gap-0.5">
                        <button type="button" onClick={() => handleEditOpen(g)} className="p-2 rounded-lg sm:rounded-xl hover:bg-slate-50 text-slate-400 hover:text-amber-600 transition-all" aria-label="수정">
                          <Edit3 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </button>
                        <button type="button" onClick={() => handleDeleteGoldbar(g.id)} className="p-2 rounded-lg sm:rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all" aria-label="삭제">
                          <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4 bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100/60 text-sm min-w-0">
                      <div className="min-w-0">
                        <span className="text-slate-400 font-bold block text-[11px]">중량</span>
                        <span className="font-black text-slate-700 break-words">{g.weight}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-400 font-bold block text-[11px]">제조일자</span>
                        <span className="font-black text-slate-700 break-words">{g.minted_at || '-'}</span>
                      </div>
                      <div className="col-span-2 border-t border-slate-100 pt-2 mt-1 flex justify-between items-center min-w-0">
                        <span className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl font-black shrink-0">{g.purity}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredGoldbars.length === 0 && (
                  <div className="col-span-2 bg-white rounded-3xl border border-slate-100 p-12 flex flex-col items-center justify-center text-center">
                    <Award className="w-16 h-16 text-slate-200 mb-4" />
                    <p className="font-black text-slate-400">등록된 골드바가 없거나 검색 결과가 없습니다.</p>
                  </div>
                )}
              </div>

              {/* 골드바 페이지네이션 */}
              {filteredGoldbars.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center items-center gap-2 mt-6 flex-wrap max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                  <button
                    disabled={currentPageGoldbars === 1}
                    onClick={() => setCurrentPageGoldbars(p => p - 1)}
                    className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                  >
                    이전
                  </button>
                  {Array.from({ length: Math.ceil(filteredGoldbars.length / ITEMS_PER_PAGE) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPageGoldbars(i + 1)}
                      className={`w-10 h-10 text-xs font-black rounded-xl border transition-all shrink-0 ${currentPageGoldbars === i + 1 ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-md' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={currentPageGoldbars === Math.ceil(filteredGoldbars.length / ITEMS_PER_PAGE)}
                    onClick={() => setCurrentPageGoldbars(p => p + 1)}
                    className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}

          {currentTab === 'assetMarket' && (
            <>
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">자산별 시세 및 유통 관리</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    실물 태그와 연결된 자산별로 시세를 설정하고 유통 현황(제품 매칭, 출고일)을 관리합니다.
                  </p>
                </div>
                <button
                  onClick={fetchAssets}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-black text-xs rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAssets ? 'animate-spin' : ''}`} /> 새로고침
                </button>
              </div>

              {/* 일괄 시세 설정 패널 */}
              <div className="mt-6 bg-white p-6 sm:p-8 rounded-[2.5rem] border border-amber-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center">
                      <Activity className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800">일괄 시세 설정</h3>
                      <p className="text-[10px] font-bold text-slate-400">선택한 여러 자산에 동일한 시세를 한 번에 적용합니다.</p>
                    </div>
                  </div>
                  {selectedAssetIds.length > 0 && (
                    <span className="px-3 py-1 bg-amber-500 text-white text-[10px] font-black rounded-full animate-pulse">
                      {selectedAssetIds.length}개 선택됨
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">1g당 매입 시세 (원)</label>
                    <input
                      type="number"
                      placeholder="예: 115000"
                      value={bulkMarketPrice}
                      onChange={(e) => setBulkMarketPrice(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-black text-sm outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">시세 노출</label>
                    <div className="flex h-12 items-center gap-2">
                      <button
                        onClick={() => setBulkShowMarket(true)}
                        className={`flex-1 h-full rounded-xl font-black text-xs transition-all ${bulkShowMarket ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}
                      >
                        ON
                      </button>
                      <button
                        onClick={() => setBulkShowMarket(false)}
                        className={`flex-1 h-full rounded-xl font-black text-xs transition-all ${!bulkShowMarket ? 'bg-slate-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}
                      >
                        OFF
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">시작일 (선택)</label>
                    <input
                      type="date"
                      value={bulkShowStart}
                      onChange={(e) => setBulkShowStart(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-sm outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">종료일 (선택)</label>
                    <input
                      type="date"
                      value={bulkShowEnd}
                      onChange={(e) => setBulkShowEnd(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => {
                      const allIds = assets.map(a => a.id || a.tag_uid);
                      if (selectedAssetIds.length === allIds.length) setSelectedAssetIds([]);
                      else setSelectedAssetIds(allIds);
                    }}
                    className="px-6 h-12 bg-slate-100 text-slate-600 font-black text-xs rounded-xl hover:bg-slate-200 transition-all"
                  >
                    {selectedAssetIds.length === (assets.length) ? '전체 해제' : '전체 선택'}
                  </button>
                  <button
                    onClick={handleBulkApplyAssetMarket}
                    disabled={submitting || selectedAssetIds.length === 0}
                    className="flex-1 h-12 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {selectedAssetIds.length}개 자산에 시세 적용하기
                  </button>
                </div>
              </div>

              {/* 고도화된 아코디언 리스트 UI */}
              <div className="mt-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="p-5 w-14 text-center">
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.length === assets.length && assets.length > 0}
                            onChange={() => {
                              const allIds = assets.map(a => a.id || a.tag_uid);
                              if (selectedAssetIds.length === allIds.length) setSelectedAssetIds([]);
                              else setSelectedAssetIds(allIds);
                            }}
                            className="w-5 h-5 rounded-lg border-slate-200 text-amber-500 focus:ring-amber-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">상태 & 자산 정보</th>
                        <th className="p-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">매칭 제품</th>
                        <th className="p-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest hidden lg:table-cell">태그 UID</th>
                        <th className="p-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">상세설정</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {assets.length > 0 ? (
                        assets.slice((currentPageAssets - 1) * ITEMS_PER_PAGE, currentPageAssets * ITEMS_PER_PAGE).map((asset) => {
                          const assetKey = asset.id || asset.tag_uid;
                          const isExpanded = expandedAssetId === assetKey;
                          const isSelected = selectedAssetIds.includes(assetKey);
                          
                          return (
                            <Fragment key={assetKey}>
                              <tr 
                                className={`group hover:bg-slate-50/80 transition-colors cursor-pointer ${isSelected ? 'bg-amber-50/30' : ''}`}
                                onClick={() => setExpandedAssetId(isExpanded ? null : assetKey)}
                              >
                                <td className="p-5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      setSelectedAssetIds(prev => 
                                        prev.includes(assetKey) ? prev.filter(v => v !== assetKey) : [...prev, assetKey]
                                      );
                                    }}
                                    className="w-5 h-5 rounded-lg border-slate-200 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                  />
                                </td>
                                <td className="p-5">
                                  <div className="flex items-center gap-3">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
                                      asset.id ? 'text-amber-600 bg-amber-50 border-amber-200/50' : 'text-slate-500 bg-slate-50 border-slate-200/50'
                                    }`}>
                                      {asset.id ? 'CERTIFIED' : 'TAG ONLY'}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-black text-slate-800 truncate">{asset.serial_number || '보증서 미발행'}</p>
                                      <p className="text-[10px] font-bold text-slate-400">
                                        {asset.matching_date ? `매칭일: ${new Date(asset.matching_date).toLocaleDateString()}` : '출고 대기'}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-5 hidden sm:table-cell">
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-slate-700 truncate">{asset.product_name || '-'}</p>
                                    <p className="text-[10px] font-bold text-slate-400">{asset.weight}g · {asset.purity}</p>
                                  </div>
                                </td>
                                <td className="p-5 hidden lg:table-cell">
                                  <code className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                                    {formatCertTagForUi(asset.tag_uid || '')}
                                  </code>
                                </td>
                                <td className="p-5 text-right">
                                  <button className={`p-2 rounded-xl transition-all ${isExpanded ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                </td>
                              </tr>
                              
                              {isExpanded && (
                                <tr className="bg-slate-50/30">
                                  <td colSpan={5} className="p-8">
                                    <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 flex-1 w-full">
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">1g당 개별 시세 (원)</label>
                                          <div className="relative flex items-center">
                                            <input 
                                              type="number" 
                                              defaultValue={asset.market_price_per_gram || 0} 
                                              onBlur={(e) => handleUpdateAssetMarket(asset, { market_price_per_gram: Number(e.target.value) })}
                                              className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-4 font-black text-xs outline-none focus:border-amber-400 transition-all pr-10" 
                                            />
                                            <span className="absolute right-4 text-[10px] font-bold text-slate-400">원</span>
                                          </div>
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">시세 노출 상태</label>
                                          <div className="flex h-11 items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                                            <button
                                              onClick={() => handleUpdateAssetMarket(asset, { show_market_price: true })}
                                              className={`flex-1 h-full rounded-lg font-black text-[10px] transition-all ${asset.show_market_price ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
                                            >
                                              노출
                                            </button>
                                            <button
                                              onClick={() => handleUpdateAssetMarket(asset, { show_market_price: false })}
                                              className={`flex-1 h-full rounded-lg font-black text-[10px] transition-all ${!asset.show_market_price ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
                                            >
                                              비노출
                                            </button>
                                          </div>
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">시작일</label>
                                          <input 
                                            type="date" 
                                            defaultValue={asset.show_start_at ? asset.show_start_at.split('T')[0] : ''} 
                                            onChange={(e) => handleUpdateAssetMarket(asset, { show_start_at: e.target.value })}
                                            className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-4 font-bold text-xs outline-none focus:border-amber-400" 
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">종료일</label>
                                          <input 
                                            type="date" 
                                            defaultValue={asset.show_end_at ? asset.show_end_at.split('T')[0] : ''} 
                                            onChange={(e) => handleUpdateAssetMarket(asset, { show_end_at: e.target.value })}
                                            className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-4 font-bold text-xs outline-none focus:border-amber-400" 
                                          />
                                        </div>
                                      </div>
                                      
                                      <div className="shrink-0 flex items-center gap-2 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 w-full lg:w-auto">
                                        <button
                                          onClick={() => {
                                            setSelectedAssetIds(prev => 
                                              prev.includes(assetKey) ? prev.filter(v => v !== assetKey) : [...prev, assetKey]
                                            );
                                          }}
                                          className={`flex-1 lg:flex-none px-5 h-11 rounded-xl font-black text-xs transition-all border ${
                                            isSelected ? 'bg-amber-500 text-white border-transparent shadow-md shadow-amber-500/20' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                          }`}
                                        >
                                          {isSelected ? '선택 취소' : '항목 선택'}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-20 text-center">
                            <Box className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <p className="font-black text-slate-400">등록된 자산이 없거나 데이터를 불러오는 중입니다.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 자산 리스트 페이지네이션 */}
              {assets.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  <button
                    disabled={currentPageAssets === 1}
                    onClick={() => setCurrentPageAssets(p => p - 1)}
                    className="h-11 px-4 text-xs font-black bg-white rounded-2xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                  >
                    이전
                  </button>
                  {Array.from({ length: Math.ceil(assets.length / ITEMS_PER_PAGE) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPageAssets(i + 1)}
                      className={`w-11 h-11 text-xs font-black rounded-2xl border transition-all shrink-0 ${
                        currentPageAssets === i + 1 
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-md' 
                          : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={currentPageAssets === Math.ceil(assets.length / ITEMS_PER_PAGE)}
                    onClick={() => setCurrentPageAssets(p => p + 1)}
                    className="h-11 px-4 text-xs font-black bg-white rounded-2xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}

          {/* 6. 소유권 해지 요청 관리 탭 */}
          {currentTab === 'releaseRequests' && (
            <>
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">소유권 해지(재판매) 요청 관리</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    사용자가 신청한 소유권 해지 요청을 검토하고 승인합니다. 승인 시 사용자의 지갑에서 제품이 제거됩니다.
                  </p>
                </div>
                <button
                  onClick={fetchReleaseRequests}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-black text-xs rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRelease ? 'animate-spin' : ''}`} /> 새로고침
                </button>
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeReleaseRequests.length > 0 ? (
                  activeReleaseRequests.map((req) => (
                    <div key={req.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:border-rose-400/50 hover:shadow-md transition-all flex flex-col justify-between gap-5 relative overflow-hidden group">
                      <div className="absolute -right-4 -top-4 w-20 h-20 bg-rose-50/40 rounded-full blur-2xl group-hover:bg-rose-100/40 transition-colors"></div>
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="text-[10px] font-black uppercase text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/40 tracking-widest">
                            RELEASE REQUEST
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">{new Date(req.requested_at).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">USER</p>
                            <h4 className="text-sm font-black text-slate-800 break-all">{req.user_email}</h4>
                            <p className="text-xs font-bold text-slate-500">{req.user_name || '이름 없음'}</p>
                          </div>
                          
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/60">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GOLDBAR</p>
                            <p className="text-xs font-black text-slate-800">{req.serial_number}</p>
                            <p className="text-[10px] font-bold text-slate-500">{req.weight}g</p>
                          </div>

                          {req.message && (
                            <div className="bg-amber-50/40 p-3 rounded-2xl border border-amber-100/40">
                              <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">MESSAGE</p>
                              <p className="text-xs font-bold text-slate-600 italic">"{req.message}"</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleHandleRelease(req.id, 'APPROVE')}
                          className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => handleHandleRelease(req.id, 'REJECT')}
                          className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs rounded-xl transition-all"
                        >
                          반려
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                      <Bookmark className="w-8 h-8" />
                    </div>
                    <p className="font-black text-slate-400 text-sm">대기 중인 해지 요청이 없습니다.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* 제품 등록 모달 (이미지 파일 업로드 및 자동 리사이징) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsProductModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">순수 제품 등록</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleProductSubmit} className="p-8 space-y-4 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">품명 *</label>
                 <input required type="text" placeholder="예: 골드바3.75g" value={productFormData.name} onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent hover:border-primary/20 focus:border-primary/50 focus:bg-white transition-all" />
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">소재</label>
                   <input type="text" placeholder="예: 999.9" value={productFormData.material} onChange={(e) => setProductFormData({ ...productFormData, material: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">금 함량</label>
                   <select value={productFormData.purity} onChange={(e) => setProductFormData({ ...productFormData, purity: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-3 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all cursor-pointer">
                     <option value="24K">24K</option>
                     <option value="18K">18K</option>
                     <option value="14K">14K</option>
                   </select>
                 </div>
               </div>

               <div className="space-y-2 relative">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">중량(g)</label>
                 <input type="text" placeholder="예: 3.75" value={productFormData.weight} onChange={(e) => setProductFormData({ ...productFormData, weight: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">g</span>
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2 relative">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가로 길이(mm)</label>
                   <input type="text" placeholder="예: 17" value={productFormData.width_mm} onChange={(e) => setProductFormData({ ...productFormData, width_mm: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                   <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                 </div>
                 <div className="space-y-2 relative">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">세로 길이(mm)</label>
                   <input type="text" placeholder="예: 25" value={productFormData.height_mm} onChange={(e) => setProductFormData({ ...productFormData, height_mm: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                   <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                 </div>
               </div>

               <div className="space-y-2 relative">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가격</label>
                 <input type="number" placeholder="예: 850000" value={productFormData.price} onChange={(e) => setProductFormData({ ...productFormData, price: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">원</span>
               </div>

               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">메모</label>
                 <input type="text" placeholder="메모를 입력해 주세요" value={productFormData.memo} onChange={(e) => setProductFormData({ ...productFormData, memo: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
               </div>

               <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 space-y-2">
                 <label className="text-xs font-black text-slate-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                   <Award className="w-4 h-4 text-amber-600 shrink-0" />
                   정품인증서(보증서) 연결
                 </label>
                 <p className="text-[11px] font-bold text-slate-500 pl-1 leading-relaxed">
                   골드바 정품인증 관리에 등록된 보증서입니다. 일련번호·보증서명(표시명)·NFC UID로 검색할 수 있습니다. NFC는 나중에 연결해도 목록에 표시됩니다.
                 </p>
                 <ProductCertificatePicker
                   buttonId="product-cert-picker-create"
                   value={productFormData.certificate_id}
                   options={certificateCatalog}
                   searchQuery={certificateSearchQuery}
                   onSearchQueryChange={setCertificateSearchQuery}
                   onChange={(v) => {
                     setCertificateSearchQuery('');
                     setProductFormData({ ...productFormData, certificate_id: v });
                   }}
                 />
               </div>

               <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1.5">
                 <p className="text-xs font-bold text-slate-500">
                   현재 금 시세 :{' '}
                   <span className="text-slate-800 font-black">{formatProductGoldSummary(productFormData.weight, productFormData.price).totalStr}</span>
                 </p>
                 <p className="text-xs font-bold text-slate-500">
                   g 당 금 시세 :{' '}
                   <span className="text-slate-800 font-black">{formatProductGoldSummary(productFormData.weight, productFormData.price).perG}</span>
                 </p>
               </div>

               <div className="pt-2 border-t border-slate-100 space-y-4">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">추가 · 옵션 및 미디어</p>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제품 옵션 (콤마로 구분)</label>
                   <input type="text" placeholder="예: 골드, 실버, 로즈골드" value={productFormData.options} onChange={(e) => setProductFormData({ ...productFormData, options: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">상세 설명</label>
                   <textarea rows={2} value={productFormData.description} onChange={(e) => setProductFormData({ ...productFormData, description: e.target.value })} className="w-full p-4 bg-slate-100/50 rounded-xl font-bold outline-none resize-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100/80">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제품 이미지 업로드 (자동 500x500 압축)</label>
                   <div className="mt-2 flex flex-wrap items-center gap-3">
                     <label className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-2 shadow-sm">
                       <FileText className="w-4 h-4" /> 이미지 파일 선택
                       <input type="file" accept="image/*" onChange={(e) => handleProductImageChange(e, 'create')} className="hidden" />
                     </label>
                     <span className="text-xs font-bold text-slate-400 line-clamp-1 flex-1 min-w-0">{productFormData.file_name || '선택된 파일이 없습니다.'}</span>
                   </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 tracking-widest pl-1">영상 URL</label>
                    <input type="text" inputMode="url" placeholder="https://..." value={productFormData.video_url} onChange={(e) => setProductFormData({ ...productFormData, video_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 tracking-widest pl-1">매뉴얼 URL</label>
                    <input type="text" inputMode="url" placeholder="https://..." value={productFormData.manual_url} onChange={(e) => setProductFormData({ ...productFormData, manual_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
                   </div>
                 </div>
               </div>

               <button type="submit" disabled={submitting} className="w-full h-16 purple-btn text-lg font-black shadow-xl shadow-primary/30 mt-2 disabled:opacity-50">
                 {submitting && <Loader2 className="w-5 h-5 animate-spin" />} 정보 저장
               </button>
            </form>
          </div>
        </div>
      )}

      {/* 제품 정보 수정 모달 */}
      {isEditProductModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsEditProductModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">제품 정보 수정</h3>
              <button onClick={() => setIsEditProductModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleEditProductSubmit} className="p-8 space-y-4 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">품명 *</label>
                 <input required type="text" placeholder="예: 골드바3.75g" value={editProductFormData.name} onChange={(e) => setEditProductFormData({ ...editProductFormData, name: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent hover:border-primary/20 focus:border-primary/50 focus:bg-white transition-all" />
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">소재</label>
                   <input type="text" placeholder="예: 999.9" value={editProductFormData.material} onChange={(e) => setEditProductFormData({ ...editProductFormData, material: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">금 함량</label>
                   <select value={editProductFormData.purity} onChange={(e) => setEditProductFormData({ ...editProductFormData, purity: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-3 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all cursor-pointer">
                     <option value="24K">24K</option>
                     <option value="18K">18K</option>
                     <option value="14K">14K</option>
                   </select>
                 </div>
               </div>

               <div className="space-y-2 relative">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">중량(g)</label>
                 <input type="text" placeholder="예: 3.75" value={editProductFormData.weight} onChange={(e) => setEditProductFormData({ ...editProductFormData, weight: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">g</span>
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2 relative">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가로 길이(mm)</label>
                   <input type="text" placeholder="예: 17" value={editProductFormData.width_mm} onChange={(e) => setEditProductFormData({ ...editProductFormData, width_mm: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                   <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                 </div>
                 <div className="space-y-2 relative">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">세로 길이(mm)</label>
                   <input type="text" placeholder="예: 25" value={editProductFormData.height_mm} onChange={(e) => setEditProductFormData({ ...editProductFormData, height_mm: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                   <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                 </div>
               </div>

               <div className="space-y-2 relative">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가격</label>
                 <input type="number" placeholder="예: 850000" value={editProductFormData.price} onChange={(e) => setEditProductFormData({ ...editProductFormData, price: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">원</span>
               </div>

               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">메모</label>
                 <input type="text" placeholder="메모를 입력해 주세요" value={editProductFormData.memo} onChange={(e) => setEditProductFormData({ ...editProductFormData, memo: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
               </div>

               <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 space-y-2">
                 <label className="text-xs font-black text-slate-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                   <Award className="w-4 h-4 text-amber-600 shrink-0" />
                   정품인증서(보증서) 연결
                 </label>
                 <p className="text-[11px] font-bold text-slate-500 pl-1 leading-relaxed">
                   골드바 정품인증 관리에 등록된 보증서입니다. 일련번호·보증서명·NFC UID로 검색할 수 있습니다.
                 </p>
                 <ProductCertificatePicker
                   buttonId="product-cert-picker-edit"
                   value={editProductFormData.certificate_id}
                   options={certificateCatalog}
                   searchQuery={certificateSearchQuery}
                   onSearchQueryChange={setCertificateSearchQuery}
                   onChange={(v) => {
                     setCertificateSearchQuery('');
                     setEditProductFormData({ ...editProductFormData, certificate_id: v });
                   }}
                 />
               </div>

               <label className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/40 px-4 py-3 cursor-pointer">
                 <input
                   type="checkbox"
                   checked={editProductFormData.sold}
                   onChange={(e) => setEditProductFormData({ ...editProductFormData, sold: e.target.checked })}
                   className="mt-1 size-4 rounded border-rose-200 text-rose-600 focus:ring-rose-400"
                 />
                 <span className="text-xs font-bold text-slate-700 leading-relaxed">
                   <span className="font-black text-rose-800">판매 완료</span>로 표시합니다. 표시 후 이 제품에 매칭된 태그는 관리자 화면에서 바로 해제할 수 없으며, NFC로 태그를 스캔해 인증한 뒤에만 매칭 해제됩니다.
                 </span>
               </label>

               <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1.5">
                 <p className="text-xs font-bold text-slate-500">
                   현재 금 시세 :{' '}
                   <span className="text-slate-800 font-black">{formatProductGoldSummary(editProductFormData.weight, editProductFormData.price).totalStr}</span>
                 </p>
                 <p className="text-xs font-bold text-slate-500">
                   g 당 금 시세 :{' '}
                   <span className="text-slate-800 font-black">{formatProductGoldSummary(editProductFormData.weight, editProductFormData.price).perG}</span>
                 </p>
               </div>

               <div className="pt-2 border-t border-slate-100 space-y-4">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">추가 · 옵션 및 미디어</p>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제품 옵션 (콤마로 구분)</label>
                   <input type="text" placeholder="예: 골드, 실버, 로즈골드" value={editProductFormData.options} onChange={(e) => setEditProductFormData({ ...editProductFormData, options: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">상세 설명</label>
                   <textarea rows={2} value={editProductFormData.description} onChange={(e) => setEditProductFormData({ ...editProductFormData, description: e.target.value })} className="w-full p-4 bg-slate-100/50 rounded-xl font-bold outline-none resize-none border border-transparent focus:border-primary/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100/80">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제품 이미지 교체 (자동 500x500 압축)</label>
                   <div className="mt-2 flex flex-wrap items-center gap-3">
                     <label className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-2 shadow-sm">
                       <FileText className="w-4 h-4" /> 이미지 파일 선택
                       <input type="file" accept="image/*" onChange={(e) => handleProductImageChange(e, 'edit')} className="hidden" />
                     </label>
                     <span className="text-xs font-bold text-slate-400 line-clamp-1 flex-1 min-w-0">{editProductFormData.file_name || '파일을 변경하지 않으려면 비워 두세요.'}</span>
                   </div>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 tracking-widest pl-1">영상 URL</label>
                    <input type="text" inputMode="url" placeholder="https://..." value={editProductFormData.video_url} onChange={(e) => setEditProductFormData({ ...editProductFormData, video_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 tracking-widest pl-1">매뉴얼 URL</label>
                    <input type="text" inputMode="url" placeholder="https://..." value={editProductFormData.manual_url} onChange={(e) => setEditProductFormData({ ...editProductFormData, manual_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
                   </div>
                 </div>
               </div>

               <button type="submit" disabled={submitting} className="w-full h-16 purple-btn text-lg font-black shadow-xl shadow-primary/30 mt-2 disabled:opacity-50">
                 {submitting && <Loader2 className="w-5 h-5 animate-spin" />} 수정 완료
               </button>
            </form>
          </div>
        </div>
      )}

      {unmapSoldModalTag && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setUnmapSoldModalTag(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-3xl shadow-2xl p-6 sm:p-8 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">판매 완료 제품 — NFC 인증</h3>
                <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                  아래 링크로 태그를 스캔(또는 열기)한 뒤, 15분 이내에 여기서 해제를 완료하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUnmapSoldModalTag(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs font-mono font-bold text-slate-800 break-all bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3">
              {unmapSoldModalTag.tag_uid}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <button
                type="button"
                onClick={() => copyUnmapScanUrl(unmapSoldModalTag.tag_uid)}
                className="flex-1 h-11 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-black hover:bg-slate-50"
              >
                인증 URL 복사
              </button>
              <a
                href={`/t/${encodeURIComponent(unmapSoldModalTag.tag_uid)}?unmap=1`}
                className="flex-1 h-11 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center justify-center no-underline hover:bg-slate-800"
              >
                이 기기에서 열기
              </a>
            </div>
            <button
              type="button"
              onClick={async () => {
                const ok = await executeTagUnmap(unmapSoldModalTag.tag_uid);
                if (ok) setUnmapSoldModalTag(null);
              }}
              className="w-full h-12 rounded-xl bg-rose-600 text-white text-sm font-black hover:bg-rose-700 transition-all"
            >
              스캔 완료 — 매칭 해제 실행
            </button>
          </div>
        </div>
      )}

      {guaranteePdfPayload && (
        <GuaranteePdfHost data={guaranteePdfPayload} onDone={() => setGuaranteePdfPayload(null)} />
      )}

      <GuaranteeCertificatePreviewModal data={guaranteePreviewData} onClose={() => setGuaranteePreviewData(null)} />

      {/* NFC 태그 관리 모달 (NFC 전용 도구) */}
      {isNfcModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsNfcModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] border border-slate-200/50">
            <header className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 via-emerald-50/40 to-teal-50/50 select-none">
               <div className="flex items-center gap-3">
                 <div className="w-12 h-12 rounded-2xl bg-emerald-100/60 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shadow-sm">
                   <Tag className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">NFC 태그 발행</h3>
                   <p className="text-xs font-bold text-emerald-600/90 mt-0.5 leading-relaxed">
                     자산으로 등록하거나, 출고와 함께 제품에 매핑합니다.
                   </p>
                 </div>
               </div>
               <button
                 type="button"
                 onClick={() => setIsNfcModalOpen(false)}
                 className="p-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all shadow-sm active:scale-[0.96] outline-none"
               >
                 <X className="w-5 h-5" />
               </button>
            </header>
            <form onSubmit={handleNfcMappingSubmit} className="p-6 sm:p-8 space-y-6 sm:space-y-7 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8 flex-1 [scrollbar-width:thin]">
               <div className="flex bg-slate-50 border border-slate-100/80 rounded-2xl p-1.5 gap-1.5 shadow-inner">
                 <button
                   type="button"
                   disabled={!!nfcExistingSnapshot?.hasProduct}
                   title={
                     nfcExistingSnapshot?.hasProduct
                       ? '제품이 연결된 태그는 자산만 모드로 덮어쓸 수 없습니다'
                       : undefined
                   }
                   onClick={() => setNfcRegisterMode('asset')}
                   className={`flex-1 py-3 px-2 rounded-xl text-xs sm:text-sm font-black transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed select-none outline-none ${
                     nfcRegisterMode === 'asset'
                       ? 'bg-white text-emerald-800 shadow-md font-black'
                       : 'text-slate-400 hover:text-slate-600 hover:bg-white/40'
                   }`}
                 >
                   <Box className="w-4 h-4 shrink-0" />
                   <span>빈 태그 자산 등록</span>
                 </button>
                 <button
                   type="button"
                   onClick={() => setNfcRegisterMode('product')}
                   className={`flex-1 py-3 px-2 rounded-xl text-xs sm:text-sm font-black transition-all duration-300 flex items-center justify-center gap-2 select-none outline-none ${
                     nfcRegisterMode === 'product'
                       ? 'bg-white text-emerald-800 shadow-md font-black'
                       : 'text-slate-400 hover:text-slate-600 hover:bg-white/40'
                   }`}
                 >
                   <LinkIcon className="w-4 h-4 shrink-0" />
                   <span>제품과 함께 매핑</span>
                 </button>
               </div>

               {nfcExistingSnapshot && nfcFormData.tag_uid && (
                 <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4.5 space-y-3 shadow-sm select-none animate-in fade-in-50 duration-200">
                   <div className="flex items-center gap-1.5">
                     <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
                     <p className="text-[11px] font-black uppercase tracking-wider text-blue-800">현재 시스템 등록 정보</p>
                   </div>
                   <div className="space-y-1 pl-3 border-l-2 border-blue-200/60">
                     <p className="text-xs font-bold text-blue-950 break-all flex items-center gap-1.5 leading-snug">
                       <span className="text-blue-500/80 font-black shrink-0">UID</span>
                       <span className="font-mono bg-white px-2 py-0.5 rounded border border-blue-100/80 text-blue-900 text-[11px] font-black">
                         {nfcFormData.tag_uid}
                       </span>
                     </p>
                     {nfcExistingSnapshot.hasProduct ? (
                       <p className="text-xs font-bold text-blue-900 leading-snug">
                         연결 제품: <span className="font-black text-blue-950">{nfcExistingSnapshot.productName || '—'}</span>
                       </p>
                     ) : (
                       <p className="text-xs font-bold text-blue-900 leading-snug">
                         상태: <span className="font-black text-blue-950">자산만 등록 (제품 미연결)</span>
                       </p>
                     )}
                     {nfcExistingSnapshot.createdAt && (
                       <p className="text-[11px] font-bold text-blue-800/80 leading-snug">
                         등록일: {new Date(nfcExistingSnapshot.createdAt).toLocaleString('ko-KR')}
                       </p>
                     )}
                   </div>
                   <p className="text-[10px] sm:text-[11px] font-bold text-blue-800/80 leading-relaxed pt-2 border-t border-blue-100/80">
                     * 하단에서 모드·제품을 바꾼 뒤 확정하면 위 내용이 새 설정으로 갱신(덮어쓰기)됩니다.
                   </p>
                 </div>
               )}

               {/* 1. 태그 읽기 */}
               <div className="space-y-3">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">1단계: 태그 스캔</label>
                 <div className="flex gap-3">
                    <div className="flex-1 h-14 bg-slate-50 border border-slate-200/60 rounded-2xl flex items-center px-5 font-mono font-black text-base sm:text-lg text-emerald-800 shadow-inner select-none transition-all">
                      {nfcFormData.tag_uid || <span className="text-slate-300 font-sans">UID 대기 중...</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNFCScan('nfc')}
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 active:scale-[0.96] shadow-sm shrink-0 border select-none outline-none ${
                        nfcScanning
                          ? 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse ring-4 ring-amber-50'
                          : 'bg-white border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {nfcScanning ? <Loader2 className="w-6 h-6 animate-spin" /> : <Smartphone className="w-6 h-6" />}
                    </button>
                 </div>
               </div>

               {/* 2. 제품 선택 — 제품 모드에서만 */}
               {nfcRegisterMode === 'product' ? (
                 <div className="space-y-3">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">2단계: 제품 연결</label>
                   <div className="relative">
                     <select 
                       required={nfcRegisterMode === 'product'}
                       value={nfcFormData.product_id}
                       onChange={(e) => setNfcFormData({...nfcFormData, product_id: e.target.value})}
                       className="w-full h-14 bg-slate-50 border border-slate-200/60 hover:border-slate-300 rounded-2xl pl-5 pr-12 font-bold outline-none ring-slate-100/50 appearance-none transition-all duration-200 text-slate-800 cursor-pointer text-sm"
                     >
                       <option value="">출고할 제품을 선택하세요</option>
                       {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                     <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                       <ChevronDown className="w-4 h-4" />
                     </div>
                   </div>
                 </div>
               ) : (
                 <div className="rounded-2xl border border-amber-100/80 bg-amber-50/40 p-4.5 space-y-1.5 select-none animate-in fade-in-50 duration-200">
                   <p className="text-xs font-black text-amber-900 uppercase tracking-wider">2단계: 제품 연결 없음</p>
                   <p className="text-[11px] sm:text-xs font-bold text-amber-800/80 leading-relaxed">
                     상품에 연결되지 않은 NFC만 자산으로 등록됩니다. 출고 시 「NFC 태그 관리」 목록에서 제품 연결(출고)을 진행할 수 있습니다.
                   </p>
                 </div>
               )}

               {/* 3. 태그 쓰기 도구 */}
               <div className="bg-slate-50/50 p-5 rounded-3xl space-y-4 border border-slate-100 select-none">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">3단계: 태그에 URL 굽기 (기록)</p>
                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed">스캔 시 앱 메인으로 연동되도록 고유 URL 정보를 태그에 씁니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNFCWrite}
                    className={`w-full h-13 rounded-xl flex items-center justify-center gap-2.5 font-black text-sm transition-all duration-300 active:scale-[0.98] outline-none ${
                      nfcWriting
                        ? 'bg-amber-50 border border-amber-200 text-amber-600 animate-pulse shadow-sm'
                        : 'bg-white border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30 text-slate-700 hover:text-emerald-700 shadow-sm'
                    }`}
                  >
                    <PenTool className="w-4.5 h-4.5 shrink-0" />
                    <span>{nfcWriting ? '태그 정보 기록 중...' : '태그에 정보 기록하기'}</span>
                  </button>
               </div>

               <button
                 type="submit"
                 disabled={submitting || !nfcFormData.tag_uid || (nfcRegisterMode === 'product' && !nfcFormData.product_id)}
                 className="w-full h-15 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-base sm:text-lg rounded-2xl shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/35 hover:shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 select-none outline-none flex items-center justify-center gap-2 active:scale-[0.98]"
               >
                 {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                 <span>{nfcRegisterMode === 'asset' ? '자산 등록 완료' : '태그 매핑 최종 확정'}</span>
               </button>
            </form>
          </div>
        </div>
      )}

      {/* 매칭·등록 직후: 실물 태그에 URL 기록 (「비어있는 태그」 방지) */}
      {nfcTagWritePrompt.open && (
        <div className="fixed inset-0 z-[310] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-md" aria-hidden />
          <div className="relative w-full max-w-sm bg-white rounded-t-[2rem] sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div
              className={`p-6 pb-5 ${
                nfcTagWritePrompt.kind === 'match'
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                  : 'bg-gradient-to-br from-amber-500 to-orange-500'
              }`}
            >
              <h3 className="text-lg font-black text-white tracking-tight">URL 기록 다시 시도</h3>
              <p className="text-xs font-bold text-white/90 mt-2 leading-relaxed">
                {nfcTagWritePrompt.kind === 'match' ? '제품 매칭' : 'UID 등록'}은 이미 완료되었습니다. 태그 칩에 주소만 다시
                넣어 주세요.
              </p>
              <p className="text-[10px] font-mono font-bold text-white/80 mt-3 break-all">{nfcTagWritePrompt.uid}</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-bold text-amber-900 leading-relaxed">
                아래 버튼을 누른 뒤, <strong>같은 NFC 태그</strong>를 스마트폰 뒷면에 1~2초 대 주세요. (Galaxy는 NFC
                「기본 모드」)
              </div>
              <button
                type="button"
                onClick={() => {
                  const { uid: promptUid, kind: promptKind } = nfcTagWritePrompt;
                  beginTagUrlWrite(promptUid, promptKind === 'match' ? 'match' : 'register', () => {
                    closeTagWritePrompt();
                    if (promptKind === 'match') {
                      setNfcMatchForm({ tag_uid: '', product_id: '' });
                      setNfcMatchUrlWrite('done');
                    } else {
                      setNfcRegisterOnlyForm({ tag_uid: '' });
                      setNfcRegisterUrlWrite('done');
                    }
                  });
                }}
                disabled={nfcWriting}
                className="w-full h-13 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {nfcWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
                {nfcWriting ? '태그를 기기에 대 주세요…' : '태그에 URL 기록하기'}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeTagWritePrompt();
                  if (nfcTagWritePrompt.kind === 'match') {
                    setNfcMatchForm({ tag_uid: '', product_id: '' });
                  } else {
                    setNfcRegisterOnlyForm({ tag_uid: '' });
                  }
                }}
                className="w-full h-11 text-slate-500 font-bold text-sm hover:text-slate-800"
              >
                나중에 (태그 관리 화면에서 기록)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── NFC 쓰기 모드 안내 모달 (미확인 시에만 표시) ─── */}
      {nfcWriteGuideOpen && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setNfcWriteGuideOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-sm bg-white rounded-t-[2rem] sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">
            {/* 헤더 그라데이션 */}
            <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 pb-8 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10"
                style={{backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)'}}
              />
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center mb-3 shadow-lg">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-black text-white tracking-tight leading-tight">NFC 쓰기 전 확인</h3>
                  <p className="text-emerald-100 text-xs font-bold mt-1 leading-relaxed">태그에 정보를 기록합니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNfcWriteGuideOpen(false)}
                  className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/20 transition-all"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="p-5 space-y-4 -mt-3 bg-white rounded-t-3xl relative">
              {/* 주의 카드 */}
              <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                    <span className="text-lg leading-none">⚠️</span>
                  </div>
                  <p className="text-sm font-black text-amber-900">삼성 갤럭시 사용자 확인 사항</p>
                </div>
                <div className="space-y-2 pl-1">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <p className="text-xs font-bold text-amber-800 leading-relaxed">
                      상단 알림바를 내려 <span className="bg-amber-200 px-1.5 py-0.5 rounded font-black text-amber-900">NFC</span> 아이콘을 길게 누르세요
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <p className="text-xs font-bold text-amber-800 leading-relaxed">
                      <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black">기본 모드 (읽기/쓰기)</span> 인지 확인하세요
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-rose-400 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">✕</span>
                    <p className="text-xs font-bold text-rose-700 leading-relaxed">
                      <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-black">카드 모드</span> 로 설정 시 쓰기가 작동하지 않습니다
                    </p>
                  </div>
                </div>
              </div>

              {/* 다른 기종 안내 */}
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-xs">📱</span>
                </div>
                <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                  갤럭시 외 기종은 NFC가 켜져 있으면 바로 사용 가능합니다.
                </p>
              </div>

              {/* 버튼 영역 */}
              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      localStorage.setItem('nfc_mode_confirmed', '1');
                    } catch {
                      /* ignore */
                    }
                    setNfcModeConfirmed(true);
                    setNfcWriteGuideOpen(false);

                    const pendingMatch = nfcPendingQuickMatchRef.current;
                    const pendingRegister = nfcPendingUidRegisterRef.current;
                    nfcPendingQuickMatchRef.current = null;
                    nfcPendingUidRegisterRef.current = null;

                    if (pendingMatch) {
                      await submitProductMatchWithTagWrite(pendingMatch.uid, pendingMatch.product_id);
                      return;
                    }
                    if (pendingRegister) {
                      await submitUidRegisterWithTagWrite(pendingRegister);
                      return;
                    }

                    await executeNFCWriteForUid(
                      nfcPendingWriteUid || nfcFormData.tag_uid,
                      nfcPendingWriteContext
                    ).then((ok) => {
                      if (ok) nfcPendingWriteOnSuccessRef.current?.();
                      nfcPendingWriteOnSuccessRef.current = null;
                    });
                    setNfcPendingWriteUid('');
                    setNfcPendingWriteContext('modal');
                  }}
                  className="w-full h-13 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/30 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <PenTool className="w-4 h-4 shrink-0" />
                  {nfcPendingQuickMatchRef.current || nfcPendingUidRegisterRef.current
                    ? '확인 — 매칭·등록 및 URL 기록'
                    : '기본 모드 확인 — 쓰기 시작'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNfcWriteGuideOpen(false);
                    nfcPendingQuickMatchRef.current = null;
                    nfcPendingUidRegisterRef.current = null;
                    nfcPendingWriteOnSuccessRef.current = null;
                  }}
                  className="w-full h-11 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-black text-sm rounded-2xl transition-all duration-200 active:scale-[0.98]"
                >
                  취소
                </button>
              </div>

              {/* 다시 보지 않기 (이미 확인 표시로 전환) */}
              <p className="text-center text-[10px] font-bold text-slate-400 pb-1">
                확인을 누르면 다음부터는 이 안내 없이 바로 쓰기를 시작합니다
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 골드바 & 보증서 등록 모달 */}
      {isGoldbarModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsGoldbarModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-amber-50/50">
               <div>
                 <h3 className="text-2xl font-black text-amber-800">골드바 & 보증서 등록</h3>
                 <p className="text-xs font-bold text-amber-600 mt-1">골드바 정보 및 정품인증서 파일을 연결합니다.</p>
               </div>
               <button onClick={() => setIsGoldbarModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form
              onSubmit={handleGoldbarSubmit}
              className="p-8 space-y-4 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))] sm:pb-8 lg:pb-12"
            >
                {/* 일련번호 · 품명 */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">일련번호 *</label>
                  <p className="text-[11px] font-bold text-slate-500 pl-1 leading-snug">
                    카탈로그 고유 번호입니다. 자동 생성하거나 직접 입력할 수 있습니다.
                  </p>
                  <div className="flex gap-2 items-stretch">
                    <ImeTextInput
                      required
                      type="text"
                      placeholder="예: GB2026-A1B2C3"
                      autoComplete="off"
                      scrollIntoViewOnFocus
                      value={goldbarFormData.serial_number}
                      onChange={(v) => setGoldbarFormData({ ...goldbarFormData, serial_number: v })}
                      className="flex-1 min-w-0 h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent hover:border-amber-200/50 focus:border-amber-400/50 transition-all focus:bg-white font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setGoldbarFormData((prev) => ({
                          ...prev,
                          serial_number: generateGoldbarSerialNumber(),
                        }))
                      }
                      className="shrink-0 px-3 h-12 rounded-xl border border-amber-200 bg-white text-amber-800 font-black text-xs flex flex-col items-center justify-center gap-0.5 hover:bg-amber-50 transition-all shadow-sm"
                    >
                      <RefreshCw className="w-4 h-4" />
                      자동
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">품명 (선택)</label>
                  <ImeTextInput
                    type="text"
                    placeholder="예: 골드바3.75g"
                    autoComplete="off"
                    scrollIntoViewOnFocus
                    value={goldbarFormData.display_name}
                    onChange={(v) => setGoldbarFormData({ ...goldbarFormData, display_name: v })}
                    className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent hover:border-amber-200/50 focus:border-amber-400/50 transition-all focus:bg-white"
                  />
                </div>

                {/* 소재 및 금 함량 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">소재</label>
                    <ImeTextInput
                      required
                      type="text"
                      placeholder="예: 999.9"
                      autoComplete="off"
                      scrollIntoViewOnFocus
                      value={goldbarFormData.material}
                      onChange={(v) => setGoldbarFormData({ ...goldbarFormData, material: v })}
                      className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">금 함량</label>
                    <select required value={goldbarFormData.purity} onChange={(e) => setGoldbarFormData({...goldbarFormData, purity: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-3 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all cursor-pointer">
                      <option value="24K">24K</option>
                      <option value="18K">18K</option>
                      <option value="14K">14K</option>
                    </select>
                  </div>
                </div>

                {/* 중량 */}
                <div className="space-y-2 relative">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">중량(g) *</label>
                  <ImeTextInput
                    required
                    type="text"
                    placeholder="예: 3.75"
                    autoComplete="off"
                    scrollIntoViewOnFocus
                    value={goldbarFormData.weight}
                    onChange={(v) => setGoldbarFormData({ ...goldbarFormData, weight: v })}
                    className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                  />
                  <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">g</span>
                </div>

                {/* 가로 세로 길이 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 relative">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가로 길이(mm)</label>
                    <ImeTextInput
                      type="text"
                      placeholder="예: 17"
                      autoComplete="off"
                      scrollIntoViewOnFocus
                      value={goldbarFormData.width_mm}
                      onChange={(v) => setGoldbarFormData({ ...goldbarFormData, width_mm: v })}
                      className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                    />
                    <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                  </div>
                  <div className="space-y-2 relative">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">세로 길이(mm)</label>
                    <ImeTextInput
                      type="text"
                      placeholder="예: 25"
                      autoComplete="off"
                      scrollIntoViewOnFocus
                      value={goldbarFormData.height_mm}
                      onChange={(v) => setGoldbarFormData({ ...goldbarFormData, height_mm: v })}
                      className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                    />
                    <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                  </div>
                </div>

                {/* 가격 */}
                <div className="space-y-2 relative">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가격 *</label>
                  <ImeTextInput
                    required
                    type="text"
                    placeholder="예: 850000"
                    autoComplete="off"
                    scrollIntoViewOnFocus
                    value={goldbarFormData.price}
                    onChange={(v) => setGoldbarFormData({ ...goldbarFormData, price: v })}
                    className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                  />
                  <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">원</span>
                </div>

                {/* 메모 */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">메모</label>
                  <ImeTextInput
                    type="text"
                    placeholder="메모를 입력해 주세요"
                    autoComplete="off"
                    scrollIntoViewOnFocus
                    value={goldbarFormData.memo}
                    onChange={(v) => setGoldbarFormData({ ...goldbarFormData, memo: v })}
                    className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                  />
                </div>

                {/* 출고 상태 및 보증서 URL */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">상태</label>
                    <select value={goldbarFormData.status} onChange={(e) => setGoldbarFormData({...goldbarFormData, status: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all cursor-pointer">
                      <option value="CATALOG">카탈로그 생성</option>
                      <option value="TAGGED">태그 등록완료</option>
                      <option value="SHIPPED">출고/정품인증</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">정품인증서 URL</label>
                    <ImeTextInput
                      type="text"
                      placeholder="https://..."
                      autoComplete="off"
                      scrollIntoViewOnFocus
                      value={goldbarFormData.cert_url}
                      onChange={(v) => setGoldbarFormData({ ...goldbarFormData, cert_url: v })}
                      className="w-full h-14 bg-slate-100/50 rounded-2xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button type="submit" disabled={submitting || !goldbarFormData.serial_number || !goldbarFormData.weight} className="w-full h-16 bg-amber-600 hover:bg-amber-700 text-white text-lg font-black shadow-xl shadow-amber-500/30 disabled:opacity-30 transition-all mt-2 flex items-center justify-center gap-2">
                 {submitting && <Loader2 className="w-5 h-5 animate-spin" />} 등록 완료
               </button>
            </form>
          </div>
        </div>
      )}

      {/* 골드바 정보 수정 모달 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-amber-50/50">
               <div>
                 <h3 className="text-2xl font-black text-amber-800">골드바 정보 수정</h3>
                 <p className="text-xs font-bold text-amber-600 mt-1">골드바와 정품인증서 정보를 수정합니다.</p>
               </div>
               <button onClick={() => setIsEditModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form
              onSubmit={handleEditSubmit}
              className="p-8 space-y-6 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))] sm:pb-8 lg:pb-12"
            >
               {/* 일련번호 · 품명 */}
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">일련번호 *</label>
                 <p className="text-[11px] font-bold text-slate-500 pl-1">자동 생성 또는 직접 수정할 수 있습니다.</p>
                 <div className="flex gap-2 items-stretch">
                   <ImeTextInput
                     required
                     type="text"
                     autoComplete="off"
                     scrollIntoViewOnFocus
                     value={editGoldbarData.serial_number}
                     onChange={(v) => setEditGoldbarData({ ...editGoldbarData, serial_number: v })}
                     className="flex-1 min-w-0 h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all font-mono text-sm"
                   />
                   <button
                     type="button"
                     onClick={() =>
                       setEditGoldbarData((prev) => ({
                         ...prev,
                         serial_number: generateGoldbarSerialNumber(),
                       }))
                     }
                     className="shrink-0 px-3 h-14 rounded-2xl border border-amber-200 bg-white text-amber-800 font-black text-xs flex flex-col items-center justify-center gap-0.5 hover:bg-amber-50 transition-all shadow-sm"
                   >
                     <RefreshCw className="w-4 h-4" />
                     자동
                   </button>
                 </div>
               </div>

               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">품명 (선택)</label>
                 <ImeTextInput
                   type="text"
                   placeholder="예: 골드바3.75g"
                   autoComplete="off"
                   scrollIntoViewOnFocus
                   value={editGoldbarData.display_name}
                   onChange={(v) => setEditGoldbarData({ ...editGoldbarData, display_name: v })}
                   className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                 />
               </div>

               {/* 중량 및 순도 */}
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">중량 *</label>
                   <ImeTextInput
                     required
                     type="text"
                     autoComplete="off"
                     scrollIntoViewOnFocus
                     value={editGoldbarData.weight}
                     onChange={(v) => setEditGoldbarData({ ...editGoldbarData, weight: v })}
                     className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">순도</label>
                   <ImeTextInput
                     required
                     type="text"
                     autoComplete="off"
                     scrollIntoViewOnFocus
                     value={editGoldbarData.purity}
                     onChange={(v) => setEditGoldbarData({ ...editGoldbarData, purity: v })}
                     className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                   />
                 </div>
               </div>

               {/* 제조일자 */}
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제조일자 (선택)</label>
                 <input
                   type="date"
                   value={editGoldbarData.minted_at}
                   onChange={(e) => setEditGoldbarData({ ...editGoldbarData, minted_at: e.target.value })}
                   onFocus={(e) => {
                     requestAnimationFrame(() => {
                       setTimeout(() => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
                     });
                   }}
                   className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                 />
               </div>

               {/* NFC 태그 UID */}
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">연결할 NFC UID (선택)</label>
                 <div className="flex gap-4">
                    <div className="flex-1 h-14 bg-slate-100 rounded-2xl flex items-center px-6 font-mono font-black text-amber-700 shadow-inner">
                      {editGoldbarData.tag_uid || 'UID 대기 중...'}
                    </div>
                    <button type="button" onClick={() => handleNFCScan('edit')} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${nfcScanning ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-white border-2 border-slate-100 text-slate-400 hover:text-amber-500 hover:border-amber-500 shadow-sm'}`}>
                      {nfcScanning ? <Loader2 className="w-6 h-6 animate-spin" /> : <Smartphone className="w-6 h-6" />}
                    </button>
                 </div>
               </div>

               {/* 보증서 파일 첨부 */}
               <div className="space-y-2 bg-slate-50 p-5 rounded-2xl border border-slate-100/80">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">정품인증서 파일 교체 (선택)</label>
                 <div className="mt-2 flex items-center gap-4">
                    <label className="bg-white border border-slate-200 px-4 py-3 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-2 shadow-sm">
                      <FileText className="w-4 h-4" /> 파일 선택
                      <input type="file" accept="application/pdf,image/*" onChange={(e) => handleFileChange(e, 'edit')} className="hidden" />
                    </label>
                    <span className="text-xs font-bold text-slate-400 line-clamp-1 flex-1">
                      {editGoldbarData.file_name || '파일을 변경하지 않으려면 비워 두세요.'}
                     </span>
                  </div>
                </div>

                {/* 출고 상태 및 보증서 URL */}
                <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">상태</label>
                    <select value={editGoldbarData.status} onChange={(e) => setEditGoldbarData({...editGoldbarData, status: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all cursor-pointer">
                      <option value="CATALOG">카탈로그 생성</option>
                      <option value="TAGGED">태그 등록완료</option>
                      <option value="SHIPPED">출고/정품인증</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">정품인증서 URL</label>
                    <ImeTextInput
                      type="text"
                      placeholder="https://..."
                      autoComplete="off"
                      scrollIntoViewOnFocus
                      value={editGoldbarData.cert_url}
                      onChange={(v) => setEditGoldbarData({ ...editGoldbarData, cert_url: v })}
                      className="w-full h-14 bg-slate-100/50 rounded-2xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button type="submit" disabled={submitting || !editGoldbarData.serial_number || !editGoldbarData.weight} className="w-full h-16 bg-amber-600 hover:bg-amber-700 text-white text-lg font-black shadow-xl shadow-amber-500/30 disabled:opacity-30 transition-all mt-2 flex items-center justify-center gap-2">
                 {submitting && <Loader2 className="w-5 h-5 animate-spin" />} 수정 완료
               </button>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 z-[260] pointer-events-none">
          <div
            className={`px-4 py-3 rounded-xl shadow-xl border text-sm font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* 하단 네비게이션 (모바일전용) */}
      <div
        className={`lg:hidden fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-3xl border-t border-slate-100/80 z-[140] flex items-center justify-around px-2 h-[68px] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] select-none ${blockMobileBottomNav ? 'hidden' : ''}`}
      >
         {[
           { id: 'dashboard', icon: LayoutDashboard, label: '통계' },
           { id: 'products', icon: Package, label: '제품' },
           { id: 'nfc', icon: Tag, label: '태그' },
           { id: 'goldbars', icon: Award, label: '인증' },
           { id: 'assetMarket', icon: Hash, label: '시세' },
         ].map((nav) => (
           <button 
             key={nav.id} onClick={() => { goToTab(nav.id as AdminTabId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
             className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all cursor-pointer ${currentTab === nav.id ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 scale-105 font-black' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <nav.icon className="w-5 h-5" />
             <span className="text-[9px] font-bold mt-1 tracking-tighter whitespace-nowrap">{nav.label}</span>
           </button>
         ))}
      </div>
    </div>
  );
}
