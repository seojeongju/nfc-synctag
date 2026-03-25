
import { useState, useEffect } from 'react';
import { LayoutDashboard, Tag, Package, BarChart3, Plus, Scan, Bell, Search, ArrowUpRight, ExternalLink, Loader2, X, Smartphone, PenTool, CheckCircle2 } from 'lucide-react';

export default function AdminDashboard() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // 폼 상태
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tag_uid: '',
    video_url: '',
    manual_url: '',
    image_url: '/jewelry.png'
  });
  const [submitting, setSubmitting] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcWriting, setNfcWriting] = useState(false);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleNFCScan = async () => {
    if (!('NDEFReader' in window)) {
      alert('이 브라우저는 Web NFC를 지원하지 않습니다. 안드로이드 크롬 브라우저를 사용해 주세요.');
      return;
    }

    try {
      setNfcScanning(true);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      
      ndef.onreading = ({ serialNumber }: { serialNumber: string }) => {
        setFormData(prev => ({ ...prev, tag_uid: serialNumber }));
        setNfcScanning(false);
      };

    } catch (error) {
      console.error("NFC 스캔 오류:", error);
      setNfcScanning(false);
    }
  };

  const handleNFCWrite = async () => {
    if (!formData.tag_uid) {
      alert('먼저 태그 UID를 입력하거나 스캔해 주세요.');
      return;
    }

    if (!('NDEFReader' in window)) {
      alert('이 브라우저는 Web NFC를 지원하지 않습니다.');
      return;
    }

    try {
      setNfcWriting(true);
      const ndef = new (window as any).NDEFReader();
      const url = `${window.location.origin}/t/${formData.tag_uid}`;
      
      await ndef.write({
        records: [{ recordType: "url", data: url }]
      });

      alert('NFC 태그 쓰기 성공!');
    } catch (error) {
      console.error("NFC 쓰기 오류:", error);
      alert('NFC 쓰기 실패. 태그 상태를 확인해 주세요.');
    } finally {
      setNfcWriting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ name: '', description: '', tag_uid: '', video_url: '', manual_url: '', image_url: '/jewelry.png' });
        fetchProducts();
      }
    } catch (err) {
      alert('등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-soft flex font-sans leading-relaxed">
      {/* 사이드바 - 데스크탑 전용 */}
      <aside className="hidden lg:flex w-72 flex-col p-6 bg-white border-r border-slate-100 shadow-sm fixed h-full z-20">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 rounded-xl bg-purple-gradient flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Scan className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">WowTag Admin</span>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { icon: LayoutDashboard, label: '대시보드', active: true },
            { icon: Package, label: '제품 목록', active: false },
            { icon: Tag, label: '태그 발행', active: false },
            { icon: BarChart3, label: '스캔 통계', active: false },
          ].map((item, idx) => (
            <button 
              key={idx}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                item.active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        <header className="h-16 lg:h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 lg:px-10 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Scan className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-slate-800">WowTag</span>
          </div>

          <div className="flex-1 max-w-md relative hidden md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="검색..." className="w-full pl-11 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/10 outline-none" />
          </div>

          <div className="flex items-center gap-3">
             <button className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
               <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jay" alt="" />
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-10 space-y-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl lg:text-3xl font-black text-slate-800">대시보드</h2>
              <p className="text-sm text-slate-400 font-medium hidden sm:block">제품 관리 및 NFC 태그 현황입니다.</p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="purple-btn !py-3 !px-5 flex items-center gap-2 text-sm shadow-xl shadow-primary/20"
            >
              <Plus className="w-5 h-5" />
              생성
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: '총 스캔', value: '1,284', icon: Scan, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: '제품수', value: products.length.toString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: '활성 태그', value: '84', icon: Tag, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: '오늘 스캔', value: '24', icon: ArrowUpRight, color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-4 lg:p-6 rounded-3xl shadow-sm border border-slate-50">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4`}>
                  <stat.icon className="w-5 h-5 lg:w-6 lg:h-6" />
                </div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">{stat.label}</p>
                <h3 className="text-lg lg:text-2xl font-black text-slate-800 mt-1">{stat.value}</h3>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 px-1">최근 등록 제품</h3>
            <div className="grid gap-3">
              {loading ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary" /></div>
              ) : products.map((p) => (
                <div key={p.id} className="bg-white p-3 lg:p-4 rounded-2xl border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                  <div className="w-14 h-14 rounded-xl bg-slate-50 overflow-hidden shrink-0">
                    <img src={p.image_url || '/jewelry.png'} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{p.tag_uid || 'UID 미등록'}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-300 mr-2 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* 모바일 최적화 제품 등록 모달 (Bottom Sheet 스타일) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* 오버레이 */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsModalOpen(false)}
          ></div>
          
          {/* 모달 본체 */}
          <div className="relative w-full max-w-xl bg-white rounded-t-[2.5rem] sm:rounded-4xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 max-h-[95vh] flex flex-col">
            
            {/* 상단 바 (모바일) */}
            <div className="sm:hidden w-full flex justify-center py-3">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
            </div>

            <header className="px-6 lg:px-10 py-4 lg:py-6 border-b border-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl lg:text-2xl font-black text-slate-800 leading-tight">새 제품 등록</h3>
                <p className="text-xs lg:text-sm text-slate-400 font-bold mt-1">제품 정보와 NFC를 설정하세요.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8 pb-10">
              {/* 기본 정보 그룹 */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">제품 이름 *</label>
                  <input 
                    required type="text" value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="예: 프리미엄 다이아 반지"
                    className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl text-base font-medium focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">상세 설명</label>
                  <textarea 
                    rows={3} value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="제품의 주요 특징을 입력하세요."
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-medium focus:ring-4 focus:ring-primary/5 transition-all outline-none resize-none"
                  />
                </div>
              </div>

              {/* NFC 핵심 버튼 그룹 - 모바일 강조 */}
              <div className="space-y-4 pt-6 border-t border-slate-50">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1 mb-2 block">NFC 태그 액션</label>
                
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <input 
                      type="text" value={formData.tag_uid}
                      onChange={(e) => setFormData({...formData, tag_uid: e.target.value})}
                      placeholder="UID (자동 스캔 혹은 직접 입력)"
                      className="w-full h-14 pl-5 pr-12 bg-slate-100 border-none rounded-2xl text-base font-mono font-bold text-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                    />
                    {formData.tag_uid && (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 animate-in zoom-in" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      type="button" onClick={handleNFCScan}
                      className={`h-24 flex flex-col items-center justify-center gap-2 rounded-3xl transition-all border-2 ${
                        nfcScanning 
                        ? 'bg-purple-50 border-primary text-primary animate-pulse' 
                        : 'bg-white border-slate-100 text-slate-600 active:scale-95 shadow-sm'
                      }`}
                    >
                      {nfcScanning ? <Loader2 className="w-8 h-8 animate-spin" /> : <Smartphone className="w-8 h-8" />}
                      <span className="font-bold text-sm">태그 읽기</span>
                    </button>

                    <button 
                      type="button" onClick={handleNFCWrite}
                      className={`h-24 flex flex-col items-center justify-center gap-2 rounded-3xl transition-all border-2 ${
                        nfcWriting 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-600 animate-pulse' 
                        : 'bg-white border-slate-100 text-slate-600 active:scale-95 shadow-sm'
                      }`}
                    >
                      {nfcWriting ? <Loader2 className="w-8 h-8 animate-spin" /> : <PenTool className="w-8 h-8" />}
                      <span className="font-bold text-sm">태그 발행(쓰기)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 추가 필드 */}
              <div className="space-y-4 pt-6 border-t border-slate-50">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">이미지 URL</label>
                  <input 
                    type="text" value={formData.image_url}
                    onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl text-sm outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">영상 URL</label>
                    <input type="url" value={formData.video_url} onChange={(e) => setFormData({...formData, video_url: e.target.value})} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl text-sm outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">매뉴얼 URL</label>
                    <input type="url" value={formData.manual_url} onChange={(e) => setFormData({...formData, manual_url: e.target.value})} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl text-sm outline-none" />
                  </div>
                </div>
              </div>

              <div className="pt-4 lg:pt-8 sticky bottom-0 bg-white/80 backdrop-blur-sm -mx-6 lg:-mx-10 px-6 lg:px-10 pb-4">
                <button 
                  type="submit" disabled={submitting}
                  className="w-full h-16 purple-btn flex items-center justify-center gap-3 text-lg font-black shadow-2xl shadow-primary/30 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {submitting ? <Loader2 className="animate-spin w-6 h-6" /> : <Plus className="w-6 h-6 border-2 border-white rounded-full flex items-center justify-center" />}
                  제품 등록 & 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
