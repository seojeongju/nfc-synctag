
import { useState, useEffect } from 'react';
import { LayoutDashboard, Tag, Package, BarChart3, Plus, Scan, Bell, ArrowUpRight, Loader2, X, Smartphone, PenTool, ChevronRight, Hash, Link as LinkIcon } from 'lucide-react';

export default function AdminDashboard() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'products' | 'nfc'>('dashboard');
  const [products, setProducts] = useState<any[]>([]);
  
  // 모달 상태
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  
  // 폼 상태 (제품)
  const [productFormData, setProductFormData] = useState({
    name: '',
    description: '',
    video_url: '',
    manual_url: '',
    image_url: '/jewelry.png'
  });

  // 폼 상태 (NFC 매핑)
  const [nfcFormData, setNfcFormData] = useState({
    tag_uid: '',
    product_id: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcWriting, setNfcWriting] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // --- NFC 로직 ---
  const handleNFCScan = async () => {
    if (!('NDEFReader' in window)) {
      alert('이 브라우저는 Web NFC를 지원하지 않습니다.');
      return;
    }

    try {
      setNfcScanning(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      
      ndef.onreading = async ({ serialNumber }: { serialNumber: string }) => {
        const res = await fetch(`/api/tags/${serialNumber}`);
        const existingData = await res.json();

        if (existingData && existingData.product_name) {
          if (!confirm(`이미 '${existingData.product_name}'에 연결된 태그입니다. 계속하시겠습니까?`)) {
            setNfcScanning(false);
            return;
          }
        }
        setNfcFormData(prev => ({ ...prev, tag_uid: serialNumber }));
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
      await ndef.write({ records: [{ recordType: "url", data: url }] });
      alert('태그 쓰기 성공!');
    } catch (err) {
      alert('쓰기 실패');
    } finally {
      setNfcWriting(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productFormData)
      });
      if (res.ok) {
        setIsProductModalOpen(false);
        setProductFormData({ name: '', description: '', video_url: '', manual_url: '', image_url: '/jewelry.png' });
        fetchProducts();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNfcMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nfcFormData.tag_uid || !nfcFormData.product_id) return alert('정보를 모두 입력하세요.');
    setSubmitting(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nfcFormData)
      });
      if (res.ok) {
        setIsNfcModalOpen(false);
        setNfcFormData({ tag_uid: '', product_id: '' });
        alert('매핑 성공!');
        fetchProducts();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans leading-relaxed text-slate-900">
      {/* 사이드바 - 데스크탑 */}
      <aside className="hidden lg:flex w-72 flex-col p-6 bg-white border-r border-slate-100 shadow-sm fixed h-full z-20">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 rounded-2xl bg-purple-gradient flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Scan className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-purple-gradient">WowTag</span>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: '통계' },
            { id: 'products', icon: Package, label: '제품 정보 관리' },
            { id: 'nfc', icon: Tag, label: 'NFC 태그 관리' },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setCurrentTab(item.id as any)}
              className={`flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group ${
                currentTab === item.id ? 'bg-primary text-white shadow-xl shadow-primary/30' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        {/* 헤더 */}
        <header className="h-16 lg:h-20 bg-white/80 backdrop-blur-xl border-b border-slate-50 px-4 lg:px-10 flex items-center justify-between sticky top-0 z-10 transition-all">
          <div className="flex items-center gap-3 lg:hidden" onClick={() => setCurrentTab('dashboard')}>
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Scan className="text-white w-4 h-4" />
            </div>
            <span className="font-black text-slate-800">WowTag</span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <button className="p-2.5 rounded-2xl text-slate-400 hover:bg-slate-50 transition-colors relative"><Bell className="w-5 h-5" /></button>
            <div className="w-9 h-9 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden"><img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jay" alt="" /></div>
          </div>
        </header>

        {/* 탭 기반 콘텐츠 */}
        <div className="p-4 lg:p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* 1. 대시보드 탭 */}
          {currentTab === 'dashboard' && (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl lg:text-4xl font-black text-slate-900 tracking-tight">현황 요약</h2>
                  <p className="text-sm font-bold text-slate-400 mt-1">플랫폼의 전반적인 데이터를 한눈에 확인하세요.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {[
                  { label: '전체 제품', value: products.length, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: '누적 스캔', value: '3,241', icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
                  { label: '활성 태그', value: '184', icon: Tag, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: '가동률', value: '92%', icon: ArrowUpRight, color: 'text-rose-600', bg: 'bg-rose-50' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-5 lg:p-8 rounded-[2rem] shadow-sm border border-slate-50 hover:shadow-xl transition-all">
                    <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-6`}><stat.icon className="w-6 h-6" /></div>
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest">{stat.label}</p>
                    <h3 className="text-2xl lg:text-3xl font-black text-slate-900 mt-1">{stat.value}</h3>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 2. 제품 정보 관리 탭 */}
          {currentTab === 'products' && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl lg:text-3xl font-black text-slate-900">제품 정보 관리</h2>
                <button onClick={() => setIsProductModalOpen(true)} className="purple-btn !py-3 !px-6 flex items-center gap-2"><Plus className="w-5 h-5" /> 제품 등록</button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {products.map((p) => (
                  <div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 flex items-center gap-5 hover:border-primary/30 transition-all group">
                    <div className="w-20 h-20 rounded-2xl bg-slate-50 overflow-hidden ring-4 ring-slate-50"><img src={p.image_url} className="w-full h-full object-cover" /></div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-800 text-lg truncate">{p.name}</h4>
                      <p className="text-sm text-slate-400 font-bold line-clamp-1">{p.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 3. NFC 태그 관리 탭 */}
          {currentTab === 'nfc' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl lg:text-3xl font-black text-slate-900">NFC 태그 관리</h2>
                <button onClick={() => setIsNfcModalOpen(true)} className="bg-emerald-600 text-white font-black py-3 px-6 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center gap-2"><Smartphone className="w-5 h-5" /> 새 태그 발행</button>
              </div>
              
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-50 shadow-sm overflow-hidden">
                 <h3 className="text-xl font-black mb-6">최근 태그 작업</h3>
                 <div className="space-y-4">
                   {products.filter(p => p.tag_uid).slice(0, 5).map(p => (
                     <div key={p.id} className="flex items-center gap-4 py-4 px-6 bg-slate-50 rounded-2xl">
                       <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-primary border border-slate-100"><Hash className="w-5 h-5" /></div>
                       <div className="flex-1">
                         <p className="font-black text-slate-700">{p.tag_uid}</p>
                         <p className="text-xs font-bold text-slate-400">연결된 제품: {p.name}</p>
                       </div>
                       <LinkIcon className="w-4 h-4 text-slate-300" />
                     </div>
                   ))}
                 </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 제품 등록 모달 (NFC 필드 없음) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsProductModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">순수 제품 등록</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleProductSubmit} className="p-8 space-y-6 overflow-y-auto pb-12">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제품 이름 *</label>
                 <input required type="text" value={productFormData.name} onChange={(e) => setProductFormData({...productFormData, name: e.target.value})} className="w-full h-14 bg-slate-100/50 rounded-2xl px-5 font-bold outline-none" />
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">상세 설명</label>
                 <textarea rows={3} value={productFormData.description} onChange={(e) => setProductFormData({...productFormData, description: e.target.value})} className="w-full p-5 bg-slate-100/50 rounded-2xl font-bold outline-none resize-none" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2"><label className="text-xs font-black text-slate-400 tracking-widest px-1">영상 URL</label><input type="url" value={productFormData.video_url} onChange={(e)=>setProductFormData({...productFormData, video_url: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm" /></div>
                 <div className="space-y-2"><label className="text-xs font-black text-slate-400 tracking-widest px-1">매뉴얼 URL</label><input type="url" value={productFormData.manual_url} onChange={(e)=>setProductFormData({...productFormData, manual_url: e.target.value})} className="w-full h-12 bg-slate-100/50 rounded-xl px-4 outline-none text-sm" /></div>
               </div>
               <button type="submit" disabled={submitting} className="w-full h-16 purple-btn text-lg font-black shadow-xl shadow-primary/30 mt-4 disabled:opacity-50">정보 저장</button>
            </form>
          </div>
        </div>
      )}

      {/* NFC 태그 관리 모달 (NFC 전용 도구) */}
      {isNfcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 lg:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsNfcModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[95vh]">
            <header className="p-8 border-b border-slate-50 flex justify-between items-center bg-emerald-50/50">
               <div>
                 <h3 className="text-2xl font-black text-emerald-800">NFC 태그 발행</h3>
                 <p className="text-xs font-bold text-emerald-600 mt-1">실물 태그를 제품과 연결하고 URL을 기록합니다.</p>
               </div>
               <button onClick={() => setIsNfcModalOpen(false)} className="p-2 bg-white rounded-xl text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
            </header>
            <form onSubmit={handleNfcMappingSubmit} className="p-8 space-y-10 overflow-y-auto pb-12">
               {/* 1. 태그 읽기 */}
               <div className="space-y-4">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">1단계: 태그 스캔</label>
                 <div className="flex gap-4">
                    <div className="flex-1 h-16 bg-slate-100 rounded-2xl flex items-center px-6 font-mono font-black text-lg text-emerald-700 shadow-inner">
                      {nfcFormData.tag_uid || 'UID 대기 중...'}
                    </div>
                    <button type="button" onClick={handleNFCScan} className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${nfcScanning ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-white border-2 border-slate-100 text-slate-400 hover:text-emerald-500 hover:border-emerald-500 shadow-sm'}`}>
                      {nfcScanning ? <Loader2 className="w-7 h-7 animate-spin" /> : <Smartphone className="w-7 h-7" />}
                    </button>
                 </div>
               </div>

               {/* 2. 제품 선택 */}
               <div className="space-y-4">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">2단계: 제품 연결</label>
                 <select 
                   required value={nfcFormData.product_id}
                   onChange={(e) => setNfcFormData({...nfcFormData, product_id: e.target.value})}
                   className="w-full h-16 bg-slate-50 border-none rounded-2xl px-5 font-bold outline-none ring-4 ring-slate-100/50 appearance-none"
                 >
                   <option value="">제품을 선택하세요</option>
                   {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                 </select>
               </div>

               {/* 3. 태그 쓰기 도구 */}
               <div className="bg-slate-50 p-6 rounded-[2rem] space-y-4 border border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">3단계: 태그에 URL 굽기 (기록)</p>
                  <button type="button" onClick={handleNFCWrite} className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-sm transition-all ${nfcWriting ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-white text-slate-700 hover:bg-emerald-600 hover:text-white shadow-sm'}`}>
                    <PenTool className="w-5 h-5" /> {nfcWriting ? '기록 중...' : '태그에 정보 기록하기'}
                  </button>
               </div>

               <button type="submit" disabled={submitting || !nfcFormData.tag_uid || !nfcFormData.product_id} className="w-full h-16 bg-emerald-600 text-white text-lg font-black shadow-xl shadow-emerald-500/30 disabled:opacity-30">태그 매핑 최종 확정</button>
            </form>
          </div>
        </div>
      )}

      {/* 하단 네비게이션 (모바일전용) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 h-20 bg-white/90 backdrop-blur-xl border-t border-slate-50 z-20 flex items-center px-4 gap-2">
         {[
           { id: 'dashboard', icon: LayoutDashboard, label: '통계' },
           { id: 'products', icon: Package, label: '제품' },
           { id: 'nfc', icon: Tag, label: '태그' },
         ].map((nav) => (
           <button 
            key={nav.id} onClick={() => setCurrentTab(nav.id as any)}
            className={`flex-1 h-14 flex flex-col items-center justify-center rounded-2xl transition-all ${currentTab === nav.id ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'text-slate-400'}`}
           >
             <nav.icon className="w-5 h-5" />
             <span className="text-[10px] font-black mt-1 uppercase tracking-tighter">{nav.label}</span>
           </button>
         ))}
      </div>
    </div>
  );
}
