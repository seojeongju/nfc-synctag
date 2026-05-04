import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Play, ChevronRight, Bookmark, Loader2, Award, ShieldCheck, ShoppingCart, Info, CheckCircle2, MessageSquare, X, BookOpen, Smartphone } from 'lucide-react';

export default function UserLanding() {
  const { tagId } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [goldbar, setGoldbar] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 소비자 탭 (태그 없을 때)
  const [activeTab, setActiveTab] = useState<'home' | 'products' | 'myWallet'>('home');
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [myGoldbars, setMyGoldbars] = useState<any[]>([]);
  const [scanningToWallet, setScanningToWallet] = useState(false);

  // 상세 모달 상태
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [purchaseFormData, setPurchaseFormData] = useState({
    name: '',
    phone: '',
    memo: ''
  });
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('my_scanned_goldbars');
      if (stored) {
        setMyGoldbars(JSON.parse(stored));
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
      
      try {
        // 1. 일반 제품 조회
        const productRes = await fetch(`/api/t/${tagId}`);
        if (productRes.ok) {
          const data = await productRes.json();
          setProduct(data);
          setLoading(false);
          return;
        }

        // 2. 골드바 제품 조회
        const goldbarRes = await fetch(`/api/goldbars/t/${tagId}`);
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
  }, [tagId]);

  const handlePurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseFormData.name || !purchaseFormData.phone) {
      alert('필수 정보를 입력해 주세요.');
      return;
    }
    // 모의 구매 완료 처리
    setPurchaseSuccess(true);
  };

  const handleScanToWallet = async () => {
    if (!('NDEFReader' in window)) {
      alert('이 브라우저는 Web NFC를 지원하지 않습니다. 삼성폰 크롬 브라우저를 이용해 주세요.');
      return;
    }
    try {
      setScanningToWallet(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = async ({ serialNumber }: { serialNumber: string }) => {
        if ('vibrate' in navigator) navigator.vibrate(200);

        // API를 통해 정품 데이터 조회
        const res = await fetch(`/api/goldbars/t/${serialNumber}`);
        if (res.ok) {
          const goldbarData = await res.json();
          // 중복 확인
          if (myGoldbars.some((g) => g.id === goldbarData.id)) {
            alert('이미 내 지갑에 등록된 골드바입니다.');
          } else {
            const updated = [...myGoldbars, { ...goldbarData, scanned_at: new Date().toLocaleDateString() }];
            setMyGoldbars(updated);
            localStorage.setItem('my_scanned_goldbars', JSON.stringify(updated));
            alert('나의 소지 골드바 목록에 추가되었습니다!');
          }
        } else {
          alert('등록되지 않은 정품인증 태그입니다.');
        }
        setScanningToWallet(false);
      };
    } catch (err: any) {
      alert('스캔에 실패했습니다. 다시 시도해 주세요.');
      setScanningToWallet(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  // ==========================================
  // [Case A] NFC 태그 ID가 없을 때: 공통 진입 랜딩 페이지
  // ==========================================
  if (!tagId) {
    return (
      <div className="min-h-screen bg-[#F6F7FB] flex flex-col items-center p-5 pb-24 font-sans leading-relaxed text-slate-900 animate-in fade-in duration-500 select-none">
        
        {/* 헤더 */}
        <header className="w-full max-w-md flex justify-between items-center h-16 px-2 mb-2">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm opacity-0"></div>
          <span className="text-xl font-extrabold text-slate-800 tracking-tight">syncTag</span>
          <Link to="/login" className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm text-slate-400 hover:text-primary hover:border-primary/40 transition-all">
            <Bookmark className="w-5 h-5" />
          </Link>
        </header>

        {/* 상단 탭 전환 바 */}
        <div className="w-full max-w-md bg-white p-1.5 rounded-2xl border border-slate-100/80 flex gap-1 mb-5 shadow-sm">
          <button 
            onClick={() => setActiveTab('home')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'home' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <Info className="w-4 h-4" />
            홈
          </button>
          <button 
            onClick={() => setActiveTab('products')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'products' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <ShoppingCart className="w-4 h-4" />
            전체 상품
          </button>
          <button 
            onClick={() => setActiveTab('myWallet')} 
            className={`flex-1 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'myWallet' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            <Award className="w-4 h-4" />
            내 소지품
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
                <div className="absolute bottom-3 left-3 right-3 bg-white/70 backdrop-blur-xl rounded-[1.8rem] p-6 border border-white/40 shadow-2xl flex flex-col items-center text-center">
                  <h4 className="text-xl font-black text-slate-800 tracking-tight">럭셔리 제품 정품인증</h4>
                  <p className="text-xs font-bold text-slate-500 mt-1 mb-5 leading-relaxed">
                    NFC 태그를 스캔하면 실제 제품 정보를 확인할 수 있습니다.
                  </p>

                  {/* 사용 설명 영상 보기 버튼 */}
                  <button 
                    onClick={() => alert('사용 설명 영상이 곧 준비됩니다.')} 
                    className="w-full h-12 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-500/25 active:scale-[0.98] transition-all"
                  >
                    <Play className="w-4.5 h-4.5 fill-white" />
                    사용 설명 영상 보기
                  </button>
                </div>
              </div>
            </div>

            {/* 하단 화이트 카드 리스트 */}
            <div className="w-full max-w-md space-y-3.5 mb-6">
              <div onClick={() => setActiveTab('myWallet')} className="bg-white border border-slate-100/80 rounded-2xl p-4 flex items-center justify-between hover:border-amber-400 hover:shadow-lg transition-all cursor-pointer group shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-all">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 text-sm">나의 제품 목록(정품인증서) 바로가기</h5>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">내가 스캔하고 등록한 정품 확인</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all" />
              </div>

              <div onClick={() => setShowGuideModal(true)} className="bg-white border border-slate-100/80 rounded-2xl p-4 flex items-center justify-between hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-all">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 text-sm">프로그램 사용방법</h5>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">NFC 스캔 및 정품확인 가이드</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all" />
              </div>
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
                <div key={p.id} onClick={() => { setSelectedProduct(p); setPurchaseSuccess(false); setPurchaseFormData({ name: '', phone: '', memo: '' }); }} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between hover:border-purple-300 hover:shadow-lg cursor-pointer group transition-all shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-100/60 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-black text-slate-800 text-base">{p.name}</h4>
                      <p className="text-xs font-bold text-slate-400 line-clamp-1 mt-0.5">{p.description || '상세 정보가 없습니다.'}</p>
                      
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
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all flex-shrink-0" />
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

        {/* 탭 3: 내 소지품 (지갑 목록) */}
        {activeTab === 'myWallet' && (
          <div className="w-full max-w-md space-y-5 flex-1 flex flex-col h-full animate-in fade-in duration-300">
            <div className="flex items-end justify-between px-1">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-800">나의 소지품 목록</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">내가 스캔하고 보유한 골드바입니다.</p>
              </div>
            </div>

            {/* 새로운 골드바 스캔 버튼 */}
            <button
              onClick={handleScanToWallet}
              disabled={scanningToWallet}
              className="w-full h-16 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-sm rounded-3xl flex items-center justify-center gap-3 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer select-none"
            >
              {scanningToWallet ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
              {scanningToWallet ? 'NFC 태그 스캔 중...' : '새로운 골드바 스캔하여 추가'}
            </button>

            {/* 지갑에 저장된 상품 카드 리스트 */}
            <div className="grid gap-4">
              {myGoldbars.map((g, index) => (
                <div key={index} className="bg-white p-5 rounded-3xl border border-slate-100/60 hover:border-amber-400/50 hover:shadow-md cursor-pointer group transition-all flex flex-col gap-4 shadow-sm relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 text-7xl font-black text-slate-100/50 select-none">0{index + 1}</div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-200/40 shrink-0">
                        <Award className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">CERTIFIED GOLDBAR</span>
                        <h4 className="font-black text-slate-800 text-base mt-0.5">{g.serial_number}</h4>
                      </div>
                    </div>
                    {/* 삭제 기능 제공 */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('정말 내 지갑에서 이 골드바를 제거하시겠습니까?')) {
                          const updated = myGoldbars.filter((_, i) => i !== index);
                          setMyGoldbars(updated);
                          localStorage.setItem('my_scanned_goldbars', JSON.stringify(updated));
                        }
                      }}
                      className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-100 rounded-xl transition-all shadow-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="border-t border-slate-50 pt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">중량</span><span className="text-xs font-black text-slate-700">{g.weight}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">순도</span><span className="text-xs font-black text-slate-700">{g.purity}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">제조일자</span><span className="text-xs font-black text-slate-700">{g.minted_at || '-'}</span></div>
                  </div>

                  {g.cert_url && (
                    <a href={g.cert_url} target="_blank" rel="noreferrer" className="w-full h-11 bg-slate-50 border border-slate-100 hover:bg-amber-50 hover:border-amber-200/60 rounded-xl flex items-center justify-center text-xs font-black text-slate-600 hover:text-amber-700 transition-all gap-1.5 no-underline mt-1">
                      <ShieldCheck className="w-4 h-4" /> 정품인증서 확인 (URL)
                    </a>
                  )}
                </div>
              ))}

              {myGoldbars.length === 0 && (
                <div className="bg-white rounded-3xl border border-slate-100 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                  <Award className="w-12 h-12 text-slate-200 mb-4" />
                  <p className="font-black text-slate-400 text-sm">소지하고 계신 골드바가 없습니다.</p>
                  <p className="text-xs font-bold text-slate-400/80 mt-1">NFC 스캔 버튼을 눌러 골드바를 내 소지품에 추가해 보세요.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 제품 상세 & 구매 문의 폼 모달 */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setSelectedProduct(null)}></div>
            <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] overflow-hidden">
              <header className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40">
                <h4 className="text-lg font-black text-slate-800 tracking-tight">제품 상세 및 구매 신청</h4>
                <button onClick={() => setSelectedProduct(null)} className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </header>

              {!purchaseSuccess ? (
                <div className="p-6 overflow-y-auto space-y-6 flex-1 pb-10">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 bg-slate-50 border border-slate-100 rounded-3xl overflow-hidden shadow-sm flex-shrink-0">
                      <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black bg-purple-100 text-purple-700 px-2.5 py-1 rounded-xl uppercase tracking-wider">NEW ARRIVAL</span>
                      <h5 className="font-black text-slate-800 text-lg mt-1">{selectedProduct.name}</h5>
                      <p className="text-xs font-bold text-slate-400 leading-relaxed mt-1">
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

        {/* 사용방법 가이드 모달 */}
        {showGuideModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowGuideModal(false)}></div>
            <div className="relative w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh] overflow-hidden">
              <header className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40">
                <h4 className="text-lg font-black text-slate-800 tracking-tight">프로그램 사용방법 가이드</h4>
                <button onClick={() => setShowGuideModal(false)} className="p-2 bg-white rounded-xl text-slate-400 hover:text-rose-600 transition-colors shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 pb-10">
                <div className="space-y-4">
                  {[
                    {
                      step: '01',
                      title: 'NFC 기능 활성화',
                      desc: '스마트폰의 NFC 기능을 "기본 모드" 또는 "읽기/쓰기 모드"로 켭니다.',
                      icon: Smartphone
                    },
                    {
                      step: '02',
                      title: 'NFC 태그 스캔',
                      desc: '골드바/주얼리와 함께 동봉된 syncTag 칩에 스마트폰 뒷면을 가볍게 터치(스캔)합니다.',
                      icon: ShieldCheck
                    },
                    {
                      step: '03',
                      title: '정품 정보 확인',
                      desc: '화면에 자동으로 열린 페이지에서 제품의 고유 일련번호, 순도, 품질 정보를 완벽하게 확인합니다.',
                      icon: Award
                    },
                    {
                      step: '04',
                      title: '상담 및 구매 신청',
                      desc: '"제품 둘러보기" 탭을 통해 다양한 상품 리스트를 확인하고 즉시 구매 상담을 요청할 수 있습니다.',
                      icon: ShoppingCart
                    }
                  ].map((item, index) => (
                    <div key={index} className="bg-slate-50/70 border border-slate-100/80 rounded-2xl p-4 flex gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h5 className="font-black text-slate-800 text-sm">{item.title}</h5>
                          <span className="text-[10px] font-black text-purple-600 tracking-widest bg-purple-50 px-2 py-0.5 rounded-lg uppercase">STEP {item.step}</span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => setShowGuideModal(false)} className="w-full h-14 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black rounded-xl text-sm shadow-xl shadow-purple-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  확인 완료
                </button>
              </div>
            </div>
          </div>
        )}

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center">
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
        <header className="w-full max-w-md flex justify-between items-center mb-8">
          <Link to="/" className="text-xs font-black text-amber-600 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200/60 hover:bg-amber-100 transition-all no-underline">
            ← 홈으로
          </Link>
          <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> 정품인증 완료
          </span>
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
          본 제품은 syncTag 블록체인 및 Edge Runtime 시스템을 통해 안전하게 무결성 및 정품 확인이 완료되었습니다.
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
      <header className="w-full max-w-md flex justify-between items-center mb-8">
        <Link to="/" className="text-xs font-black text-purple-600 bg-purple-50 px-4 py-2 rounded-xl border border-purple-200/60 hover:bg-purple-100 transition-all no-underline">
          ← 홈으로
        </Link>
        <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1">
          <ShieldCheck className="w-4 h-4" /> 정품인증 완료
        </span>
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
          {displayData.video_url && (
            <a href={displayData.video_url} target="_blank" rel="noreferrer" className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-500/20 hover:from-purple-600 hover:to-indigo-600 transition-all text-sm no-underline">
              <Play className="w-4.5 h-4.5 fill-white" /> 사용 설명 영상 보기
            </a>
          )}
          {displayData.manual_url && (
            <a href={displayData.manual_url} target="_blank" rel="noreferrer" className="w-full py-3.5 bg-slate-100 text-slate-700 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-200 transition-all text-sm no-underline">
              <Download className="w-4.5 h-4.5" /> 제품 설명서 확인
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
