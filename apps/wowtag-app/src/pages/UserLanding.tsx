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
  currentUser: { email?: string } | null;
  onLogout: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 shrink-0 ${className}`.trim()}>
      {currentUser ? (
        <>
          <span className="hidden sm:inline text-[10px] font-bold text-slate-500 max-w-[88px] truncate">
            {currentUser.email}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="text-[10px] sm:text-[11px] font-black text-slate-600 hover:text-rose-600 border border-slate-200/80 bg-white/90 rounded-xl px-2.5 py-1.5 transition-colors shadow-sm"
          >
            로그아웃
          </button>
        </>
      ) : (
        <Link
          to={loginPathWithNext()}
          className="text-[10px] sm:text-[11px] font-black text-amber-700 hover:text-amber-800 border border-amber-200/80 bg-amber-50/90 rounded-xl px-2.5 py-1.5 no-underline transition-colors shadow-sm"
        >
          로그인
        </Link>
      )}
      <Link
        to="/login"
        className="text-[10px] sm:text-[11px] font-black text-slate-500 hover:text-purple-600 border border-slate-200/80 bg-white/90 rounded-xl px-2.5 py-1.5 no-underline transition-colors shadow-sm"
      >
        관리자
      </Link>
    </div>
  );
}

export default function UserLanding() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
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

  const promptLoginForWallet = useCallback(() => {
    if (window.confirm('내 지갑·전자앨범은 로그인 후 NFC 태그를 연결해야 이용할 수 있습니다. 로그인 화면으로 이동할까요?')) {
      navigate(loginPathWithNext('wallet'));
    }
  }, [navigate]);

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
      promptLoginForWallet();
      return;
    }
    const inWallet = myGoldbars.some(
      (w) => w.id === g.id || (w.serial_number && w.serial_number === g.serial_number)
    );
    if (!inWallet) {
      showToast('info', 'NFC 태그를 스캔해 내 지갑에 연결한 뒤 전자앨범을 이용해 주세요.');
      return;
    }
    setCurrentGoldbarForAlbum(g);
    setIsAlbumModalOpen(true);
    fetchAlbum(g.id || g.serial_number);
  };

  /** [신규] 소유권 해지 요청 */
  const handleReleaseRequest = async (goldbarId: number) => {
    if (!currentUser) {
      showToast('info', '로그인이 필요한 서비스입니다.');
      return;
    }
    if (!confirm('소유권을 해지 요청하시겠습니까? 관리자 승인 후 재판매 가능한 상태가 됩니다.')) return;

    try {
      const res = await fetch('/api/user/goldbars/release-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          goldbarId: goldbarId,
          message: '재판매를 위한 소유권 해지 요청'
        }),
      });

      if (res.ok) {
        showToast('success', '소유권 해지 요청이 완료되었습니다. 관리자 승인 후 목록에서 삭제됩니다.');
        await syncWalletForUser(currentUser.id);
      } else {
        const d = await res.json();
        showToast('error', d.error || '요청 처리에 실패했습니다.');
      }
    } catch (err) {
      showToast('error', '오류가 발생했습니다.');
    }
  };

  // 앨범 사진 파일 선택 & 업로드
  const handleAlbumImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentGoldbarForAlbum) return;
    if (!canUseWalletFeatures(currentUser)) {
      showToast('info', '전자앨범 업로드는 로그인 후 이용할 수 있습니다.');
      return;
    }

    if (albumData.images.length >= 5) {
      showToast('warning', '최대 5장까지만 등록 가능합니다.');
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
          showToast('error', d.error || '업로드에 실패했습니다.');
        }
      } catch (err: any) {
        showToast('error', '업로드 요청 실패');
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 앨범 사진 삭제
  const handleDeleteAlbumImage = async (imageId: any) => {
    if (!confirm('정말 이 사진을 삭제하시겠습니까?')) return;
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
      showToast('info', '이미 앱(홈 화면 설치) 모드에서 실행 중입니다.');
      return;
    }

    if (isIosDevice) {
      showToast(
        'info',
        'iPhone/iPad Safari에서는 다음 순서로 추가할 수 있습니다.\n\n' +
          '1) 하단 공유 버튼(□↑) 을 누른 뒤\n' +
          '2) 「홈 화면에 추가」를 선택해 주세요.\n\n' +
          'Chrome 앱이 아닌 Safari로 열어 주시면 설치가 더 안정적입니다.',
        8000
      );
      return;
    }

    const p = installPromptRef.current;
    if (!p) {
      showToast(
        'info',
        '이 환경에서는 자동 설치 창을 띄울 수 없습니다.\n\n' +
          '【안드로이드 Chrome】\n' +
          '1) 주소창 오른쪽의 ⊕ 설치 아이콘을 누르거나\n' +
          '2) 우측 상단 ⋮ 메뉴 → 「앱 설치」 또는 「홈 화면에 추가」\n\n' +
          '인스타/카카오 등 앱 안 웹뷰가 아닌, Chrome으로 사이트를 열어 주세요.',
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
        '설치 창을 열지 못했습니다. Chrome을 최신으로 유지한 뒤, 주소창의 설치(⊕) 아이콘 또는 ⋮ 메뉴의 「앱 설치」를 이용해 주세요.'
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
            setError('태그를 찾을 수 없거나 등록되지 않았습니다.');
            setLoading(false);
            return;
          }
          setAdminUnmapScanOk(true);
          setLoading(false);
          return;
        } catch (e: any) {
          setError(e?.message || '인증 기록에 실패했습니다.');
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

        throw new Error('등록된 정품 정보가 없습니다.');
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchData();
  }, [tagId, navigate, location.search]);

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
      showToast('warning', '필수 정보를 입력해 주세요.');
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
        <h3 className="text-xl font-black text-slate-800 tracking-tight">태그 인증이 기록되었습니다</h3>
        <p className="text-xs font-bold text-slate-500 mt-2 max-w-sm leading-relaxed">
          관리자 화면(태그 탭)에서 같은 태그의 <span className="text-emerald-700">「매칭 해제」</span>를 눌러
          해제를 완료하세요. 이 화면은 15분 이내에 연결됩니다.
        </p>
        <p className="text-[10px] font-mono font-bold text-slate-400 mt-4 break-all max-w-full">{tagId}</p>
        <Link to="/" className="mt-8 text-xs font-black text-emerald-700 hover:underline">
          홈으로 이동
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
            <span className="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight truncate">Gold SyncTag</span>
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
              NFC 태그로 정품 확인이 가능합니다.{' '}
              <Link to={loginPathWithNext('wallet')} className="text-amber-700 underline underline-offset-2">
                로그인
              </Link>
              하시면 내 지갑에 저장되어 나중에도 볼 수 있습니다.
            </p>
          </div>
        )}

        {/* PWA 설치 유도 (Chrome: 이벤트 수신 시 / iOS: 수동 안내) */}
        {showInstallBanner && (
          <div className="w-full max-w-md bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/50 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 shadow-sm animate-in fade-in duration-300">
            <div className="min-w-0 flex-1">
              <h5 className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                <span>📱</span> Gold SyncTag 전용 앱 설치
              </h5>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                {isIosDevice
                  ? 'Safari에서 홈 화면에 추가하면 앱처럼 사용할 수 있습니다.'
                  : '앱으로 설치하여 더욱 편리하게 정품인증을 이용해 보세요.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleInstallApp}
              className="shrink-0 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-[11px] rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all cursor-pointer shadow-md shadow-amber-500/10 whitespace-nowrap active:scale-[0.98]"
            >
              {isIosDevice ? '설치 방법' : '앱 설치하기'}
            </button>
          </div>
        )}

        {/* 상단 탭 전환 바 */}
        {/* z-index: 모달(z-150)보다 낮게 — 전체 상품 상세 열릴 때 탭이 콘텐츠를 덮지 않음 */}
        <div className="w-full max-w-md bg-white p-1.5 rounded-2xl border border-slate-100/80 flex gap-1 mb-5 shadow-sm relative z-10">
          <button 
            onClick={() => goToUserTab('home')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'home' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <Info className="w-4 h-4" />
            홈
          </button>
          <button 
            onClick={() => goToUserTab('products')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'products' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <ShoppingCart className="w-4 h-4" />
            전체 상품
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
                  <h4 className="text-xl font-black text-slate-800 tracking-tight">Gold SyncTag 정품인증</h4>
                  <p className="text-xs font-bold text-slate-600 mt-1 mb-1 leading-relaxed">
                    NFC 태그를 스캔하여 실물 골드바의 정품 인증서와 나의 추억 앨범을 확인하세요.
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
                    promptLoginForWallet();
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
                  <h5 className="font-black text-slate-800 text-sm group-hover:text-amber-700 transition-colors">내 지갑</h5>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-tight">매칭된 정품 골드바 확인</p>
                </div>
              </div>

              {/* 추억 전자앨범 바로가기 */}
              <div 
                onClick={() => {
                  if (!canUseWalletFeatures(currentUser)) {
                    promptLoginForWallet();
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
                  <h5 className="font-black text-slate-800 text-sm group-hover:text-emerald-700 transition-colors">전자앨범</h5>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-tight">소중한 추억 감상 및 기록</p>
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
                  <h5 className="font-black text-slate-800 text-sm group-hover:text-purple-700 transition-colors">프로그램 사용방법 가이드</h5>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">Gold SyncTag 이용방법 확인</p>
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
                <h3 className="text-xl font-black tracking-tight text-slate-800">럭셔리 제품 목록</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">정품 인증이 완료된 제품 리스트입니다.</p>
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
                      <p className="text-xs font-bold text-slate-400 line-clamp-2 mt-0.5 break-words">{p.description || '상세 정보가 없습니다.'}</p>
                      
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
                  <p className="font-black text-slate-400">등록된 제품이 없습니다.</p>
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
                <h3 className="text-lg font-black text-slate-800 tracking-tight">내 지갑 · 전자앨범</h3>
                <p className="text-xs font-bold text-slate-500 mt-3 leading-relaxed">
                  로그인한 뒤 제품 NFC 태그를 스캔하면 정품 정보가 계정 지갑에 저장됩니다. 주소만 입력해 들어온 경우에는
                  이용할 수 없습니다.
                </p>
                <Link
                  to={loginPathWithNext('wallet')}
                  className="mt-5 inline-flex h-12 items-center justify-center px-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm rounded-2xl shadow-lg"
                >
                  로그인 / 회원가입
                </Link>
              </div>
            ) : (
              <>
            <div className="flex items-end justify-between px-1">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-800">내 지갑</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">
                  NFC 태그를 스캔해 연결한 정품이 표시됩니다. 다른 기기에서도 같은 계정으로 확인할 수 있습니다.
                </p>
              </div>
              {walletLoading && <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />}
            </div>

            {!nfcTagSession && myGoldbars.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-600 leading-relaxed">
                아직 연결된 태그가 없습니다. 제품에 동봉된 NFC 태그를 스캔하면 지갑에 자동으로 추가됩니다.
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
                          {isCatalog ? '등록 제품' : 'CERTIFIED GOLDBAR'}
                        </span>
                        <h4 className="font-black text-slate-800 text-base mt-0.5 break-words">{g.serial_number}</h4>
                      </div>
                    </div>
                    {/* 삭제 기능 제공 */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('정말 내 지갑에서 이 골드바를 제거하시겠습니까?')) {
                          const updated = myGoldbars.filter((_, i) => i !== index);
                          setMyGoldbars(updated);
                          if (!canUseWalletFeatures(currentUser)) {
                            persistGuestTagPreview(updated);
                          }
                        }
                      }}
                      className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-100 rounded-xl transition-all shadow-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="border-t border-slate-50 pt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">중량</span><span className="text-xs font-black text-slate-700">{g.weight || '-'}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">순도</span><span className="text-xs font-black text-slate-700">{g.purity || '-'}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">{isCatalog ? '유형' : '제조일자'}</span><span className="text-xs font-black text-slate-700">{isCatalog ? '카탈로그 매칭' : g.minted_at || '-'}</span></div>
                    
                    {/* 관리자가 설정한 현재 시세 노출 */}
                    {Number(g.show_market_price) === 1 && calculateCurrentPrice(g.weight, g.market_price_per_gram) !== null && (
                      <div className="flex flex-col bg-amber-50/60 px-2 py-1 rounded-lg border border-amber-100/50">
                        <span className="text-[9px] font-black text-amber-700 uppercase tracking-tighter">실시간 자산 가치</span>
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
                      {isCatalog ? '상세' : '정보'}
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
                      미리보기
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
                      PDF
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
                    📸 추억 전자 앨범 보기
                  </button>
                  )}

                  {/* 오늘의 시세 및 가치 환산 정보 (권한이 부여된 고객에게만 노출) */}
                  {g.show_market_price === 1 && (
                    <div className="bg-amber-50/50 border border-amber-200/40 p-4 rounded-2xl flex flex-col gap-2 mt-2 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💰</span>
                          <span className="text-xs font-black text-amber-900">오늘의 금 매입 시세 및 자산 가치</span>
                        </div>
                        <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">LIVE</span>
                      </div>
                      <div className="border-t border-amber-200/30 pt-2 flex flex-col gap-1 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">1g 당 매입 시세</span>
                          <span className="text-xs font-black text-slate-800">
                            {Number(g.market_price_per_gram || 110000).toLocaleString()}원
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">나의 골드바 중량</span>
                          <span className="text-xs font-black text-slate-800">{g.weight}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-amber-200/30 pt-1.5 mt-0.5">
                          <span className="text-xs font-black text-amber-900">내 골드바 총 자산 가치</span>
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
                      <ShieldCheck className="w-4 h-4" /> 정품인증서 확인 (URL)
                    </a>
                  )}
                </div>
              );
              })}

              {myGoldbars.length === 0 && (
                <div className="bg-white rounded-3xl border border-slate-100 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                  <Award className="w-12 h-12 text-slate-200 mb-4" />
                  <p className="font-black text-slate-400 text-sm">내 지갑에 표시할 골드바가 없습니다.</p>
                  <p className="text-xs font-bold text-slate-400/80 mt-1 leading-relaxed">
                    관리자에서 이 태그에 제품(또는 골드바 인증서)을 매칭하면 태그 접속 시 자동으로 표시됩니다. UID 표기(콜론 등)가 다를 경우에도 서버에서 맞춰 조회합니다.
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
                <h4 className="text-lg font-black text-slate-800 tracking-tight">제품 상세 및 구매 신청</h4>
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
                      <span className="text-[10px] font-black bg-purple-100 text-purple-700 px-2.5 py-1 rounded-xl uppercase tracking-wider">NEW ARRIVAL</span>
                      <h5 className="font-black text-slate-800 text-lg mt-1 break-words">{selectedProduct.name}</h5>
                      <p className="text-xs font-bold text-slate-400 leading-relaxed mt-1 break-words">
                        {selectedProduct.description || '상세 정보가 등록되지 않았습니다.'}
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
                      <Eye className="w-4 h-4 shrink-0 text-amber-600" /> 미리보기
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUserGuaranteePdf(mapProductToGuaranteeData(selectedProduct as Record<string, unknown>))
                      }
                      className="h-12 rounded-2xl border border-amber-200/80 bg-amber-50 text-amber-900 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 hover:bg-amber-100 transition-all shadow-sm"
                    >
                      <Download className="w-4 h-4 shrink-0" /> PDF 저장
                    </button>
                  </div>

                  {/* 구매/상담 신청 폼 */}
                  <form onSubmit={handlePurchaseSubmit} className="bg-slate-50/80 p-5 rounded-[1.8rem] border border-slate-100/60 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
                      <h6 className="text-xs font-black text-slate-700">구매 및 상담 정보 입력</h6>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">성함 / 업체명 *</label>
                      <input 
                        required type="text" value={purchaseFormData.name}
                        onChange={(e) => setPurchaseFormData({ ...purchaseFormData, name: e.target.value })}
                        className="w-full h-12 bg-white border border-slate-100 rounded-xl px-4 text-xs font-bold focus:border-purple-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">연락처 *</label>
                      <input 
                        required type="tel" placeholder="010-0000-0000" value={purchaseFormData.phone}
                        onChange={(e) => setPurchaseFormData({ ...purchaseFormData, phone: e.target.value })}
                        className="w-full h-12 bg-white border border-slate-100 rounded-xl px-4 text-xs font-bold focus:border-purple-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">문의 사항</label>
                      <textarea 
                        rows={2} value={purchaseFormData.memo}
                        onChange={(e) => setPurchaseFormData({ ...purchaseFormData, memo: e.target.value })}
                        className="w-full p-3 bg-white border border-slate-100 rounded-xl text-xs font-bold resize-none focus:border-purple-500 focus:outline-none transition-all"
                      />
                    </div>

                    <button type="submit" className="w-full h-14 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-black rounded-xl text-sm shadow-xl shadow-purple-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4">
                      <MessageSquare className="w-4.5 h-4.5" /> 구매 및 상담 신청 완료
                    </button>
                  </form>
                </div>
              ) : (
                /* 구매/신청 완료 화면 */
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 my-6">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-black text-slate-800">구매 및 상담 신청 접수 완료</h4>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed max-w-xs">
                    남겨주신 연락처로 관리자가 신속하게 확인하여 연락드리겠습니다. <br />
                    감사합니다.
                  </p>
                  <button onClick={() => setSelectedProduct(null)} className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs mt-6 transition-all">
                    닫기
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
                  <h4 className="text-lg font-black text-slate-800 tracking-tight">📸 전자앨범</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">제품과 함께한 소중한 기록을 담아보세요</p>
                </div>
                <button onClick={() => setIsAlbumModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 pb-10">
                {/* 사진 개수 표시 및 설명 */}
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <h5 className="font-black text-amber-800 text-xs">앨범 이미지 ({albumData.images.length}/5)</h5>
                    <p className="text-[10px] font-bold text-amber-600 mt-0.5">최대 5장까지의 소중한 순간을 등록 가능</p>
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
                    <p className="text-xs font-black text-slate-400">등록된 추억 사진이 없습니다.</p>
                  </div>
                )}

                {/* 사진 업로드 폼 */}
                {albumData.images.length < 5 && (
                  <div className="border-t border-slate-100/60 pt-5 space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">추억 사진 추가</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleAlbumImageUpload}
                        disabled={uploadingImage}
                        className="text-xs text-slate-500 font-bold file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 file:cursor-pointer cursor-pointer"
                      />
                    </div>
                    {uploadingImage && (
                      <p className="text-[10px] font-bold text-amber-600 animate-pulse">이미지 등록 중입니다...</p>
                    )}
                  </div>
                )}

                <button onClick={() => setIsAlbumModalOpen(false)} className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs transition-all">
                  닫기
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
                  <h4 className="text-lg font-black text-slate-800 tracking-tight">📜 프로그램 사용방법 가이드</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Gold SyncTag의 쾌속 정품 인증을 경험해 보세요</p>
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
                      title: 'NFC 칩 가볍게 스캔',
                      desc: '스마트폰의 NFC 기능을 켜고, 제품에 동봉된 Gold SyncTag 칩에 스마트폰 뒷면을 가볍게 터치(스캔)합니다.',
                      icon: Smartphone
                    },
                    {
                      step: '02',
                      title: '정품 보증서 즉시 확인',
                      desc: '화면에 자동으로 연결된 페이지에서 제품의 고유 일련번호, 순도, 중량 정보를 3초 안에 확인합니다.',
                      icon: ShieldCheck
                    },
                    {
                      step: '03',
                      title: '로그인 후 내 지갑에 저장',
                      desc: '로그인하고 NFC 태그를 스캔하면 정품 정보가 계정 지갑에 저장됩니다. 다른 날·다른 기기에서도 같은 계정으로 확인할 수 있습니다.',
                      icon: Bookmark
                    },
                    {
                      step: '04',
                      title: '추억 전자 앨범에 기록',
                      desc: '전자앨범은 로그인 후 지갑에 연결한 제품에서만 이용할 수 있습니다. 소중한 사진을 최대 5장까지 등록해 보세요.',
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
                  가이드 확인 완료
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
                  {walletDetailItem.wallet_source === 'catalog_product' ? '제품 상세' : '정품 골드바 정보'}
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
                          등록 제품
                        </span>
                        <h5 className="font-black text-slate-800 text-lg mt-1 break-words">
                          {walletDetailItem.name || walletDetailItem.serial_number}
                        </h5>
                        <p className="text-xs font-bold text-slate-500 leading-relaxed mt-1 break-words">
                          {walletDetailItem.description?.trim()
                            ? walletDetailItem.description
                            : '등록된 설명이 없습니다.'}
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
                          <span className="font-bold text-slate-400">중량</span>
                          <span className="font-black text-slate-800">{walletDetailItem.weight}</span>
                        </div>
                      )}
                      {walletDetailItem.purity != null && String(walletDetailItem.purity).trim() !== '' && (
                        <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-400">순도</span>
                          <span className="font-black text-slate-800">{walletDetailItem.purity}</span>
                        </div>
                      )}
                      {walletDetailItem.material != null && String(walletDetailItem.material).trim() !== '' && (
                        <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-400">재질</span>
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
                          <Play className="w-4 h-4 fill-white" /> 사용 설명 영상
                        </a>
                      ) : (
                        <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
                          사용 설명 영상 데이터가 없습니다.
                        </div>
                      )}
                      {walletDetailItem.manual_url ? (
                        <a
                          href={walletDetailItem.manual_url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-3.5 bg-slate-100 text-slate-700 font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 text-sm no-underline"
                        >
                          <Download className="w-4 h-4" /> 제품 설명서
                        </a>
                      ) : (
                        <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
                          제품 설명서 데이터가 없습니다.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-sm space-y-2">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">일련번호</span>
                        <span className="font-black font-mono text-slate-800 text-right break-all">
                          {String(walletDetailItem.serial_number ?? '—')}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">중량</span>
                        <span className="font-black text-slate-800">{walletDetailItem.weight || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">순도</span>
                        <span className="font-black text-amber-600">{walletDetailItem.purity || '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 font-bold">제조일자</span>
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
                          <Download className="w-5 h-5" /> 원본 보증서 PDF 받기
                        </a>
                      )}
                    {walletDetailItem.cert_url && (
                      <a
                        href={walletDetailItem.cert_url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full h-11 bg-slate-50 border border-slate-100 hover:bg-amber-50 rounded-xl flex items-center justify-center text-xs font-black text-slate-600 hover:text-amber-700 no-underline"
                      >
                        <ShieldCheck className="w-4 h-4" /> 정품인증서 URL
                      </a>
                    )}

                    {/* 소유권 해지 요청 버튼 추가 */}
                    <div className="pt-2">
                      {walletDetailItem.release_status === 'PENDING' ? (
                        <div className="w-full py-3.5 bg-slate-100 text-slate-400 font-black rounded-2xl flex items-center justify-center gap-2 border border-slate-200 text-sm">
                          ⏳ 소유권 해지 승인 대기 중
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReleaseRequest(walletDetailItem.id || walletDetailItem.goldbar_id)}
                          className="w-full py-3.5 bg-rose-50 text-rose-600 font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-rose-100 border border-rose-200 transition-all text-sm"
                        >
                          📦 소유권 해지 요청 (재판매용)
                        </button>
                      )}
                      <p className="text-[10px] font-bold text-slate-400 text-center mt-2 px-4 leading-relaxed">
                        재판매를 위해 소유권을 해지하려면 관리자 승인이 필요합니다. 승인 즉시 내 지갑과 앨범에서 삭제됩니다.
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
                    <Eye className="w-4 h-4 shrink-0 text-amber-600" /> 보증서 미리보기
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
                    <Download className="w-4 h-4 shrink-0" /> 보증서 PDF 저장
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
          <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
            NFC 태그를 스캔하면 즉시 제품의 정품 정보로 이동합니다. <br />
            © 2026 제이에로스 (J-Eros Inc.) All rights reserved.
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
        <h3 className="text-xl font-black text-slate-800 tracking-tight">정품인증 조회 실패</h3>
        <p className="text-xs font-bold text-slate-400 mt-1 max-w-xs leading-relaxed">
          해당 태그의 정품인증 정보를 조회할 수 없습니다. 올바른 NFC 태그인지 다시 확인해 주세요.
        </p>
        <Link to="/" className="mt-8 text-xs font-black text-primary hover:underline">
          홈으로 이동
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
              ← 홈으로
            </Link>
            <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
          </div>
          <div className="flex justify-end">
            <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> 정품인증 완료
            </span>
          </div>
        </header>

        <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-amber-100/80 shadow-xl p-8 mb-6 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-amber-50 rounded-full opacity-40 blur-3xl"></div>
          
          <div className="w-16 h-16 rounded-3xl bg-amber-50 border-2 border-amber-200/60 flex items-center justify-center text-amber-600 mb-6 shadow-sm">
            <Award className="w-8 h-8" />
          </div>

          <p className="text-xs font-black text-amber-600 tracking-wider uppercase">Genuine Goldbar Certificate</p>
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 mb-3 mt-1">골드바 정품인증서</h2>

          <div className="w-full bg-slate-50 rounded-2xl p-5 text-sm space-y-3.5 border border-slate-100/60 text-left mt-4 mb-6">
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">일련번호</span><span className="font-black font-mono text-slate-800 text-base">{goldbar.serial_number}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">중량</span><span className="font-black text-slate-800">{goldbar.weight}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">순도</span><span className="font-black text-amber-600 text-base">{goldbar.purity}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-400 font-bold">제조일자</span><span className="font-black text-slate-800">{goldbar.minted_at || '-'}</span></div>
            {Number(goldbar.show_market_price) === 1 && calculateCurrentPrice(goldbar.weight, goldbar.market_price_per_gram) !== null && (
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-amber-700 font-black">실시간 자산 가치</span>
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
            <Download className="w-5 h-5" /> 원본 보증서 다운로드 (PDF)
          </a>
        </div>

        <p className="text-[11px] font-bold text-slate-400 text-center max-w-xs leading-relaxed">
          본 제품은 Gold SyncTag 블록체인 및 Edge Runtime 시스템을 통해 안전하게 무결성 및 정품 확인이 완료되었습니다.
        </p>
      </div>
    );
  }

  // ==========================================
  // [Case D] 일반 제품 인증 성공 UI
  // ==========================================
  const displayData = product || {
    name: '제이에로스 프리미엄 주얼리',
    description: 'NFC 태그를 스캔하면 실제 제품 정보를 확인할 수 있습니다.',
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
            ← 홈으로
          </Link>
          <AuthHeaderLinks currentUser={currentUser} onLogout={handleConsumerLogout} />
        </div>
        <div className="flex justify-end">
          <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> 정품인증 완료
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
              <Play className="w-4.5 h-4.5 fill-white" /> 사용 설명 영상 보기
            </a>
          ) : (
            <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
              사용 설명 영상 데이터가 없습니다.
            </div>
          )}
          {displayData.manual_url ? (
            <a href={displayData.manual_url} target="_blank" rel="noreferrer" className="w-full py-3.5 bg-slate-100 text-slate-700 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-200 transition-all text-sm no-underline">
              <Download className="w-4.5 h-4.5" /> 제품 설명서 확인
            </a>
          ) : (
            <div className="w-full py-3.5 bg-slate-50 text-slate-400 font-bold rounded-2xl flex items-center justify-center gap-2 border border-dashed border-slate-200 text-sm">
              제품 설명서 데이터가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
