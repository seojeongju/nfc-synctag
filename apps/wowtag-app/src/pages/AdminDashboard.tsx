import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Tag, Package, Plus, Bell, ArrowUpRight, Loader2, X, Smartphone, PenTool, Hash, Link as LinkIcon, Award, FileText, Calendar, Search, Filter, Edit3, Trash2, LogOut, Eye, ChevronDown, ChevronUp } from 'lucide-react';

const ADMIN_TAB_IDS = ['dashboard', 'products', 'nfc', 'goldbars', 'userGoldbars'] as const;
type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

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
  const [goldbars, setGoldbars] = useState<any[]>([]);
  const [userGoldbars, setUserGoldbars] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [bulkMarketPrice, setBulkMarketPrice] = useState('');
  const [bulkShowMarket, setBulkShowMarket] = useState(true);
  const [bulkUserId, setBulkUserId] = useState('');
  const [bulkGoldbarId, setBulkGoldbarId] = useState<number | ''>('');
  const [stats, setStats] = useState<any>({ scanCount: 0, activeTags: 0, recentLogs: [], topGoldbars: [] });
  
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
    file_name: ''
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
    file_name: ''
  });

  // 폼 상태 (NFC 매핑)
  const [nfcFormData, setNfcFormData] = useState({
    tag_uid: '',
    product_id: ''
  });

  // 폼 상태 (골드바 & 보증서 등록)
  const [goldbarFormData, setGoldbarFormData] = useState({
    serial_number: '',
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
  const ITEMS_PER_PAGE = 5;

  const [activeGuide, setActiveGuide] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcWriting, setNfcWriting] = useState(false);
  /** 빈 태그 자산만 등록 vs 제품 동시 매핑 */
  const [nfcRegisterMode, setNfcRegisterMode] = useState<'asset' | 'product'>('asset');
  const [allTags, setAllTags] = useState<any[]>([]);
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});
  /** 스캔/목록에서 기존 태그를 열 때 서버 등록 스냅샷 (덮어쓰기 안내) */
  const [nfcExistingSnapshot, setNfcExistingSnapshot] = useState<{
    hasProduct: boolean;
    productName: string | null;
    createdAt?: string;
  } | null>(null);

  const nfcProductTags = useMemo(() => allTags.filter((t: any) => t.target_type === 'product'), [allTags]);
  const nfcUnlinkedList = useMemo(
    () => nfcProductTags.filter((t: any) => t.target_id == null || t.target_id === ''),
    [nfcProductTags]
  );
  const nfcLinkedList = useMemo(
    () => nfcProductTags.filter((t: any) => t.target_id != null && t.target_id !== ''),
    [nfcProductTags]
  );

  const closeAllAdminModals = useCallback(() => {
    setIsProductModalOpen(false);
    setIsEditProductModalOpen(false);
    setIsNfcModalOpen(false);
    setIsGoldbarModalOpen(false);
    setIsEditModalOpen(false);
    setIsAdminGuideOpen(false);
    setNfcExistingSnapshot(null);
  }, []);

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
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const fetchUserGoldbars = async () => {
    try {
      const res = await fetch('/api/admin/user-goldbars');
      if (res.ok) {
        const data = await res.json();
        setUserGoldbars(data);
      }
    } catch (err) {
      console.error('Failed to fetch user goldbars', err);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch admin users', err);
    }
  };

  const bulkOwnedGoldbars = bulkUserId
    ? userGoldbars.filter((ug) => ug.user_id === bulkUserId)
    : [];

  useEffect(() => {
    if (!bulkUserId) {
      setBulkGoldbarId('');
      return;
    }
    const owned = userGoldbars.filter((ug: any) => ug.user_id === bulkUserId);
    if (owned.length === 0) {
      setBulkGoldbarId('');
      return;
    }
    if (owned.length === 1) {
      setBulkGoldbarId(owned[0].goldbar_id);
      return;
    }
    setBulkGoldbarId((prev) => {
      if (prev === '') return prev;
      const ok = owned.some((o: any) => o.goldbar_id === prev);
      return ok ? prev : '';
    });
  }, [bulkUserId, userGoldbars]);

  const handleBulkApplyMarket = async () => {
    if (!bulkUserId || bulkGoldbarId === '') {
      alert('사용자와 골드바를 선택해 주세요.');
      return;
    }
    const price = Number(String(bulkMarketPrice).replace(/,/g, '').trim());
    if (!Number.isFinite(price) || price <= 0) {
      alert('유효한 1g당 매입 시세를 입력해 주세요.');
      return;
    }
    try {
      const res = await fetch('/api/admin/user-goldbars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: bulkUserId,
          goldbarId: bulkGoldbarId,
          showMarketPrice: bulkShowMarket,
          marketPricePerGram: price
        })
      });
      if (res.ok) {
        alert('시세가 선택한 사용자에게 적용되었습니다.');
        setBulkMarketPrice('');
        fetchUserGoldbars();
      } else {
        const data = await res.json().catch(() => ({}));
        alert((data as any).error || '적용에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.message || '적용에 실패했습니다.');
    }
  };

  const handleToggleMarketPrice = async (userId: string, goldbarId: number, currentShow: boolean, price: number) => {
    try {
      const res = await fetch('/api/admin/user-goldbars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          goldbarId,
          showMarketPrice: !currentShow,
          marketPricePerGram: price
        })
      });
      if (res.ok) {
        alert('시세 노출 상태가 성공적으로 변경되었습니다.');
        fetchUserGoldbars();
      }
    } catch (err: any) {
      alert(`수정 실패: ${err.message}`);
    }
  };

  const handleUpdatePriceValue = async (userId: string, goldbarId: number, currentShow: boolean, newPrice: number) => {
    try {
      const res = await fetch('/api/admin/user-goldbars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          goldbarId,
          showMarketPrice: currentShow,
          marketPricePerGram: newPrice
        })
      });
      if (res.ok) {
        alert('1g당 시세가 변경되었습니다.');
        fetchUserGoldbars();
      }
    } catch (err: any) {
      alert(`수정 실패: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchGoldbars();
    fetchStats();
    fetchUserGoldbars();
    fetchAdminUsers();
    fetchTags();
  }, []);

  // --- NFC 로직 ---
  const handleNFCScan = async (target: 'nfc' | 'goldbar' | 'edit') => {
    if (!('NDEFReader' in window)) {
      alert('⚠️ 현재 환경에서 Web NFC를 지원하지 않습니다.\n\n해결 방법:\n1. 삼성 안드로이드 기기의 Chrome 브라우저로 접속해 주세요.\n2. 반드시 HTTPS(보안 연결) 환경이어야 합니다.\n3. 홈 화면에 설치된 앱(PWA) 형태로 실행해 주세요.');
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

          if (existingData?.reserved || existingData?.message === 'goldbar_tag') {
            alert('이 UID는 골드바 정품 태그로 이미 사용 중입니다.');
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

  const handleNFCWrite = async () => {
    if (!nfcFormData.tag_uid) return alert('먼저 UID를 스캔하세요.');
    try {
      setNfcWriting(true);
      const ndef = new (window as any).NDEFReader();
      const url = `${window.location.origin}/t/${nfcFormData.tag_uid}`;

      // 삼성폰 전용 가이드
      if (!confirm('NFC 쓰기를 시작합니다.\n\n⚠️ 주의 사항:\n삼성폰 상단 바의 NFC 설정이 "기본 모드(읽기/쓰기)"인지 확인해 주세요. "카드 모드"인 경우 작동하지 않습니다.')) {
        setNfcWriting(false);
        return;
      }

      await ndef.write({ records: [{ recordType: "url", data: url }] });
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      alert('태그 쓰기 성공!');
    } catch (err) {
      alert('쓰기 실패: 태그를 단말기 뒷면에 정확하게 대어 주시거나, NFC가 "기본 모드"인지 다시 한 번 확인해 주세요.');
    } finally {
      setNfcWriting(false);
    }
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
    if (!productFormData.name) return alert('제품 이름을 입력해 주세요.');
    setSubmitting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productFormData)
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
          file_name: ''
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
      file_name: ''
    });
    setIsEditProductModalOpen(true);
  };

  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProductFormData.name) return alert('이름을 입력하세요.');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/products/${editProductFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editProductFormData)
      });
      if (res.ok) {
        setIsEditProductModalOpen(false);
        alert('수정되었습니다.');
        fetchProducts();
      } else {
        const d = await res.json();
        alert(`수정 실패: ${d.error}`);
      }
    } catch (err: any) {
      alert(`수정 요청 실패: ${err.message}`);
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
        alert('삭제 성공!');
        fetchProducts();
        fetchTags();
      }
    } catch (err: any) {
      alert('삭제 요청 실패');
    }
  };

  const handleNfcMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nfcFormData.tag_uid) return alert('태그 UID를 스캔하세요.');
    if (nfcRegisterMode === 'product' && !nfcFormData.product_id) return alert('제품을 선택하세요.');
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
        alert(data.mode === 'asset' ? '자산 태그로 등록되었습니다.' : '태그 매핑이 완료되었습니다.');
        fetchProducts();
        fetchTags();
      } else {
        alert(typeof data.error === 'string' ? data.error : '등록에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkTagProduct = async (uid: string) => {
    const pid = linkPick[uid];
    if (!pid) return alert('연결할 제품을 선택하세요.');
    try {
      const res = await fetch('/api/tags/link-product', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_uid: uid, product_id: Number(pid) })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert('출고 시 제품 연동이 완료되었습니다.');
        fetchTags();
        fetchProducts();
      } else {
        alert(typeof data.error === 'string' ? data.error : '연동에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err?.message || '연동 요청 실패');
    }
  };

  const openNfcModalFromTag = (t: any) => {
    const hasP = t.target_id != null && t.target_id !== '';
    setNfcRegisterMode(hasP ? 'product' : 'asset');
    setNfcFormData({
      tag_uid: t.tag_uid,
      product_id: hasP ? String(t.target_id) : ''
    });
    setNfcExistingSnapshot({
      hasProduct: !!hasP,
      productName: t.target_name || null,
      createdAt: t.created_at
    });
    setIsNfcModalOpen(true);
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
      return alert('필수 입력 항목을 모두 채워주세요.');
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
        alert('골드바 및 정품인증서 등록 성공!');
        fetchGoldbars();
        fetchStats();
      } else {
        const errData = await res.json();
        alert(`오류 발생: ${errData.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      alert(`요청 실패: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // --- 골드바 수정 ---
  const handleEditOpen = (g: any) => {
    setEditGoldbarData({
      id: g.id,
      serial_number: g.serial_number,
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
    if (!editGoldbarData.serial_number || !editGoldbarData.weight) return alert('정보를 입력하세요.');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/goldbars/${editGoldbarData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editGoldbarData)
      });
      if (res.ok) {
        setIsEditModalOpen(false);
        alert('수정되었습니다.');
        fetchGoldbars();
      } else {
        const d = await res.json();
        alert(`수정 실패: ${d.error}`);
      }
    } catch (err: any) {
      alert(`수정 요청 실패: ${err.message}`);
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
        alert('삭제 성공!');
        fetchGoldbars();
        fetchStats();
      }
    } catch (err: any) {
      alert('삭제 요청 실패');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
  };

  const usageRate = goldbars.length > 0 
    ? ((stats.activeTags / goldbars.length) * 100).toFixed(0) + '%' 
    : '0%';

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
            { id: 'userGoldbars', icon: Hash, label: '골드바 시세 및 유저 관리' },
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
            <button type="button" className="p-2.5 rounded-2xl text-slate-400 hover:bg-slate-50 transition-colors relative" aria-label="알림">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jay" alt="" />
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

              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl lg:text-4xl font-black text-slate-900 tracking-tight">현황 요약</h2>
                  <p className="text-sm font-bold text-slate-400 mt-1">플랫폼의 전반적인 데이터를 한눈에 확인하세요.</p>
                </div>
              </div>

              {/* 통계 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 min-w-0 w-full">
                {[
                  { label: '전체 제품', value: products.length, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', tab: 'products' },
                  { label: '골드바 개수', value: goldbars.length, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50', tab: 'goldbars' },
                  { label: '활성 태그', value: stats.activeTags, icon: Tag, color: 'text-emerald-600', bg: 'bg-emerald-50', tab: 'nfc' },
                  { label: '가동률', value: usageRate, icon: ArrowUpRight, color: 'text-rose-600', bg: 'bg-rose-50', tab: 'nfc' },
                ].map((stat, i) => (
                  <div 
                    key={i} 
                    onClick={() => stat.tab && goToTab(stat.tab as AdminTabId)}
                    className="bg-white p-4 sm:p-5 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-sm border border-slate-50 hover:border-slate-200/60 hover:shadow-xl transition-all cursor-pointer group hover:scale-[1.02] active:scale-[0.98] flex flex-col justify-between min-h-[140px] sm:min-h-[160px] min-w-0 max-w-full"
                  >
                    <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4 transition-transform group-hover:scale-105`}><stat.icon className="w-6 h-6" /></div>
                    <div>
                      <p className="text-slate-400 text-xs font-black uppercase tracking-widest">{stat.label}</p>
                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900 mt-1">{stat.value}</h3>
                    </div>
                  </div>
                ))}
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
                    <h3 className="text-lg font-black text-slate-800">인기 골드바 (스캔량 순위)</h3>
                  </div>

                  <div className="space-y-3 flex-1 flex flex-col justify-start">
                    {stats.topGoldbars && stats.topGoldbars.map((g: any, i: number) => (
                      <div key={i} className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-amber-700 uppercase tracking-widest">RANK 0{i + 1}</p>
                          <p className="text-sm font-black text-slate-800 mt-0.5">{g.serial_number}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400">누적 스캔</p>
                          <p className="text-lg font-black text-amber-600">{g.scan_count}회</p>
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
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                    <h3 className="text-lg font-black text-slate-800">최근 정품인증 스캔 기록 (실시간)</h3>
                  </div>

                  <div className="space-y-3 flex-1">
                    {stats.recentLogs && stats.recentLogs.map((log: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100/60 hover:border-amber-400/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-amber-500">
                            <Award className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">일련번호: {log.serial_number || '미지정 골드바'}</p>
                            <p className="text-xs font-bold text-slate-400 font-mono mt-0.5">UID: {log.tag_uid}</p>
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

                    {(!stats.recentLogs || stats.recentLogs.length === 0) && (
                      <div className="p-8 text-center text-slate-400 font-bold">
                        아직 접수된 스캔 기록이 없습니다.
                      </div>
                    )}
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
                        <h4 className="font-black text-slate-800 text-base sm:text-lg break-words line-clamp-2">{p.name}</h4>
                        <p className="text-xs text-slate-400 font-bold line-clamp-2 mt-0.5 break-words">{p.description || '상세 설명 없음'}</p>
                      </div>
                      <div className="shrink-0 flex flex-col sm:flex-row items-end sm:items-start gap-0.5 pt-0.5">
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
            <div className="space-y-6 sm:space-y-8 w-full min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 shrink min-w-0">NFC 태그 관리</h2>
                <button
                  type="button"
                  onClick={() => {
                    setNfcRegisterMode('asset');
                    setNfcFormData({ tag_uid: '', product_id: '' });
                    setNfcExistingSnapshot(null);
                    setIsNfcModalOpen(true);
                  }}
                  className="bg-emerald-600 text-white font-black py-3 px-5 sm:px-6 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm"
                >
                  <Smartphone className="w-5 h-5 shrink-0" /> 새 태그 발행
                </button>
              </div>

              {/* UID만 등록 (제품 미연결) */}
              <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 border border-amber-100/80 shadow-sm overflow-hidden w-full min-w-0 max-w-full">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">① UID만 등록된 태그 (자산)</h3>
                    <p className="text-xs font-bold text-slate-500 mt-1">
                      출고 전 재고 자산으로만 관리됩니다. 출고 시 제품 연결 또는 발행 화면에서 매핑을 덮어쓸 수 있습니다.
                    </p>
                  </div>
                  <span className="text-xs font-black text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    {nfcUnlinkedList.length}건
                  </span>
                </div>
                <div className="space-y-4">
                  {nfcUnlinkedList
                    .slice((currentPageNfcAsset - 1) * ITEMS_PER_PAGE, currentPageNfcAsset * ITEMS_PER_PAGE)
                    .map((t: any) => (
                      <div
                        key={`un-${t.id}-${t.tag_uid}`}
                        className="flex flex-col gap-3 py-3 sm:py-4 px-4 sm:px-6 bg-amber-50/40 rounded-xl sm:rounded-2xl border border-amber-100/60 min-w-0 max-w-full"
                      >
                        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                          <div className="w-10 h-10 shrink-0 rounded-xl bg-white flex items-center justify-center text-amber-700 border border-amber-100">
                            <Hash className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-800 text-sm break-all">{t.tag_uid}</p>
                            <p className="text-[11px] font-bold text-slate-500 mt-1">
                              등록일{' '}
                              {t.created_at
                                ? new Date(t.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                                : '-'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openNfcModalFromTag(t)}
                            className="shrink-0 h-9 px-3 rounded-xl border border-amber-200 bg-white text-amber-900 text-[11px] font-black hover:bg-amber-50 transition-all flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> 발행·덮어쓰기
                          </button>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pl-0 sm:pl-[3.25rem] w-full min-w-0">
                          <select
                            value={linkPick[t.tag_uid] ?? ''}
                            onChange={(e) => setLinkPick((prev) => ({ ...prev, [t.tag_uid]: e.target.value }))}
                            className="w-full sm:flex-1 min-w-0 h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-emerald-400"
                          >
                            <option value="">출고 연결할 제품 선택</option>
                            {products.map((p: any) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleLinkTagProduct(t.tag_uid)}
                            className="shrink-0 h-11 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-sm hover:bg-emerald-700 transition-all"
                          >
                            제품 연결 (출고)
                          </button>
                        </div>
                      </div>
                    ))}
                  {nfcUnlinkedList.length === 0 && (
                    <p className="text-xs font-bold text-slate-400 text-center py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      UID만 등록된 태그가 없습니다.
                    </p>
                  )}
                </div>
                {nfcUnlinkedList.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-center items-center gap-2 mt-6 flex-wrap max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <button
                      disabled={currentPageNfcAsset === 1}
                      onClick={() => setCurrentPageNfcAsset((p) => p - 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
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
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-md'
                            : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      disabled={currentPageNfcAsset === Math.ceil(nfcUnlinkedList.length / ITEMS_PER_PAGE)}
                      onClick={() => setCurrentPageNfcAsset((p) => p + 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>

              {/* 제품 매칭 완료 */}
              <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 border border-emerald-100/80 shadow-sm overflow-hidden w-full min-w-0 max-w-full">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">② 제품과 매칭된 태그</h3>
                    <p className="text-xs font-bold text-slate-500 mt-1">
                      출고·스캔 연동이 완료된 태그입니다. 발행 화면에서 제품 변경·URL 재기록(덮어쓰기)이 가능합니다.
                    </p>
                  </div>
                  <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    {nfcLinkedList.length}건
                  </span>
                </div>
                <div className="space-y-4">
                  {nfcLinkedList
                    .slice((currentPageNfcLinked - 1) * ITEMS_PER_PAGE, currentPageNfcLinked * ITEMS_PER_PAGE)
                    .map((t: any) => (
                      <div
                        key={`lk-${t.id}-${t.tag_uid}`}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 sm:py-4 px-4 sm:px-6 bg-emerald-50/35 rounded-xl sm:rounded-2xl border border-emerald-100/50 min-w-0 max-w-full"
                      >
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-white flex items-center justify-center text-emerald-700 border border-emerald-100">
                          <LinkIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-800 text-sm break-all">{t.tag_uid}</p>
                          <p className="text-xs font-bold text-emerald-800 mt-0.5">연결 제품: {t.target_name || '(알 수 없음)'}</p>
                          <p className="text-[11px] font-bold text-slate-500 mt-1">
                            등록일{' '}
                            {t.created_at
                              ? new Date(t.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                              : '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openNfcModalFromTag(t)}
                          className="shrink-0 h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-sm hover:bg-emerald-700 transition-all self-start sm:self-center flex items-center gap-1.5"
                        >
                          <Edit3 className="w-4 h-4" /> 재매핑·재발행
                        </button>
                      </div>
                    ))}
                  {nfcLinkedList.length === 0 && (
                    <p className="text-xs font-bold text-slate-400 text-center py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      제품과 연결된 태그가 없습니다.
                    </p>
                  )}
                </div>
                {nfcLinkedList.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-center items-center gap-2 mt-6 flex-wrap max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <button
                      disabled={currentPageNfcLinked === 1}
                      onClick={() => setCurrentPageNfcLinked((p) => p - 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
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
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-md'
                            : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      disabled={currentPageNfcLinked === Math.ceil(nfcLinkedList.length / ITEMS_PER_PAGE)}
                      onClick={() => setCurrentPageNfcLinked((p) => p + 1)}
                      className="h-10 px-4 text-xs font-black bg-white rounded-xl border border-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all shadow-sm shrink-0"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. 골드바 정품인증 관리 탭 */}
          {currentTab === 'goldbars' && (
            <>
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black text-slate-900">골드바 정품인증 관리</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">골드바의 정보를 편집하고 정품인증서를 통합 관리합니다.</p>
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
                        <h4 className="font-black text-slate-800 text-base sm:text-lg break-words line-clamp-2">일련번호: {g.serial_number}</h4>
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
                      <div className="col-span-2 border-t border-slate-100 pt-2 mt-1 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <span className="text-slate-400 font-bold block text-[11px]">연결된 NFC 태그 UID</span>
                          <span className="font-mono font-black text-amber-700 text-xs sm:text-sm break-all">{g.tag_uid || '미매핑'}</span>
                        </div>
                        <span className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl font-black shrink-0 self-start">{g.purity}</span>
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

          {/* 5. 골드바 시세 및 유저 관리 탭 (신설) */}
          {currentTab === 'userGoldbars' && (
            <>
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">골드바 시세 및 유저 관리</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    각 골드바를 구매한 사용자에게 오늘의 시세를 노출할지 여부와 1g당 매입 시세를 직접 설정할 수 있습니다.
                  </p>
                </div>
                <button
                  onClick={() => {
                    fetchUserGoldbars();
                    fetchAdminUsers();
                  }}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-black text-xs rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  🔄 새로고침
                </button>
              </div>

              {/* 시세 입력 → 사용자·골드바 선택 후 일괄 적용 */}
              <div className="mt-6 bg-white rounded-3xl border border-amber-100 shadow-sm p-5 lg:p-6 space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">시세 입력 및 적용 대상 선택</h3>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">
                    1g당 매입 시세를 입력한 뒤, 시세를 반영할 사용자와 골드바를 고르고 적용합니다.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">1g당 매입 시세 (원)</label>
                    <input
                      type="number"
                      min={1}
                      step={100}
                      placeholder="예: 110000"
                      value={bulkMarketPrice}
                      onChange={(e) => setBulkMarketPrice(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-black text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50"
                    />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">시세 화면 노출</span>
                    <div className="flex h-12 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setBulkShowMarket(true)}
                        className={`flex-1 h-10 rounded-xl text-xs font-black transition-all ${
                          bulkShowMarket ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        노출
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkShowMarket(false)}
                        className={`flex-1 h-10 rounded-xl text-xs font-black transition-all ${
                          !bulkShowMarket ? 'bg-slate-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        숨김
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">사용자 선택</label>
                    <select
                      value={bulkUserId}
                      onChange={(e) => {
                        setBulkUserId(e.target.value);
                        setBulkGoldbarId('');
                      }}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-sm outline-none focus:border-amber-400 cursor-pointer"
                    >
                      <option value="">사용자를 선택하세요</option>
                      {adminUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                          {u.name ? ` · ${u.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">골드바 선택</label>
                    <select
                      value={bulkGoldbarId === '' ? '' : String(bulkGoldbarId)}
                      onChange={(e) =>
                        setBulkGoldbarId(e.target.value ? Number(e.target.value) : '')
                      }
                      disabled={!bulkUserId || bulkOwnedGoldbars.length === 0}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-sm outline-none focus:border-amber-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">
                        {!bulkUserId
                          ? '먼저 사용자를 선택하세요'
                          : bulkOwnedGoldbars.length === 0
                            ? '해당 사용자 지갑에 등록된 골드바가 없습니다'
                            : '골드바를 선택하세요'}
                      </option>
                      {bulkOwnedGoldbars.map((ug: any) => (
                        <option key={`${ug.user_id}-${ug.goldbar_id}`} value={ug.goldbar_id}>
                          {ug.serial_number} · {ug.weight}
                          {ug.purity ? ` · ${ug.purity}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBulkApplyMarket}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-lg shadow-amber-500/25 hover:opacity-95 active:scale-[0.99] transition-all"
                >
                  시세 적용하기
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-6 w-full min-w-0">
                {userGoldbars && userGoldbars.map((ug) => (
                  <div key={ug.id} className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:border-amber-400 hover:shadow-md transition-all gap-4 sm:gap-5 select-none relative overflow-hidden group w-full min-w-0 max-w-full">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-amber-50/40 rounded-full blur-2xl group-hover:bg-amber-100/40 transition-colors"></div>
                    <div>
                      {/* 카드 상단: 유저 정보 및 골드바 정보 */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 flex-1">
                          <span className="text-[10px] font-black uppercase text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/40 tracking-widest block max-w-fit">
                            OWNER INFO
                          </span>
                          <h4 className="text-sm font-black text-slate-800 break-all pt-1 leading-tight">{ug.user_email}</h4>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] font-black text-slate-400 uppercase block tracking-widest">WEIGHT</span>
                          <span className="text-sm font-black text-slate-700">{ug.weight}g</span>
                        </div>
                      </div>

                      {/* 카드 중단: 골드바 디테일 */}
                      <div className="mt-4 bg-slate-50/60 border border-slate-100/60 p-4 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400">일련번호</span>
                          <span className="text-sm font-black text-slate-800">{ug.serial_number}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400">구매일</span>
                          <span className="text-xs font-black text-slate-600">{ug.added_at ? new Date(ug.added_at).toLocaleDateString() : '보증서 보유'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 카드 하단: 1g당 매입 시세 수정 및 노출 설정 */}
                    <div className="border-t border-slate-50/80 pt-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest shrink-0">1g당 시세</span>
                        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto justify-end">
                          <input 
                            type="number" 
                            defaultValue={ug.market_price_per_gram || 110000} 
                            onBlur={(e) => handleUpdatePriceValue(ug.user_id, ug.goldbar_id, ug.show_market_price === 1, Number(e.target.value))}
                            className="w-full min-w-0 max-w-[11rem] sm:w-28 h-10 bg-white border border-slate-200 rounded-xl text-center font-black text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-50 transition-all shadow-sm" 
                          />
                          <span className="text-xs font-black text-slate-400 shrink-0">원</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">시세 노출 여부</span>
                        <button
                          onClick={() => handleToggleMarketPrice(ug.user_id, ug.goldbar_id, ug.show_market_price === 1, ug.market_price_per_gram || 110000)}
                          className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
                            ug.show_market_price === 1 
                              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600' 
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-500'
                          }`}
                        >
                          {ug.show_market_price === 1 ? '노출 중' : '숨김 중'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {(!userGoldbars || userGoldbars.length === 0) && (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white p-12 text-center rounded-[2.5rem] border border-slate-100/60 shadow-sm">
                    <p className="text-sm font-bold text-slate-400">현재 골드바를 소유한 사용자 정보가 없습니다.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* 제품 등록 모달 (이미지 파일 업로드 및 자동 리사이징) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 lg:p-4">
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
                     <input type="url" value={productFormData.video_url} onChange={(e) => setProductFormData({ ...productFormData, video_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 tracking-widest pl-1">매뉴얼 URL</label>
                     <input type="url" value={productFormData.manual_url} onChange={(e) => setProductFormData({ ...productFormData, manual_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
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
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 lg:p-4">
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
                     <input type="url" value={editProductFormData.video_url} onChange={(e) => setEditProductFormData({ ...editProductFormData, video_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs font-black text-slate-400 tracking-widest pl-1">매뉴얼 URL</label>
                     <input type="url" value={editProductFormData.manual_url} onChange={(e) => setEditProductFormData({ ...editProductFormData, manual_url: e.target.value })} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm font-bold border border-transparent focus:border-primary/50 focus:bg-white" />
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

      {/* NFC 태그 관리 모달 (NFC 전용 도구) */}
      {isNfcModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsNfcModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-emerald-50/50">
               <div>
                 <h3 className="text-2xl font-black text-emerald-800">NFC 태그 발행</h3>
                 <p className="text-xs font-bold text-emerald-600 mt-1">자산만 등록하거나, 출고 전까지 제품 연결을 미룰 수 있습니다.</p>
               </div>
               <button type="button" onClick={() => setIsNfcModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleNfcMappingSubmit} className="p-8 space-y-8 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
               <div className="flex rounded-2xl border border-slate-100 p-1 bg-slate-50 gap-1">
                 <button
                   type="button"
                   disabled={!!nfcExistingSnapshot?.hasProduct}
                   title={
                     nfcExistingSnapshot?.hasProduct
                       ? '제품이 연결된 태그는 자산만 모드로 덮어쓸 수 없습니다'
                       : undefined
                   }
                   onClick={() => setNfcRegisterMode('asset')}
                   className={`flex-1 py-3 rounded-xl text-xs font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                     nfcRegisterMode === 'asset' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   빈 태그 자산 등록
                 </button>
                 <button
                   type="button"
                   onClick={() => setNfcRegisterMode('product')}
                   className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${nfcRegisterMode === 'product' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   제품과 함께 매핑
                 </button>
               </div>

               {nfcExistingSnapshot && nfcFormData.tag_uid && (
                 <div className="rounded-2xl border border-blue-100 bg-blue-50/90 p-4 space-y-2 shadow-sm">
                   <p className="text-[10px] font-black uppercase tracking-wider text-blue-800">현재 시스템 등록 정보</p>
                   <p className="text-xs font-bold text-blue-950 break-all">UID: {nfcFormData.tag_uid}</p>
                   {nfcExistingSnapshot.hasProduct ? (
                     <p className="text-xs font-bold text-blue-900">
                       연결 제품: {nfcExistingSnapshot.productName || '—'}
                     </p>
                   ) : (
                     <p className="text-xs font-bold text-blue-900">상태: 자산만 등록 (제품 미연결)</p>
                   )}
                   {nfcExistingSnapshot.createdAt && (
                     <p className="text-[11px] font-bold text-blue-800/80">
                       등록일: {new Date(nfcExistingSnapshot.createdAt).toLocaleString('ko-KR')}
                     </p>
                   )}
                   <p className="text-[11px] font-bold text-blue-800/90 leading-relaxed pt-1 border-t border-blue-100/80">
                     하단에서 모드·제품을 바꾼 뒤 확정하면 위 내용이 새 설정으로 갱신(덮어쓰기)됩니다. 제품이 연결된 태그는 자산만 모드로 되돌리지 못합니다(API 정책).
                   </p>
                 </div>
               )}

               {/* 1. 태그 읽기 */}
               <div className="space-y-4">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">1단계: 태그 스캔</label>
                 <div className="flex gap-4">
                    <div className="flex-1 h-16 bg-slate-100 rounded-2xl flex items-center px-6 font-mono font-black text-lg text-emerald-700 shadow-inner">
                      {nfcFormData.tag_uid || 'UID 대기 중...'}
                    </div>
                    <button type="button" onClick={() => handleNFCScan('nfc')} className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${nfcScanning ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-white border-2 border-slate-100 text-slate-400 hover:text-emerald-500 hover:border-emerald-500 shadow-sm'}`}>
                      {nfcScanning ? <Loader2 className="w-7 h-7 animate-spin" /> : <Smartphone className="w-7 h-7" />}
                    </button>
                 </div>
               </div>

               {/* 2. 제품 선택 — 제품 모드에서만 */}
               {nfcRegisterMode === 'product' ? (
                 <div className="space-y-4">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">2단계: 제품 연결</label>
                   <select 
                     required={nfcRegisterMode === 'product'}
                     value={nfcFormData.product_id}
                     onChange={(e) => setNfcFormData({...nfcFormData, product_id: e.target.value})}
                     className="w-full h-16 bg-slate-50 border-none rounded-2xl px-5 font-bold outline-none ring-4 ring-slate-100/50 appearance-none"
                   >
                     <option value="">제품을 선택하세요</option>
                     {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                 </div>
               ) : (
                 <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 space-y-2">
                   <p className="text-xs font-black text-amber-900 uppercase tracking-wider">2단계: 제품 연결 없음</p>
                   <p className="text-xs font-bold text-amber-800/90 leading-relaxed">
                     상품에 연결되지 않은 NFC만 자산으로 등록됩니다. 출고 시 「NFC 태그 관리」 목록에서 제품 연결(출고)을 진행해 주세요.
                   </p>
                 </div>
               )}

               {/* 3. 태그 쓰기 도구 */}
               <div className="bg-slate-50 p-6 rounded-[2rem] space-y-4 border border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">3단계: 태그에 URL 굽기 (기록)</p>
                  <p className="text-[11px] font-bold text-slate-500 leading-relaxed">스캔 시 앱 메인으로 안내되도록 동일한 URL을 태그에 기록합니다.</p>
                  <button type="button" onClick={handleNFCWrite} className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-sm transition-all ${nfcWriting ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-white text-slate-700 hover:bg-emerald-600 hover:text-white shadow-sm'}`}>
                    <PenTool className="w-5 h-5" /> {nfcWriting ? '기록 중...' : '태그에 정보 기록하기'}
                  </button>
               </div>

               <button
                 type="submit"
                 disabled={submitting || !nfcFormData.tag_uid || (nfcRegisterMode === 'product' && !nfcFormData.product_id)}
                 className="w-full h-16 bg-emerald-600 text-white text-lg font-black shadow-xl shadow-emerald-500/30 disabled:opacity-30"
               >
                 {nfcRegisterMode === 'asset' ? '자산 등록 완료' : '태그 매핑 최종 확정'}
               </button>
            </form>
          </div>
        </div>
      )}

      {/* 골드바 & 보증서 등록 모달 */}
      {isGoldbarModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsGoldbarModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-amber-50/50">
               <div>
                 <h3 className="text-2xl font-black text-amber-800">골드바 & 보증서 등록</h3>
                 <p className="text-xs font-bold text-amber-600 mt-1">골드바 정보 및 정품인증서 파일을 연결합니다.</p>
               </div>
               <button onClick={() => setIsGoldbarModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleGoldbarSubmit} className="p-8 space-y-4 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
                {/* 품명 */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">품명 *</label>
                  <input required type="text" placeholder="예: 골드바3.75g" value={goldbarFormData.serial_number} onChange={(e) => setGoldbarFormData({...goldbarFormData, serial_number: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent hover:border-amber-200/50 focus:border-amber-400/50 transition-all focus:bg-white" />
                </div>

                {/* 소재 및 금 함량 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">소재</label>
                    <input required type="text" placeholder="예: 999.9" value={goldbarFormData.material} onChange={(e) => setGoldbarFormData({...goldbarFormData, material: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
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
                  <input required type="text" placeholder="예: 3.75" value={goldbarFormData.weight} onChange={(e) => setGoldbarFormData({...goldbarFormData, weight: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                  <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">g</span>
                </div>

                {/* 가로 세로 길이 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 relative">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가로 길이(mm)</label>
                    <input type="text" placeholder="예: 17" value={goldbarFormData.width_mm} onChange={(e) => setGoldbarFormData({...goldbarFormData, width_mm: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                    <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                  </div>
                  <div className="space-y-2 relative">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">세로 길이(mm)</label>
                    <input type="text" placeholder="예: 25" value={goldbarFormData.height_mm} onChange={(e) => setGoldbarFormData({...goldbarFormData, height_mm: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-14 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                    <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">mm</span>
                  </div>
                </div>

                {/* 가격 */}
                <div className="space-y-2 relative">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">가격 *</label>
                  <input required type="number" placeholder="예: 850000" value={goldbarFormData.price} onChange={(e) => setGoldbarFormData({...goldbarFormData, price: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 pr-12 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                  <span className="absolute right-4 bottom-3 font-bold text-slate-400 select-none">원</span>
                </div>

                {/* 메모 */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">메모</label>
                  <input type="text" placeholder="메모를 입력해 주세요" value={goldbarFormData.memo} onChange={(e) => setGoldbarFormData({...goldbarFormData, memo: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
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
                    <input type="url" placeholder="https://..." value={goldbarFormData.cert_url} onChange={(e) => setGoldbarFormData({...goldbarFormData, cert_url: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
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
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-amber-50/50">
               <div>
                 <h3 className="text-2xl font-black text-amber-800">골드바 정보 수정</h3>
                 <p className="text-xs font-bold text-amber-600 mt-1">골드바와 정품인증서 정보를 수정합니다.</p>
               </div>
               <button onClick={() => setIsEditModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleEditSubmit} className="p-8 space-y-6 overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
               {/* 일련번호 */}
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">일련번호 *</label>
                 <input required type="text" value={editGoldbarData.serial_number} onChange={(e) => setEditGoldbarData({...editGoldbarData, serial_number: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
               </div>

               {/* 중량 및 순도 */}
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">중량 *</label>
                   <input required type="text" value={editGoldbarData.weight} onChange={(e) => setEditGoldbarData({...editGoldbarData, weight: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">순도</label>
                   <input required type="text" value={editGoldbarData.purity} onChange={(e) => setEditGoldbarData({...editGoldbarData, purity: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                 </div>
               </div>

               {/* 제조일자 */}
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제조일자 (선택)</label>
                 <input type="date" value={editGoldbarData.minted_at} onChange={(e) => setEditGoldbarData({...editGoldbarData, minted_at: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
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
                    <input type="url" placeholder="https://..." value={editGoldbarData.cert_url} onChange={(e) => setEditGoldbarData({...editGoldbarData, cert_url: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-4 font-bold outline-none border border-transparent focus:border-amber-400/50 focus:bg-white transition-all" />
                  </div>
                </div>

                <button type="submit" disabled={submitting || !editGoldbarData.serial_number || !editGoldbarData.weight} className="w-full h-16 bg-amber-600 hover:bg-amber-700 text-white text-lg font-black shadow-xl shadow-amber-500/30 disabled:opacity-30 transition-all mt-2 flex items-center justify-center gap-2">
                 {submitting && <Loader2 className="w-5 h-5 animate-spin" />} 수정 완료
               </button>
            </form>
          </div>
        </div>
      )}

      {/* 하단 네비게이션 (모바일전용) */}
      <div className="lg:hidden fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-3xl border-t border-slate-100/80 z-[140] flex items-center justify-around px-2 h-[68px] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] select-none">
         {[
           { id: 'dashboard', icon: LayoutDashboard, label: '통계' },
           { id: 'products', icon: Package, label: '제품' },
           { id: 'nfc', icon: Tag, label: '태그' },
           { id: 'goldbars', icon: Award, label: '인증' },
           { id: 'userGoldbars', icon: Hash, label: '시세' },
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
