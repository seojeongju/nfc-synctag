
import { useState, useEffect } from 'react';
import { LayoutDashboard, Tag, Package, BarChart3, Settings, Plus, Users, Scan, Bell, Search, ArrowUpRight, ExternalLink, Loader2, X, Smartphone, PenTool } from 'lucide-react';

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
      alert('기기를 NFC 태그에 가까이 대주세요. (태그 읽기)');

      ndef.onreading = ({ serialNumber }: { serialNumber: string }) => {
        setFormData(prev => ({ ...prev, tag_uid: serialNumber }));
        setNfcScanning(false);
        alert('NFC 태그 읽기 완료: ' + serialNumber);
      };

    } catch (error) {
      console.error("NFC 스캔 오류:", error);
      alert('NFC 권한이 거부되었거나 스캔 중 오류가 발생했습니다.');
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
      
      alert(`태그에 URL을 기록합니다: ${url}\n\n지금 기기를 태그에 터치해 주세요.`);
      
      await ndef.write({
        records: [{ recordType: "url", data: url }]
      });

      alert('NFC 태그 쓰기 성공! 이제 이 태그를 스캔하면 제품 페이지가 열립니다.');
    } catch (error) {
      console.error("NFC 쓰기 오류:", error);
      alert('NFC 쓰기 실패. 태그가 잠겨 있거나 권한이 부족할 수 있습니다.');
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
    <div className="min-h-screen bg-bg-soft flex font-sans">
      {/* 사이드바 생략 (동 동일) */}
      <aside className="hidden lg:flex w-72 flex-col p-6 bg-white border-r border-slate-100 shadow-sm fixed h-full z-20">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 rounded-xl bg-purple-gradient flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Scan className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">WowTag 관리자</span>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { icon: LayoutDashboard, label: '대시보드', active: true },
            { icon: Package, label: '제품 관리', active: false },
            { icon: Tag, label: '태그 매핑', active: false },
            { icon: BarChart3, label: '통계 분석', active: false },
            { icon: Users, label: '고객 관리', active: false },
          ].map((item, idx) => (
            <button 
              key={idx}
              className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 group cursor-pointer ${
                item.active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon className={`w-5 h-5 ${item.active ? 'text-white' : 'text-slate-400 group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-50">
          <button className="flex items-center gap-4 px-4 py-3 rounded-2xl text-slate-400 hover:bg-slate-50 w-full transition-all cursor-pointer">
            <Settings className="w-5 h-5 text-slate-400" />
            <span className="font-semibold text-sm">설정</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 lg:px-10 flex items-center justify-between sticky top-0 z-10">
          <div className="flex-1 max-w-xl relative hidden md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="검색어를 입력하세요..." 
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <button className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-50 relative cursor-pointer">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-px bg-slate-100 mx-2"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-800 leading-none">제이서</p>
                <p className="text-xs text-slate-400 mt-1">최고 관리자</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jay" alt="사용자 아바타" />
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-10 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">대시보드 개요</h2>
              <p className="text-slate-400 mt-1 font-medium">관리자님 환영합니다! 오늘 WowTag의 현황을 확인하세요.</p>
            </div>
            <div className="flex gap-3">
              <button 
                className="purple-btn !py-2.5 !text-sm flex items-center gap-2"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                새 제품 추가
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: '총 스캔 횟수', value: '12,842', icon: Scan, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: '활성 태그', value: products.length.toString(), icon: Tag, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: '매출 현황', value: '₩3,240만', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: '전환율', value: '3.2%', icon: ArrowUpRight, color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-50 transition-all hover:shadow-xl hover:shadow-slate-200/50 group cursor-default">
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider">{stat.label}</p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{stat.value}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2 glass-card rounded-3xl p-8 relative overflow-hidden group">
              <div className="flex justify-between items-center mb-10 relative z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">제품 관리 현황</h3>
                  <p className="text-xs text-slate-400 font-medium">등록된 총 {products.length}개의 제품 목록</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {loading && products.length === 0 ? (
                  <div className="flex justify-center p-20"><Loader2 className="animate-spin text-primary" /></div>
                ) : products.length === 0 ? (
                  <p className="text-center text-slate-400 py-10 font-bold">등록된 제품이 없습니다.</p>
                ) : (
                  <div className="grid gap-4">
                    {products.map((p) => (
                      <div key={p.id} className="flex items-center gap-4 p-4 bg-white/50 rounded-2xl border border-white hover:bg-white transition-all group">
                        <img src={p.image_url || '/jewelry.png'} className="w-16 h-16 rounded-xl object-cover shadow-sm" alt="" />
                        <div className="flex-1">
                          <p className="font-bold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400 line-clamp-1">{p.description}</p>
                        </div>
                        <div className="flex gap-2">
                          <button className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:text-primary cursor-pointer transition-colors">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-50">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-slate-800">최근 활동 태그</h3>
                <button className="text-slate-400 hover:text-primary transition-colors cursor-pointer">
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 group cursor-pointer">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border border-white transition-transform group-hover:scale-105">
                      <img src={`https://picsum.photos/seed/tag-${i}/100`} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="flex-1 text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">
                      제품 데이터 #{i}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 제품 등록 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-bg-soft">
              <div>
                <h3 className="text-2xl font-black text-slate-800">새 제품 등록</h3>
                <p className="text-sm text-slate-400 font-medium mt-1">NFC 태그 읽기/쓰기를 지원합니다.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">제품 명칭 *</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="예: 프리미엄 주얼리 세트"
                  className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">제품 설명</label>
                <textarea 
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="상세 정보를 입력하세요."
                  className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">NFC 태그 설정 (UID)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={formData.tag_uid}
                      onChange={(e) => setFormData({...formData, tag_uid: e.target.value})}
                      placeholder="UID"
                      className="flex-1 px-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <button 
                      type="button"
                      onClick={handleNFCScan}
                      className={`px-4 flex items-center justify-center gap-2 rounded-2xl transition-all font-bold text-xs ${
                        nfcScanning ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20'
                      }`}
                    >
                      {nfcScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                      <span>읽기</span>
                    </button>
                    <button 
                      type="button"
                      onClick={handleNFCWrite}
                      className={`px-4 flex items-center justify-center gap-2 rounded-2xl transition-all font-bold text-xs ${
                        nfcWriting ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-100'
                      }`}
                    >
                      {nfcWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
                      <span>쓰기</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">이미지 경로</label>
                  <input 
                    type="text" 
                    value={formData.image_url}
                    onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                    placeholder="/jewelry.png"
                    className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">영상 URL</label>
                  <input 
                    type="url" 
                    value={formData.video_url}
                    onChange={(e) => setFormData({...formData, video_url: e.target.value})}
                    placeholder="https://..."
                    className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={submitting || nfcWriting || nfcScanning}
                className="w-full purple-btn flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" /> : <Plus className="w-5 h-5" />}
                제품 및 태그 정보 최종 저장
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
