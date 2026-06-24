import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Download, Play, ChevronRight, Bookmark, Loader2, Award, ShieldCheck, ShoppingCart, Info, CheckCircle2, MessageSquare, X, BookOpen, Smartphone, Eye } from 'lucide-react';
import { GuaranteePdfHost } from '../components/ProductGuaranteeCertificate';
import { GuaranteeCertificatePreviewModal } from '../components/GuaranteeCertificatePreviewModal';
import {
  mapProductToGuaranteeData,
  mapGoldbarWalletToGuaranteeData,
  catalogWalletRowToProductRecord
} from '../lib/guaranteeCertificateData';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';
import {
  readTagSession,
  readTagProof,
  readWalletTagUid,
  rememberWalletTagUid,
  setTagSessionActive,
  extendDeviceTagTrust,
  hydrateGuestTagPreviewFromStorage,
  persistGuestTagPreview,
  clearWalletGoldbarsStorage
} from '../lib/tagSession';
import { fetchUserWallet, linkTagToUserWallet } from '../lib/walletApi';
import { canUseWalletFeatures, isConsumerLoggedIn, loginPathWithNext } from '../lib/sessionPolicy';
import { useToast } from '../components/ToastProvider';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { getConsumerDisplayName } from '../lib/consumerDisplay';
import { useTranslation } from 'react-i18next';

/** Chrome BeforeInstallPromptEvent (lib.dom에 없을 수 있음) */
type AnyBeforeInstallPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** 실시간 시세 계산기: 중량(g) * 1g당 매입 시세 */
function calculateCurrentPrice(weightStr: string, pricePerGram: number | null | undefined) {
  const w = parseFloat(String(weightStr || '').replace(/[^0-9.]/g, ''));
  const p = Number(pricePerGram);
  if (isNaN(w) || isNaN(p) || p <= 0) return null;
  return Math.floor(w * p);
}

/** 헤더 우측 — 소비자 로그인 / 관리자 */
function AuthHeaderLinks({
  currentUser,
  onLogout,
  className = '',
}: {
  currentUser: { name?: string; email?: string } | null;
  onLogout: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className}`.trim()}>
      <LanguageSwitcher />
      {currentUser ? (
        <>
          <span className="hidden sm:inline text-[10px] font-bold text-slate-500 max-w-[88px] truncate">
            {getConsumerDisplayName(currentUser, t('common.member'))}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="text-[10px] sm:text-[11px] font-black text-slate-600 hover:text-rose-600 border border-slate-200/80 bg-white/90 rounded-xl px-2.5 py-1.5 transition-colors shadow-sm"
          >
            {t('common.logout')}
          </button>
        </>
      ) : (
        <Link
          to={loginPathWithNext()}
          className="text-[10px] sm:text-[11px] font-black text-amber-700 hover:text-amber-800 border border-amber-200/80 bg-amber-50/90 rounded-xl px-2.5 py-1.5 no-underline transition-colors shadow-sm"
        >
          {t('common.login')}
        </Link>
      )}
      <Link
        to="/login"
        className="text-[10px] sm:text-[11px] font-black text-slate-500 hover:text-purple-600 border border-slate-200/80 bg-white/90 rounded-xl px-2.5 py-1.5 no-underline transition-colors shadow-sm"
      >
        {t('common.admin')}
      </Link>
    </div>
  );
}

export default function UserLanding() {
  const { t } = useTranslation();
  const { tagId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, showConfirm } = useToast();
  const [product, setProduct] = useState<any>(null);
  const [goldbar, setGoldbar] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** /t/:id?unmap=1 — 판매 제품 태그 매칭 해제용 NFC 인증 기록 완료 */
  const [adminUnmapScanOk, setAdminUnmapScanOk] = useState(false);

  // 소비자 탭 (태그 없을 때)
  const [activeTab, setActiveTab] = useState<'home' | 'products' | 'myWallet'>('home');
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [myGoldbars, setMyGoldbars] = useState<any[]>([]);
  /** Chrome/Edge: beforeinstallprompt — 동일 인스턴스는 prompt() 1회만. ref로 보관 */
  const installPromptRef = useRef<AnyBeforeInstallPrompt | null>(null);
  const [installPromptReady, setInstallPromptReady] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  // 상세 모달 상태
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [purchaseFormData, setPurchaseFormData] = useState({
    name: '',
    phone: '',
    memo: ''
  });
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [userGuaranteePdf, setUserGuaranteePdf] = useState<GuaranteeCertificateData | null>(null);
  const [userGuaranteePreview, setUserGuaranteePreview] = useState<GuaranteeCertificateData | null>(null);
  /** 내 지갑 카드에서 연 제품/골드바 상세 모달 */
  const [walletDetailItem, setWalletDetailItem] = useState<any>(null);

  // 전자 앨범 관련 상태
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
  const [currentGoldbarForAlbum, setCurrentGoldbarForAlbum] = useState<any>(null);
  const [albumData, setAlbumData] = useState<{ album: any; images: any[] }>({ album: null, images: [] });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [albumCaption, setAlbumCaption] = useState('');

  // 일반 사용자 인증 (로그인 UI는 /login)
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  /** NFC 태그 스캔·URL 진입(정품 확인·태그 연결용) */
  const [nfcTagSession, setNfcTagSession] = useState(readTagSession);

  const PENDING_ALBUM_KEY = 'wowtag_pending_album_goldbar';

  const handleConsumerLogout = useCallback(() => {
    localStorage.removeItem('wowtag_current_user');
    setCurrentUser(null);
    setMyGoldbars(hydrateGuestTagPreviewFromStorage() as any[]);
  }, []);

  const syncWalletForUser = useCallback(async (userId: string, tagUidToLink?: string | null) => {
    setWalletLoading(true);
    try {
      if (tagUidToLink) {
        const linked = await linkTagToUserWallet(userId, tagUidToLink);
        if (linked.ok && linked.items) {
          setMyGoldbars(linked.items);
          return;
        }
      }
      const items = await fetchUserWallet(userId);
      setMyGoldbars(items);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const promptLoginForWallet = useCallback(async () => {
    const ok = await showConfirm({
      title: t('user_landing.wallet.login_prompt_title'),
      message: t('user_landing.wallet.login_prompt_message'),
      confirmLabel: t('user_landing.wallet.login_prompt_confirm'),
      cancelLabel: t('user_landing.wallet.login_prompt_cancel'),
    });
    if (ok) navigate(loginPathWithNext('wallet'));
  }, [navigate, showConfirm, t]);

  useEffect(() => {
    if (!tagId) return;
    setTagSessionActive();
    rememberWalletTagUid(tagId);
    extendDeviceTagTrust(tagId);
    setNfcTagSession(true);
    if (isConsumerLoggedIn(currentUser)) {
      void syncWalletForUser(currentUser.id, tagId);
    }
  }, [tagId, currentUser?.id, syncWalletForUser]);

  /** 로그인 직후·복귀 시 대기 중인 태그 UID 연결 */
  useEffect(() => {
    if (!isConsumerLoggedIn(currentUser)) return;
    const pending = tagId || readWalletTagUid();
    if (!pending) return;
    void syncWalletForUser(currentUser.id, pending);
  }, [currentUser?.id, tagId, syncWalletForUser]);

  useEffect(() => {
    const st = location.state as { nfcScan?: { tag_uid?: string } } | null;
    if (st?.nfcScan) {
      setTagSessionActive();
      setNfcTagSession(true);
      const uid = st.nfcScan.tag_uid;
      if (typeof uid === 'string' && uid.length > 0) {
        rememberWalletTagUid(uid);
        extendDeviceTagTrust(uid);
        if (isConsumerLoggedIn(currentUser)) {
          void syncWalletForUser(currentUser.id, uid);
        }
      }
    }
  }, [location.state, currentUser?.id, syncWalletForUser]);

  type UserLandingTab = 'home' | 'products' | 'myWallet';

  const closeAllUserModals = useCallback(() => {
    setSelectedProduct(null);
    setPurchaseSuccess(false);
    setPurchaseFormData({ name: '', phone: '', memo: '' });
    setShowGuideModal(false);
    setIsAlbumModalOpen(false);
    setCurrentGoldbarForAlbum(null);
    setWalletDetailItem(null);
  }, []);

  const goToUserTab = useCallback(
    (tab: UserLandingTab) => {
      closeAllUserModals();
      setActiveTab(tab);
    },
    [closeAllUserModals]
  );

  // 앨범 데이터 패치
  const fetchAlbum = async (goldbarId: any) => {
    try {
      const res = await fetch(`/api/albums/${goldbarId}`);
      if (res.ok) {
        const d = await res.json();
        setAlbumData(d);
      }
    } catch (err) {}
  };

  // 앨범 — 로그인 + 지갑에 등록된 항목만
  const handleOpenAlbum = (g: any) => {
    if (!canUseWalletFeatures(currentUser)) {
      void promptLoginForWallet();
      return;
    }
    const inWallet = myGoldbars.some(
      (w) => w.id === g.id || (w.serial_number && w.serial_number === g.serial_number)
    );
    if (!inWallet) {
      showToast('info', t('user_landing.wallet.no_tag_connected'));
      return;
    }
    setCurrentGoldbarForAlbum(g);
    setIsAlbumModalOpen(true);
    fetchAlbum(g.id || g.serial_number);
  };

  /** [신규] 소유권 해지 요청 */
  const handleReleaseRequest = async (goldbarId: number) => {
    if (!currentUser) {
      showToast('info', t('user_landing.wallet.login_required_desc'));
      return;
    }
    const okRelease = await showConfirm({
      title: t('user_landing.wallet.release_request'),
      message: t('user_landing.wallet.release_request_msg'),
      confirmLabel: t('user_landing.wallet.release_request_btn'),
      cancelLabel: t('common.cancel'),
    });
    if (!okRelease) return;

    try {
      const res = await fetch('/api/user/goldbars/release-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          goldbarId: goldbarId,
          message: t('user_landing.wallet.ownership_release_btn')
        }),
      });

      if (res.ok) {
        showToast('success', t('user_landing.wallet.release_success'));
        await syncWalletForUser(currentUser.id);
      } else {
        const d = await res.json();
        showToast('error', d.error || t('user_landing.wallet.release_failed'));
      }
    } catch (err) {
      showToast('error', t('common.error_occurred'));
    }
  };

  // 앨범 사진 파일 선택 & 업로드
  const handleAlbumImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentGoldbarForAlbum) return;
    if (!canUseWalletFeatures(currentUser)) {
      showToast('info', t('user_landing.wallet.login_required_desc'));
      return;
    }

    if (albumData.images.length >= 5) {
      showToast('warning', t('user_landing.album.limit_notice'));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setUploadingImage(true);
      try {
        const res = await fetch(`/api/albums/${currentGoldbarForAlbum.id || currentGoldbarForAlbum.serial_number}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_file_base64: base64,
            file_name: file.name,
            caption: albumCaption
          })
        });
        if (res.ok) {
          setAlbumCaption('');
          fetchAlbum(currentGoldbarForAlbum.id || currentGoldbarForAlbum.serial_number);
        } else {
          const d = await res.json();
          showToast('error', d.error || t('user_landing.album.upload_failed'));
        }
      } catch (err: any) {
        showToast('error', t('user_landing.album.upload_failed'));
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 앨범 사진 삭제
  const handleDeleteAlbumImage = async (imageId: any) => {
    const okDelete = await showConfirm({
      title: t('user_landing.album.delete_confirm_title'),
      message: t('user_landing.album.delete_confirm_msg'),
      confirmLabel: t('user_landing.album.delete_btn'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!okDelete) return;
    try {
      const res = await fetch(`/api/albums/images/${imageId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAlbum(currentGoldbarForAlbum.id || currentGoldbarForAlbum.serial_number);
      }
    } catch (err) {}
  };

  const isStandalonePwa =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const iOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
    setIsIosDevice(iOS);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e as unknown as AnyBeforeInstallPrompt;
      setInstallPromptReady(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const showInstallBanner = !isStandalonePwa && (installPromptReady || isIosDevice);

  const handleInstallApp = useCallback(async () => {
    if (isStandalonePwa) {
      showToast('info', 'PWA is already running in standalone app mode.');
      return;
    }

    if (isIosDevice) {
      showToast(
        'info',
        'On iPhone/iPad Safari, you can install the app by:\n\n' +
          '1) Tap the Share button (□↑) at the bottom.\n' +
          '2) Select "Add to Home Screen".\n\n' +
          'Please open this site in Safari instead of Chrome app for installation.',
        8000
      );
      return;
    }

    const p = installPromptRef.current;
    if (!p) {
      showToast(
        'info',
        'Automatic installation is not supported in this environment.\n\n' +
          '【Android Chrome】\n' +
          '1) Tap the install icon (⊕) in the address bar, or\n' +
          '2) Tap menu (⋮) -> "Install App" or "Add to Home Screen".\n\n' +
          'Please open the site directly in Chrome instead of standard in-app webviews.',
        8000
      );
      return;
    }

    try {
      await p.prompt();
      await p.userChoice;
    } catch (err) {
      console.error('[PWA] install prompt failed', err);
      showToast(
        'warning',
        'Could not open installation dialog. Please update Chrome or use "Install App" in menu (⋮).'
      );
    } finally {
      installPromptRef.current = null;
      setInstallPromptReady(false);
    }
  }, [isIosDevice, isStandalonePwa, showToast]);

  // 해시 기반 탭 네비게이션 구현 (모바일 뒤로가기 대응)
  useEffect(() => {
    // 1. 초기 로드 시 해시가 있으면 해당 탭으로 이동
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash === 'products' || initialHash === 'myWallet') {
      setActiveTab(initialHash as any);
    } else {
      setActiveTab('home');
    }

    // 2. popstate(뒤로가기/앞으로가기) 이벤트 핸들러 등록
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'products' || hash === 'myWallet') {
        setActiveTab(hash as any);
      } else {
        setActiveTab('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // activeTab이 바뀔 때 URL 해시를 변경
  useEffect(() => {
    if (activeTab === 'home') {
      if (window.location.hash !== '' && window.location.hash !== '#home') {
        window.history.pushState(null, '', '#home');
      }
    } else {
      if (window.location.hash !== `#${activeTab}`) {
        window.history.pushState(null, '', `#${activeTab}`);
      }
    }
  }, [activeTab]);

  useEffect(() => {
    if (!canUseWalletFeatures(currentUser)) return;
    if (!nfcTagSession && !readTagProof()) {
      try {
        sessionStorage.removeItem(PENDING_ALBUM_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_ALBUM_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const g = JSON.parse(raw) as { id?: number; serial_number?: string };
      sessionStorage.removeItem(PENDING_ALBUM_KEY);
      setCurrentGoldbarForAlbum(g);
      setIsAlbumModalOpen(true);
      void fetchAlbum(g.id ?? g.serial_number);
    } catch {
      try {
        sessionStorage.removeItem(PENDING_ALBUM_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [currentUser, nfcTagSession]);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('wowtag_current_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        setCurrentUser(parsed);
        if (isConsumerLoggedIn(parsed)) {
          const pendingTag = readWalletTagUid();
          void syncWalletForUser(parsed.id, pendingTag);
        }
      } else {
        setMyGoldbars(hydrateGuestTagPreviewFromStorage() as any[]);
      }
    } catch (e) {
      console.error(e);
    }

    async function fetchData() {
      if (!tagId) {
        setLoading(false);
        // 전체 제품 목록 불러오기
        try {
          const res = await fetch('/api/products');
          if (res.ok) {
            const data = await res.json();
            setAllProducts(data);
          }
        } catch (e) {
          console.error(e);
        }
        return;
      }

      const unmapIntent = new URLSearchParams(location.search).get('unmap') === '1';
      if (unmapIntent) {
        try {
          const vr = await fetch(`/api/t/${encodeURIComponent(tagId)}?unmap_verify=1`);
          if (!vr.ok) {
            setError(t('user_landing.error.desc'));
            setLoading(false);
            return;
          }
          setAdminUnmapScanOk(true);
          setLoading(false);
          return;
        } catch (e: any) {
          setError(e?.message || 'Verification record failed.');
          setLoading(false);
          return;
        }
      }
      
      try {
        // 1. 카탈로그 NFC 태그 (자산만 / 제품연결 — 메인으로 안내)
        const productRes = await fetch(`/api/t/${encodeURIComponent(tagId)}`);
        if (productRes.ok) {
          const data = await productRes.json();
          if (data.nfc_mode === 'home' || data.nfc_mode === 'asset') {
            if (data.nfc_mode === 'asset') {
              clearWalletGoldbarsStorage();
            }
            navigate('/', { replace: true, state: { nfcScan: data } });
            setLoading(false);
            return;
          }
          if (data.name && data.id != null) {
            setProduct(data);
            setLoading(false);
            return;
          }
        }

        // 2. 골드바 / 카탈로그 제품 조회 (UID에 콜론 등이 있으면 경로 인코딩 필수)
        const goldbarRes = await fetch(`/api/goldbars/t/${encodeURIComponent(tagId)}`);
        if (goldbarRes.ok) {
          const data = await goldbarRes.json();
          setGoldbar(data);
          setLoading(false);
          return;
        }

        throw new Error('No genuine record registered.');
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchData();
  }, [tagId, navigate, location.search, t]);

  // 게스트: 태그 세션 중 현재 태그 1건만 프리뷰 (로그인 시 서버 지갑으로 전환)
  useEffect(() => {
    if (tagId) return;
    if (isConsumerLoggedIn(currentUser)) return;
    if (!readTagSession()) return;
    const st = location.state as { nfcScan?: { tag_uid?: string; nfc_mode?: string } } | null;
    const scan = st?.nfcScan;
    if (scan?.nfc_mode === 'asset') {
      setMyGoldbars([]);
      clearWalletGoldbarsStorage();
      return;
    }
    const tagUid = scan?.tag_uid || readWalletTagUid();
    if (!tagUid) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/goldbars/t/${encodeURIComponent(tagUid)}`);
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 404) {
          setMyGoldbars([]);
          clearWalletGoldbarsStorage();
        }
        return;
      }
      const goldbarData = await res.json();
      const wid = goldbarData?.id;
      if (wid === undefined || wid === null || wid === '') return;
      setMyGoldbars((prev) => {
        if (prev.some((g) => g.id === wid)) return prev;
        const next = [...prev, { ...goldbarData, scanned_at: new Date().toLocaleDateString() }];
        persistGuestTagPreview(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [tagId, location.state, location.key, currentUser]);

  const handlePurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseFormData.name || !purchaseFormData.phone) {
      showToast('warning', 'Please enter required fields.');
      return;
    }
    // 모의 구매 완료 처리
    setPurchaseSuccess(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  // 관리자 매칭 해제용 NFC 인증 (판매 완료 제품)
  if (tagId && adminUnmapScanOk) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0FDF4] p-6 text-center relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
        </div>
        <div className="w-16 h-16 bg-emerald-100 border border-emerald-200 rounded-3xl flex items-center justify-center text-emerald-600 mb-4">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h3 className="text-xl font-black text-slate-800 tracking-tight">{t('user_landing.unmap.success_title')}</h3>
        <p className="text-xs font-bold text-slate-500 mt-2 max-w-sm leading-relaxed">
          {t('user_landing.unmap.success_desc')}
        </p>
        <p className="text-[10px] font-mono font-bold text-slate-400 mt-4 break-all max-w-full">{tagId}</p>
        <Link to="/" className="mt-8 text-xs font-black text-emerald-700 hover:underline">
          {t('user_landing.unmap.home_link')}
        </Link>
      </div>
    );
  }

  // ==========================================
  // [Case A] NFC 태그 ID가 없을 때: 공통 진입 랜딩 페이지
  // ==========================================
  if (!tagId) {
    const nfcWelcome = (location.state as { nfcScan?: { message?: string; nfc_mode?: string } } | null)?.nfcScan;
    return (
      <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden box-border bg-[#F6F7FB] flex flex-col items-center px-4 py-5 pb-24 sm:p-5 font-sans leading-relaxed text-slate-900 animate-in fade-in duration-500 select-none">
        
        {/* 헤더: 로고 + 우측 관리자 로그인 */}
        <header className="w-full max-w-md flex justify-between items-center h-16 px-1 mb-2 gap-2">
          <div className="flex items-center gap-2 select-none min-w-0">
            <img src="/gold_synctag_logo_v2.png" alt="Logo" className="w-7 h-7 object-contain rounded-lg shrink-0" />
            <span className="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight truncate">{t('user_landing.header.logo_title')}</span>
          </div>
          <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
        </header>

        {nfcWelcome?.message && (
          <div className="w-full max-w-md mb-3 rounded-2xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 shadow-sm animate-in fade-in duration-300">
            <p className="text-xs font-black text-emerald-900 leading-relaxed">{nfcWelcome.message}</p>
          </div>
        )}

        {readTagProof() && !canUseWalletFeatures(currentUser) && (
          <div className="w-full max-w-md mb-3 rounded-2xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 shadow-sm">
            <p className="text-xs font-black text-amber-900 leading-relaxed">
              {t('user_landing.header.nfc_proof_notice')}
            </p>
          </div>
        )}

        {/* PWA 설치 유도 (Chrome: 이벤트 수신 시 / iOS: 수동 안내) */}
        {showInstallBanner && (
          <div className="w-full max-w-md bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/50 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 shadow-sm animate-in fade-in duration-300">
            <div className="min-w-0 flex-1">
              <h5 className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                <span>📱</span> {t('user_landing.header.pwa_banner_title')}
              </h5>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                {isIosDevice
                  ? t('user_landing.header.pwa_banner_desc_ios')
                  : t('user_landing.header.pwa_banner_desc_android')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleInstallApp}
              className="shrink-0 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-[11px] rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all cursor-pointer shadow-md shadow-amber-500/10 whitespace-nowrap active:scale-[0.98]"
            >
              {isIosDevice ? t('user_landing.header.pwa_install_btn_ios') : t('user_landing.header.pwa_install_btn_android')}
            </button>
          </div>
        )}

        {/* 상단 탭 전환 바 */}
        <div className="w-full max-w-md bg-white p-1.5 rounded-2xl border border-slate-100/80 flex gap-1 mb-5 shadow-sm relative z-10">
          <button 
            onClick={() => goToUserTab('home')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'home' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <Info className="w-4 h-4" />
            {t('user_landing.header.tab_home')}
          </button>
          <button 
            onClick={() => goToUserTab('products')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'products' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <ShoppingCart className="w-4 h-4" />
            {t('user_landing.header.tab_products')}
          </button>
        </div>

        {/* 탭 1: 홈 */}
        {activeTab === 'home' && (
          <>
            {/* 중앙 제품 카드 뷰 (이미지 기반 디자인 구현) */}
            <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-100/60 shadow-xl overflow-hidden mb-6 relative p-4 flex flex-col">
              <div className="relative w-full aspect-[4/5] rounded-[2rem] bg-purple-gradient overflow-hidden shadow-sm flex items-center justify-center p-0">
                {/* 고화질 럭셔리 주얼리 이미지 */}
                <img src="/luxury_jewelry.png" alt="Luxury Jewelry" className="w-full h-full object-cover rounded-[2rem] hover:scale-105 transition-all duration-700" />
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/30 via-transparent to-transparent opacity-40"></div>

                {/* 하단 글래스모피즘 오버레이 팝업 */}
                <div className="absolute bottom-3 left-3 right-3 bg-white/70 backdrop-blur-xl rounded-[1.8rem] p-5 border border-white/40 shadow-2xl flex flex-col items-center text-center">
                  <h4 className="text-xl font-black text-slate-800 tracking-tight">{t('user_landing.home.hero_title')}</h4>
                  <p className="text-xs font-bold text-slate-600 mt-1 mb-1 leading-relaxed">
                    {t('user_landing.home.hero_desc')}
                  </p>
                </div>
              </div>
            </div>

            {/* 히어로 섹션 아래 1x2 그리드 메뉴 */}
            <div className="w-full max-w-md grid grid-cols-2 gap-3.5 mb-5">
              {/* 내 지갑 바로가기 */}
              <div 
                onClick={() => {
                  if (!canUseWalletFeatures(currentUser)) {
                    void promptLoginForWallet();
                    return;
                  }
                  goToUserTab('myWallet');
                }} 
                className="bg-white border border-slate-100/80 rounded-[2rem] p-5 flex flex-col justify-between hover:border-amber-400 hover:shadow-lg transition-all cursor-pointer group shadow-sm min-h-[140px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-all mb-auto border border-amber-200/40">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-black text-slate-800 text-sm group-hover:text-amber-700 transition-colors">{t('user_landing.home.menu_wallet')}</h5>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-tight">{t('user_landing.home.menu_wallet_desc')}</p>
                </div>
              </div>

              {/* 추억 전자앨범 바로가기 */}
              <div 
                onClick={() => {
                  if (!canUseWalletFeatures(currentUser)) {
                    void promptLoginForWallet();
                    return;
                  }
                  if (myGoldbars.length > 0) {
                    handleOpenAlbum(myGoldbars[0]);
                  } else {
                    goToUserTab('myWallet');
                  }
                }} 
                className="bg-white border border-slate-100/80 rounded-[2rem] p-5 flex flex-col justify-between hover:border-emerald-400 hover:shadow-lg transition-all cursor-pointer group shadow-sm min-h-[140px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-all mb-auto border border-emerald-200/40">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-black text-slate-800 text-sm group-hover:text-emerald-700 transition-colors">{t('user_landing.home.menu_album')}</h5>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-tight">{t('user_landing.home.menu_album_desc')}</p>
                </div>
              </div>
            </div>

            {/* 프로그램 사용방법 카드 */}
            <div onClick={() => setShowGuideModal(true)} className="w-full max-w-md bg-white border border-slate-100/80 rounded-2xl p-4 flex items-center justify-between hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group shadow-sm mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-all">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-black text-slate-800 text-sm group-hover:text-purple-700 transition-colors">{t('user_landing.home.guide_title')}</h5>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">{t('user_landing.home.guide_desc')}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all" />
            </div>
          </>
        )}

        {/* 탭 2: 제품 둘러보기 & 구매/판매 페이지 */}
        {activeTab === 'products' && (
          <div className="w-full max-w-md space-y-5 flex-1">
            <div className="flex items-end justify-between px-1">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-800">{t('user_landing.products.list_title')}</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">{t('user_landing.products.list_desc')}</p>
              </div>
            </div>

            <div className="grid gap-4">
              {allProducts.map((p) => (
                <div key={p.id} onClick={() => { setSelectedProduct(p); setPurchaseSuccess(false); setPurchaseFormData({ name: '', phone: '', memo: '' }); }} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center gap-3 min-w-0 max-w-full hover:border-purple-300 hover:shadow-lg cursor-pointer group transition-all shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-slate-50 border border-slate-100/60 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-800 text-sm sm:text-base break-words line-clamp-2">{p.name}</h4>
                      <p className="text-xs font-bold text-slate-400 line-clamp-2 mt-0.5 break-words">{p.description || t('user_landing.products.no_desc')}</p>
                      
                      {/* 옵션 표시 */}
                      {p.options && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.options.split(',').map((opt: string, idx: number) => (
                            <span key={idx} className="text-[9px] font-black tracking-wide bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg uppercase">
                              {opt.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              ))}

              {allProducts.length === 0 && (
                <div className="bg-white rounded-[2rem] border border-slate-100/80 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                  <ShoppingCart className="w-12 h-12 text-slate-200 mb-4" />
                  <p className="font-black text-slate-400">{t('user_landing.products.empty_list')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 탭 3: 내 지갑 — NFC 태그 세션에서만 사용, 관리자 매칭 골드바 자동 표시 */}
        {activeTab === 'myWallet' && (
          <div className="w-full max-w-md space-y-5 flex-1 flex flex-col h-full animate-in fade-in duration-300">
            {!canUseWalletFeatures(currentUser) ? (
              <div className="bg-white rounded-[2rem] border border-amber-200/70 p-8 flex flex-col items-center text-center shadow-sm">
                <ShieldCheck className="w-14 h-14 text-amber-500 mb-4" />
                <h3 className="text-lg font-black text-slate-800 tracking-tight">{t('user_landing.wallet.login_required_title')}</h3>
                <p className="text-xs font-bold text-slate-500 mt-3 leading-relaxed">
                  {t('user_landing.wallet.login_required_desc')}
                </p>
                <Link
                  to={loginPathWithNext('wallet')}
                  className="mt-5 inline-flex h-12 items-center justify-center px-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm rounded-2xl shadow-lg"
                >
                  {t('user_landing.wallet.login_signup_btn')}
                </Link>
              </div>
            ) : (
              <>
            <div className="flex items-end justify-between px-1">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-800">{t('user_landing.wallet.wallet_title')}</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">
                  {t('user_landing.wallet.wallet_desc')}
                </p>
              </div>
              {walletLoading && <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />}
            </div>

            {!nfcTagSession && myGoldbars.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-600 leading-relaxed">
                {t('user_landing.wallet.no_tag_connected')}
              </div>
            )}

            {/* 지갑에 저장된 상품 카드 리스트 */}
            <div className="grid gap-4">
              {myGoldbars.map((g, index) => {
                const isCatalog = g.wallet_source === 'catalog_product';
                return (
                <div key={`${String(g.id)}-${index}`} className="bg-white p-5 rounded-3xl border border-slate-100/60 hover:border-amber-400/50 hover:shadow-md group transition-all flex flex-col gap-4 shadow-sm relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 text-7xl font-black text-slate-100/50 select-none">0{index + 1}</div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-200/40 shrink-0 overflow-hidden">
                        {g.image_url && isCatalog ? (
                          <img src={g.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Award className="w-6 h-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                          {isCatalog ? t('user_landing.wallet.registered_product') : 'CERTIFIED GOLDBAR'}
                        </span>
                        <h4 className="font-black text-slate-800 text-base mt-0.5 break-words">{g.serial_number}</h4>
                      </div>
                    </div>
                    {/* 삭제 기능 제공 */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        void (async () => {
                          const okRemove = await showConfirm({
                            title: t('user_landing.wallet.remove_confirm_title'),
                            message: t('user_landing.wallet.remove_confirm_message'),
                            confirmLabel: t('user_landing.wallet.remove_confirm_btn'),
                            cancelLabel: t('common.cancel'),
                            tone: 'danger',
                          });
                          if (!okRemove) return;
                          const updated = myGoldbars.filter((_, i) => i !== index);
                          setMyGoldbars(updated);
                          if (!canUseWalletFeatures(currentUser)) {
                            persistGuestTagPreview(updated);
                          }
                        })();
                      }}
                      className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-100 rounded-xl transition-all shadow-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="border-t border-slate-50 pt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">{t('user_landing.wallet.weight')}</span><span className="text-xs font-black text-slate-700">{g.weight || '-'}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">{t('user_landing.wallet.purity')}</span><span className="text-xs font-black text-slate-700">{g.purity || '-'}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">{isCatalog ? t('user_landing.wallet.type_label') : t('user_landing.wallet.minted_date')}</span><span className="text-xs font-black text-slate-700">{isCatalog ? t('user_landing.wallet.catalog_matched') : g.minted_at || '-'}</span></div>
                    
                    {/* 관리자가 설정한 현재 시세 노출 */}
                    {Number(g.show_market_price) === 1 && calculateCurrentPrice(g.weight, g.market_price_per_gram) !== null && (
                      <div className="flex flex-col bg-amber-50/60 px-2 py-1 rounded-lg border border-amber-100/50">
                        <span className="text-[9px] font-black text-amber-700 uppercase tracking-tighter">{t('user_landing.wallet.market_price_title')}</span>
                        <span className="text-xs font-black text-amber-900 tabular-nums">
                          {calculateCurrentPrice(g.weight, g.market_price_per_gram)?.toLocaleString()}원
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWalletDetailItem(g);
                      }}
                      className="h-10 rounded-xl border border-slate-200 bg-white text-slate-700 font-black text-[10px] sm:text-[11px] flex items-center justify-center gap-1 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      {isCatalog ? t('user_landing.wallet.detail_btn') : t('user_landing.wallet.info_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserGuaranteePreview(
                          isCatalog
                            ? mapProductToGuaranteeData(catalogWalletRowToProductRecord(g as Record<string, unknown>))
                            : mapGoldbarWalletToGuaranteeData(g as Record<string, unknown>)
                        );
                      }}
                      className="h-10 rounded-xl border border-slate-200 bg-white text-slate-700 font-black text-[10px] sm:text-[11px] flex items-center justify-center gap-1 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      {t('user_landing.wallet.preview_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserGuaranteePdf(
                          isCatalog
                            ? mapProductToGuaranteeData(catalogWalletRowToProductRecord(g as Record<string, unknown>))
                            : mapGoldbarWalletToGuaranteeData(g as Record<string, unknown>)
                        );
                      }}
                      className="h-10 rounded-xl border border-amber-200/80 bg-amber-50 text-amber-900 font-black text-[10px] sm:text-[11px] flex items-center justify-center gap-1 hover:bg-amber-100 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      {t('user_landing.wallet.pdf_btn')}
                    </button>
                  </div>

                  {/* 골드바 인증 연결 시에만 전자앨범 (카탈로그만 매칭된 제품은 앨범 미지원) */}
                  {!isCatalog && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAlbum(g);
                    }}
                    className="w-full h-11 bg-amber-50 border border-amber-200/40 hover:bg-amber-100 hover:border-amber-300 rounded-xl flex items-center justify-center text-xs font-black text-amber-700 transition-all gap-1.5 mt-2"
                  >
                    {t('user_landing.wallet.album_btn_open')}
                  </button>
                  )}

                  {/* 오늘의 시세 및 가치 환산 정보 (권한이 부여된 고객에게만 노출) */}
                  {g.show_market_price === 1 && (
                    <div className="bg-amber-50/50 border border-amber-200/40 p-4 rounded-2xl flex flex-col gap-2 mt-2 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💰</span>
                          <span className="text-xs font-black text-amber-900">{t('user_landing.wallet.market_price_title')}</span>
                        </div>
                        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">LIVE</span>
                      </div>
                      <div className="border-t border-amber-200/30 pt-2 flex flex-col gap-1 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">{t('user_landing.wallet.market_price_per_gram')}</span>
                          <span className="text-xs font-black text-slate-800">
                            {Number(g.market_price_per_gram || 110000).toLocaleString()}원
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">{t('user_landing.wallet.my_goldbar_weight')}</span>
                          <span className="text-xs font-black text-slate-800">{g.weight}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-amber-200/30 pt-1.5 mt-0.5">
                          <span className="text-xs font-black text-amber-900">{t('user_landing.wallet.my_goldbar_total_value')}</span>
                          <span className="text-sm font-black text-amber-600">
                            {(() => {
                              // 중량에서 숫자만 추출 (예: '10g' -> 10)
                              const numericWeight = parseFloat(g.weight.replace(/[^0-9.]/g, '')) || 0;
                              return Math.round(numericWeight * (g.market_price_per_gram || 110000)).toLocaleString();
                            })()}원
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {g.cert_url && (
                    <a href={g.cert_url} target="_blank" rel="noreferrer" className="w-full h-11 bg-slate-50 border border-slate-100 hover:bg-amber-50 hover:border-amber-200/60 rounded-xl flex items-center justify-center text-xs font-black text-slate-600 hover:text-amber-700 transition-all gap-1.5 no-underline mt-1">
                      <ShieldCheck className="w-4 h-4" /> {t('user_landing.wallet.cert_url_btn')}
                    </a>
                  )}
                </div>
              );
              })}

              {myGoldbars.length === 0 && (
                <div className="bg-white rounded-3xl border border-slate-100 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                  <Award className="w-12 h-12 text-slate-200 mb-4" />
                  <p className="font-black text-slate-400 text-sm">{t('user_landing.wallet.no_items')}</p>
                  <p className="text-xs font-bold text-slate-400/80 mt-1 leading-relaxed">
                    {t('user_landing.wallet.empty_wallet_desc')}
                  </p>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* 제품 상세 & 구매 문의 폼 모달 */}
        {selectedProduct && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 lg:p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setSelectedProduct(null)}></div>
            <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] min-h-0 overflow-hidden">
              <header className="shrink-0 p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40">
                <h4 className="text-lg font-black text-slate-800 tracking-tight">{t('user_landing.products.detail_modal_title')}</h4>
                <button onClick={() => setSelectedProduct(null)} className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </header>

              {!purchaseSuccess ? (
                <div className="p-6 overflow-y-auto overflow-x-hidden min-h-0 flex-1 space-y-6 pb-10">
                  {/* 상단: 제품 이미지·이름·설명 */}
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 bg-slate-50 border border-slate-100 rounded-3xl overflow-hidden shadow-sm flex-shrink-0">
                      <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black bg-purple-100 text-purple-700 px-2.5 py-1 rounded-xl uppercase tracking-wider">{t('user_landing.products.new_arrival')}</span>
                      <h5 className="font-black text-slate-800 text-lg mt-1 break-words">{selectedProduct.name}</h5>
                      <p className="text-xs font-bold text-slate-400 leading-relaxed mt-1 break-words">
                        {selectedProduct.description || t('user_landing.products.no_description')}
                      </p>
                    </div>
                  </div>

                  {/* 옵션 뱃지 리스트 */}
                  {selectedProduct.options && (
                    <div className="border-t border-slate-50 pt-3 flex flex-wrap gap-1.5">
                      {selectedProduct.options.split(',').map((opt: string, i: number) => (
                        <span key={i} className="text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl">
                          {opt.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setUserGuaranteePreview(
                          mapProductToGuaranteeData(selectedProduct as Record<string, unknown>)
                        )
                      }
                      className="h-12 rounded-2xl border border-slate-200 bg-white text-slate-700 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <Eye className="w-4 h-4 shrink-0 text-amber-600" /> {t('user_landing.products.preview_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUserGuaranteePdf(mapProductToGuaranteeData(selectedProduct as Record<string, unknown>))
                      }
                      className="h-12 rounded-2xl border border-amber-200/80 bg-amber-50 text-amber-900 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 hover:bg-amber-100 transition-all shadow-sm"
                    >
                      <Download className="w-4 h-4 shrink-0" /> {t('user_landing.products.pdf_save_btn')}
                    </button>
                  </div>

                  {/* 구매/상담 신청 폼 */}
                  <form onSubmit={handlePurchaseSubmit} className="bg-slate-50/80 p-5 rounded-[1.8rem] border border-slate-100/60 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
                      <h6 className="text-xs font-black text-slate-700">{t('user_landing.products.form_title')}</h6>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('user_landing.products.form_name_label')}</label>
                      <input 
                        required type="text" value={purchaseFormData.name}
                        onChange={(e) => setPurchaseFormData({ ...purchaseFormData, name: e.target.value })}
                        className="w-full h-12 bg-white border border-slate-100 rounded-xl px-4 text-xs font-bold focus:border-purple-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('user_landing.products.form_phone')}</label>
                      <input 
                        required type="tel" placeholder={t('user_landing.products.form_phone_placeholder')} value={purchaseFormData.phone}
                        onChange={(e) => setPurchaseFormData({ ...purchaseFormData, phone: e.target.value })}
                        className="w-full h-12 bg-white border border-slate-100 rounded-xl px-4 text-xs font-bold focus:border-purple-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('user_landing.products.form_memo')}</label>
                      <textarea 
                        rows={2} value={purchaseFormData.memo}
                        onChange={(e) => setPurchaseFormData({ ...purchaseFormData, memo: e.target.value })}
                        className="w-full p-3 bg-white border border-slate-100 rounded-xl text-xs font-bold resize-none focus:border-purple-500 focus:outline-none transition-all"
                      />
                    </div>

                    <button type="submit" className="w-full h-14 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-black rounded-xl text-sm shadow-xl shadow-purple-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4">
                      <MessageSquare className="w-4.5 h-4.5" /> {t('user_landing.products.form_submit_complete')}
                    </button>
                  </form>
                </div>
              ) : (
                /* 구매/신청 완료 화면 */
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 my-6">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-black text-slate-800">{t('user_landing.products.success_title')}</h4>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed max-w-xs whitespace-pre-line">
                    {t('user_landing.products.success_desc')}
                  </p>
                  <button onClick={() => setSelectedProduct(null)} className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs mt-6 transition-all">
                    {t('user_landing.products.close_btn')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 추억 전자 앨범 모달 */}
        {isAlbumModalOpen && currentGoldbarForAlbum && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 lg:p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsAlbumModalOpen(false)}></div>
            <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] overflow-hidden">
              <header className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40">
                <div>
                  <h4 className="text-lg font-black text-slate-800 tracking-tight">{t('user_landing.album.modal_title')}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{t('user_landing.album.modal_subtitle')}</p>
                </div>
                <button onClick={() => setIsAlbumModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 pb-10">
                {/* 사진 개수 표시 및 설명 */}
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <h5 className="font-black text-amber-800 text-xs">{t('user_landing.album.status_label', { count: albumData.images.length })}</h5>
                    <p className="text-[10px] font-bold text-amber-600 mt-0.5">{t('user_landing.album.status_desc')}</p>
                  </div>
                  <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-xl uppercase tracking-wider">Storage Status</span>
                </div>

                {/* 앨범 이미지 리스트 */}
                {albumData.images && albumData.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {albumData.images.map((img: any, idx: number) => (
                      <div key={idx} className="relative group bg-slate-50 border border-slate-100/60 rounded-2xl overflow-hidden aspect-square flex flex-col shadow-sm">
                        <img src={img.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleDeleteAlbumImage(img.id)}
                            className="p-2.5 bg-white/90 hover:bg-rose-50 rounded-xl text-rose-500 transition-all hover:scale-110 shadow-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-100 p-10 rounded-2xl flex flex-col items-center justify-center text-center">
                    <Award className="w-10 h-10 text-slate-200 mb-3" />
                    <p className="text-xs font-black text-slate-400">{t('user_landing.album.no_images')}</p>
                  </div>
                )}

                {/* 사진 업로드 폼 */}
                {albumData.images.length < 5 && (
                  <div className="border-t border-slate-100/60 pt-5 space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{t('user_landing.album.upload_label')}</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleAlbumImageUpload}
                        disabled={uploadingImage}
                        className="text-xs text-slate-500 font-bold file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 file:cursor-pointer cursor-pointer"
                      />
                    </div>
                    {uploadingImage && (
                      <p className="text-[10px] font-bold text-amber-600 animate-pulse">{t('user_landing.album.uploading_msg')}</p>
                    )}
                  </div>
                )}

                <button onClick={() => setIsAlbumModalOpen(false)} className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs transition-all">
                  {t('user_landing.album.close_btn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 사용방법 가이드 모달 */}
        {showGuideModal && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 lg:p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowGuideModal(false)}></div>
            <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] overflow-hidden">
              <header className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40">
                <div>
                  <h4 className="text-lg font-black text-slate-800 tracking-tight">{t('user_landing.home.guide_modal_title')}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{t('user_landing.home.guide_modal_subtitle')}</p>
                </div>
                <button onClick={() => setShowGuideModal(false)} className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 pb-10">
                <div className="space-y-4">
                  {[
                    {
                      step: '01',
                      title: t('user_landing.home.guide_step1_title'),
                      desc: t('user_landing.home.guide_step1_desc'),
                      icon: Smartphone
                    },
                    {
                      step: '02',
                      title: t('user_landing.home.guide_step2_title'),
                      desc: t('user_landing.home.guide_step2_desc'),
                      icon: ShieldCheck
                    },
                    {
                      step: '03',
                      title: t('user_landing.home.guide_step3_title'),
                      desc: t('user_landing.home.guide_step3_desc'),
                      icon: Bookmark
                    },
                    {
                      step: '04',
                      title: t('user_landing.home.guide_step4_title'),
                      desc: t('user_landing.home.guide_step4_desc'),
                      icon: Award
                    }
                  ].map((item, index) => (
                    <div key={index} className="bg-slate-50/70 border border-slate-100/80 rounded-2xl p-4 flex gap-4 hover:border-amber-400/40 hover:shadow-sm transition-all group">
                      <div className="w-12 h-12 rounded-xl bg-amber-50 group-hover:bg-amber-100/60 border border-amber-200/40 flex items-center justify-center text-amber-600 flex-shrink-0 transition-colors">
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h5 className="font-black text-slate-800 text-sm group-hover:text-amber-800 transition-colors">{item.title}</h5>
                          <span className="text-[10px] font-black text-amber-600 tracking-widest bg-amber-50 px-2 py-0.5 rounded-lg uppercase border border-amber-100/60">STEP {item.step}</span>
                        </div>
                        <p className="text-slate-500 text-xs font-bold leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => setShowGuideModal(false)} className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-xl text-sm shadow-xl shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  {t('user_landing.home.guide_confirm_btn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 내 지갑 카드 — 상세 보기 */}
        {walletDetailItem && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 lg:p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setWalletDetailItem(null)}></div>
            <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] min-h-0 overflow-hidden">
              <header className="shrink-0 p-5 sm:p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40 gap-2">
                <h4 className="text-lg font-black text-slate-800 tracking-tight min-w-0">
                  {walletDetailItem.wallet_source === 'catalog_product' ? t('user_landing.products.detail_modal_title') : t('user_landing.wallet.cert_details')}
                </h4>
                <button
                  type="button"
                  onClick={() => setWalletDetailItem(null)}
                  className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>
              <div className="p-6 overflow-y-auto overflow-x-hidden min-h-0 flex-1 space-y-5 pb-10">
                {walletDetailItem.wallet_source === 'catalog_product' ? (
                  <>
                    <div className="flex items-start gap-4">
                      <div className="w-24 h-24 sm:w-28 sm:h-28 bg-slate-50 border border-slate-100 rounded-3xl overflow-hidden shadow-sm flex-shrink-0">
                        {walletDetailItem.image_url ? (
                          <img src={walletDetailItem.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-amber-200">
                            <Award className="w-10 h-10" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl uppercase tracking-wider">
                          {t('user_landing.wallet.registered_product')}
                        </span>
                        <h5 className="font-black text-slate-800 text-lg mt-1 break-words">
                          {walletDetailItem.name || walletDetailItem.serial_number}
                        </h5>
                        <p className="text-xs font-bold text-slate-500 leading-relaxed mt-1 break-words">
                          {walletDetailItem.description?.trim()
                            ? walletDetailItem.description
                            : t('user_landing.products.no_description')}
                        </p>
                      </div>
                    </div>
                    {walletDetailItem.options && String(walletDetailItem.options).trim() !== '' && (
                      <div className="border-t border-slate-50 pt-3 flex flex-wrap gap-1.5">
                        {String(walletDetailItem.options)
                          .split(',')
                          .map((opt: string, i: number) => (
                            <span
                              key={i}
                              className="text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl"
                            >
                              {opt.trim()}
                            </span>
                          ))}
                      </div>
                    )}
                    <div className="space-y-2 text-xs">
                      {walletDetailItem.weight != null && String(walletDetailItem.weight).trim() !== '' && (
                        <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-400">{t('user_landing.wallet.weight')}</span>
                          <span className="font-black text-slate-800">{walletDetailItem.weight}</span>
                        </div>
                      )}
                      {walletDetailItem.purity != null && String(walletDetailItem.purity).trim() !== '' && (
                        <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-400">{t('user_landing.wallet.purity')}</span>
                          <span className="font-black text-slate-800">{walletDetailItem.purity}</span>
                        </div>
                      )}
                      {walletDetailItem.material != null && String(walletDetailItem.material).trim() !== '' && (
                        <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-400">{t('user_landing.wallet.material')}</span>
                          <span className="font-black text-slate-800">{walletDetailItem.material}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {walletDetailItem.video_url ? (
                        <a
                          href={walletDetailItem.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg text-sm no-underline"
                        >
                          <Play className="w-4 h-4 fill-white" /> {t('user_landing.product.video_btn')}
                        </a>
                      ) : (
                        <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
                          {t('user_landing.product.no_video')}
                        </div>
                      )}
                      {walletDetailItem.manual_url ? (
                        <a
                          href={walletDetailItem.manual_url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-3.5 bg-slate-100 text-slate-700 font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 text-sm no-underline"
                        >
                          <Download className="w-4 h-4" /> {t('user_landing.product.manual_btn')}
                        </a>
                      ) : (
                        <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
                          {t('user_landing.product.no_manual')}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-sm space-y-2">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">{t('user_landing.wallet.serial_number')}</span>
                        <span className="font-black font-mono text-slate-800 text-right break-all">
                          {String(walletDetailItem.serial_number ?? '—')}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">{t('user_landing.wallet.weight')}</span>
                        <span className="font-black text-slate-800">{walletDetailItem.weight || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">{t('user_landing.wallet.purity')}</span>
                        <span className="font-black text-amber-600">{walletDetailItem.purity || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">{t('user_landing.wallet.minted_date')}</span>
                        <span className="font-black text-slate-800">{walletDetailItem.minted_at || '—'}</span>
                      </div>
                    </div>
                    {walletDetailItem.download_token != null &&
                      walletDetailItem.id != null &&
                      typeof walletDetailItem.id === 'number' && (
                        <a
                          href={`/api/goldbars/download/${walletDetailItem.id}?token=${encodeURIComponent(String(walletDetailItem.download_token))}`}
                          download
                          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg text-sm no-underline"
                        >
                          <Download className="w-5 h-5" /> {t('user_landing.goldbar.download_pdf')}
                        </a>
                      )}
                    {walletDetailItem.cert_url && (
                      <a
                        href={walletDetailItem.cert_url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full h-11 bg-slate-50 border border-slate-100 hover:bg-amber-50 rounded-xl flex items-center justify-center text-xs font-black text-slate-600 hover:text-amber-700 no-underline"
                      >
                        <ShieldCheck className="w-4 h-4" /> {t('user_landing.wallet.cert_url_btn')}
                      </a>
                    )}

                    {/* 소유권 해지 요청 버튼 추가 */}
                    <div className="pt-2">
                      {walletDetailItem.release_status === 'PENDING' ? (
                        <div className="w-full py-3.5 bg-slate-100 text-slate-400 font-black rounded-2xl flex items-center justify-center gap-2 border border-slate-200 text-sm">
                          {t('user_landing.wallet.ownership_release_pending')}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReleaseRequest(walletDetailItem.id || walletDetailItem.goldbar_id)}
                          className="w-full py-3.5 bg-rose-50 text-rose-600 font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-rose-100 border border-rose-200 transition-all text-sm"
                        >
                          {t('user_landing.wallet.ownership_release_btn')}
                        </button>
                      )}
                      <p className="text-[10px] font-bold text-slate-400 text-center mt-2 px-4 leading-relaxed">
                        {t('user_landing.wallet.ownership_release_tip')}
                      </p>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() =>
                      setUserGuaranteePreview(
                        walletDetailItem.wallet_source === 'catalog_product'
                          ? mapProductToGuaranteeData(
                              catalogWalletRowToProductRecord(walletDetailItem as Record<string, unknown>)
                            )
                          : mapGoldbarWalletToGuaranteeData(walletDetailItem as Record<string, unknown>)
                      )
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-white text-slate-700 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 shadow-sm"
                  >
                    <Eye className="w-4 h-4 shrink-0 text-amber-600" /> {t('user_landing.wallet.preview_cert')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setUserGuaranteePdf(
                        walletDetailItem.wallet_source === 'catalog_product'
                          ? mapProductToGuaranteeData(
                              catalogWalletRowToProductRecord(walletDetailItem as Record<string, unknown>)
                            )
                          : mapGoldbarWalletToGuaranteeData(walletDetailItem as Record<string, unknown>)
                      )
                    }
                    className="h-12 rounded-2xl border border-amber-200/80 bg-amber-50 text-amber-900 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 hover:bg-amber-100 shadow-sm"
                  >
                    <Download className="w-4 h-4 shrink-0" /> {t('user_landing.wallet.pdf_save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {userGuaranteePdf && (
          <GuaranteePdfHost data={userGuaranteePdf} onDone={() => setUserGuaranteePdf(null)} />
        )}

        <GuaranteeCertificatePreviewModal
          data={userGuaranteePreview}
          onClose={() => setUserGuaranteePreview(null)}
        />

        {/* 푸터 */}
        <footer className="w-full max-w-md text-center border-t border-slate-100/60 pt-5 mt-auto">
          <p className="text-[10px] text-slate-400 font-bold leading-relaxed whitespace-pre-line">
            {t('user_landing.footer.tip')}
          </p>
        </footer>
      </div>
    );
  }

  // ==========================================
  // [Case B] 에러 발생 시
  // ==========================================
  if (error || (!product && !goldbar && tagId)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
        </div>
        <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-center text-rose-500 mb-4 animate-bounce">
          <Award className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-slate-800 tracking-tight">{t('user_landing.error.title')}</h3>
        <p className="text-xs font-bold text-slate-400 mt-1 max-w-xs leading-relaxed">
          {t('user_landing.error.desc')}
        </p>
        <Link to="/" className="mt-8 text-xs font-black text-primary hover:underline">
          {t('user_landing.error.home_link')}
        </Link>
      </div>
    );
  }

  // ==========================================
  // [Case C] 골드바 인증 성공 UI
  // ==========================================
  if (goldbar) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center p-6 pb-20 font-sans leading-relaxed text-slate-900 animate-in fade-in duration-500 select-none">
        <header className="w-full max-w-md flex flex-col gap-2 mb-8">
          <div className="flex justify-between items-center gap-2">
            <Link to="/" className="text-xs font-black text-amber-600 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200/60 hover:bg-amber-100 transition-all no-underline shrink-0">
              ← {t('user_landing.header.tab_home')}
            </Link>
            <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
          </div>
          <div className="flex justify-end">
            <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> {t('user_landing.unmap.success_title')}
            </span>
          </div>
        </header>

        <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-amber-100/80 shadow-xl p-8 mb-6 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-amber-50 rounded-full opacity-40 blur-3xl"></div>
          
          <div className="w-16 h-16 rounded-3xl bg-amber-50 border-2 border-amber-200/60 flex items-center justify-center text-amber-600 mb-6 shadow-sm">
            <Award className="w-8 h-8" />
          </div>

          <p className="text-xs font-black text-amber-600 tracking-wider uppercase">Genuine Goldbar Certificate</p>
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 mb-3 mt-1">{t('user_landing.goldbar.title')}</h2>

          <div className="w-full bg-slate-50 rounded-2xl p-5 text-sm space-y-3.5 border border-slate-100/60 text-left mt-4 mb-6">
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t('user_landing.wallet.serial_number')}</span><span className="font-black font-mono text-slate-800 text-base">{goldbar.serial_number}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t('user_landing.wallet.weight')}</span><span className="font-black text-slate-800">{goldbar.weight}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t('user_landing.wallet.purity')}</span><span className="font-black text-amber-600 text-base">{goldbar.purity}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">{t('user_landing.wallet.minted_date')}</span><span className="font-black text-slate-800">{goldbar.minted_at || '-'}</span></div>
            {Number(goldbar.show_market_price) === 1 && calculateCurrentPrice(goldbar.weight, goldbar.market_price_per_gram) !== null && (
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-amber-700 font-black">{t('user_landing.wallet.market_price_title')}</span>
                <span className="font-black text-amber-900 text-lg tabular-nums">
                  {calculateCurrentPrice(goldbar.weight, goldbar.market_price_per_gram)?.toLocaleString()}원
                </span>
              </div>
            )}
          </div>

          <a 
            href={`/api/goldbars/download/${goldbar.id}?token=${goldbar.download_token}`} 
            download 
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-amber-500/25 transition-all text-sm no-underline"
          >
            <Download className="w-5 h-5" /> {t('user_landing.goldbar.download_pdf')}
          </a>
        </div>

        <p className="text-[11px] font-bold text-slate-400 text-center max-w-xs leading-relaxed">
          {t('user_landing.goldbar.tip')}
        </p>
      </div>
    );
  }

  // ==========================================
  // [Case D] 일반 제품 인증 성공 UI
  // ==========================================
  const displayData = product || {
    name: 'J-Eros Premium Jewelry',
    description: 'Scan the NFC tag to check genuine product information.',
    video_url: '',
    manual_url: '',
    image_url: '/jewelry.png',
    options: ''
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB] flex flex-col items-center p-6 pb-20 font-sans leading-relaxed text-slate-900 animate-in fade-in duration-500 select-none">
      <header className="w-full max-w-md flex flex-col gap-2 mb-8">
        <div className="flex justify-between items-center gap-2">
          <Link to="/" className="text-xs font-black text-purple-600 bg-purple-50 px-4 py-2 rounded-xl border border-purple-200/60 hover:bg-purple-100 transition-all no-underline shrink-0">
            ← {t('user_landing.header.tab_home')}
          </Link>
          <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
        </div>
        <div className="flex justify-end">
          <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> {t('user_landing.unmap.success_title')}
          </span>
        </div>
      </header>

      <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-100/60 shadow-xl p-6 mb-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-purple-50 border border-purple-100 rounded-3xl flex items-center justify-center text-purple-600 mb-4 overflow-hidden shadow-inner">
          <img src={displayData.image_url} alt="" className="w-full h-full object-cover" />
        </div>

        <h3 className="text-2xl font-black text-slate-900 mb-1">{displayData.name}</h3>
        <p className="text-xs font-bold text-slate-400 max-w-xs leading-relaxed mb-4">{displayData.description}</p>

        {/* 제품 옵션 표시 */}
        {displayData.options && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-6">
            {displayData.options.split(',').map((opt: string, idx: number) => (
              <span key={idx} className="text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl">
                {opt.trim()}
              </span>
            ))}
          </div>
        )}

        <div className="w-full space-y-3">
          {displayData.video_url ? (
            <a href={displayData.video_url} target="_blank" rel="noreferrer" className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-500/20 hover:from-purple-600 hover:to-indigo-600 transition-all text-sm no-underline">
              <Play className="w-4.5 h-4.5 fill-white" /> {t('user_landing.product.video_btn')}
            </a>
          ) : (
            <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
              {t('user_landing.product.no_video')}
            </div>
          )}
          {displayData.manual_url ? (
            <a href={displayData.manual_url} target="_blank" rel="noreferrer" className="w-full py-3.5 bg-slate-100 text-slate-700 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-200 transition-all text-sm no-underline">
              <Download className="w-4.5 h-4.5" /> {t('user_landing.product.manual_btn')}
            </a>
          ) : (
            <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
              {t('user_landing.product.no_manual')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
