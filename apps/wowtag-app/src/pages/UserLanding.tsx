import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Share2, Download, Play, ChevronRight, Bookmark, Loader2, Award, ShieldCheck } from 'lucide-react';

export default function UserLanding() {
  const { tagId } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [goldbar, setGoldbar] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!tagId) {
        setLoading(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  // ==========================================
  // [Case A] NFC 태그 ID가 없을 때: 데모 체험 및 공통 진입 랜딩 페이지
  // ==========================================
  if (!tagId) {
    return (
      <div className="min-h-screen bg-[#F6F7FB] flex flex-col items-center p-5 pb-24 font-sans leading-relaxed text-slate-900 animate-in fade-in duration-500 select-none">
        
        {/* 헤더 */}
        <header className="w-full max-w-md flex justify-between items-center h-16 px-2 mb-4">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm opacity-0"></div>
          <span className="text-xl font-extrabold text-slate-800 tracking-tight">syncTag</span>
          <Link to="/login" className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm text-slate-400 hover:text-primary hover:border-primary/40 transition-all">
            <Bookmark className="w-5 h-5" />
          </Link>
        </header>

        {/* 중앙 제품 카드 뷰 (이미지 기반 디자인 구현) */}
        <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-slate-100/60 shadow-xl overflow-hidden mb-6 relative p-4 flex flex-col">
          <div className="relative w-full aspect-[4/5] rounded-[2rem] bg-purple-gradient overflow-hidden shadow-sm flex items-center justify-center p-0">
            {/* 고화질 럭셔리 주얼리 이미지 */}
            <img src="/luxury_jewelry.png" alt="Luxury Jewelry" className="w-full h-full object-cover rounded-[2rem] hover:scale-105 transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/30 via-transparent to-transparent opacity-40"></div>

            {/* 하단 글래스모피즘 오버레이 팝업 */}
            <div className="absolute bottom-3 left-3 right-3 bg-white/70 backdrop-blur-xl rounded-[1.8rem] p-6 border border-white/40 shadow-2xl flex flex-col items-center text-center">
              <h4 className="text-xl font-black text-slate-800 tracking-tight">프리미엄 제품 (데모)</h4>
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
          <div onClick={() => alert('공유하기 기능이 제공됩니다.')} className="bg-white border border-slate-100/80 rounded-2xl p-4 flex items-center justify-between hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-all">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h5 className="font-black text-slate-800 text-sm">정품 인증서 공유</h5>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">디지털 원본을 전송합니다</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all" />
          </div>

          <div onClick={() => alert('설명서 파일 다운로드가 준비 중입니다.')} className="bg-white border border-slate-100/80 rounded-2xl p-4 flex items-center justify-between hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-all">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h5 className="font-black text-slate-800 text-sm">설명서 다운로드</h5>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">PDF 파일로 제공됩니다</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        {/* 푸터 */}
        <footer className="w-full max-w-md text-center border-t border-slate-100/60 pt-5">
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
        <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mb-6">
          <Award className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">앗! 문제가 발생했습니다</h2>
        <p className="text-slate-500 mb-8 font-bold text-sm leading-relaxed">{error || '유효하지 않은 태그입니다.'}</p>
        <button className="purple-btn !px-8 !py-3.5" onClick={() => window.location.href = '/'}>홈으로 돌아가기</button>
      </div>
    );
  }

  // ==========================================
  // [Case C] 골드바 인증 성공 UI
  // ==========================================
  if (goldbar) {
    return (
      <div className="min-h-screen bg-[#FFFDF5] flex flex-col items-center p-6 pb-20 font-sans animate-in fade-in duration-500 leading-relaxed text-slate-900">
        <div className="w-full max-w-md flex justify-between items-center mb-10">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-amber-100">
            <ShieldCheck className="w-6 h-6 text-amber-500" />
          </div>
          <h1 className="text-xl font-black text-amber-900 tracking-tight flex items-center gap-1">
            WowTag <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg">Gold</span>
          </h1>
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-amber-100">
            <Bookmark className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        {/* 정품 인증 증서 카드 */}
        <div className="w-full max-w-md bg-white border border-amber-200/60 rounded-[2.5rem] shadow-xl p-8 relative overflow-hidden mb-6 flex flex-col items-center text-center">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-amber-50 rounded-full opacity-40 blur-2xl"></div>

          <div className="w-20 h-20 bg-amber-50 rounded-3xl border-2 border-amber-200/50 flex items-center justify-center mb-6 animate-pulse">
            <Award className="w-10 h-10 text-amber-600" />
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-1">골드바 정품인증 성공</h2>
          <p className="text-xs font-bold text-emerald-600 tracking-wider uppercase mb-6 flex items-center gap-1.5 justify-center">
            <ShieldCheck className="w-4 h-4 fill-emerald-100" /> 정품으로 확인되었습니다
          </p>

          {/* 골드바 제원 리스트 */}
          <div className="w-full bg-slate-50 border border-slate-100 rounded-3xl p-6 text-left space-y-4 mb-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">일련번호</span>
              <span className="text-slate-800 font-black font-mono text-sm">{goldbar.serial_number}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">중량</span>
              <span className="text-slate-800 font-black text-sm">{goldbar.weight}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">순도</span>
              <span className="text-amber-600 font-black text-sm">{goldbar.purity}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">제조일자</span>
              <span className="text-slate-800 font-black text-sm">{goldbar.minted_at || '-'}</span>
            </div>
          </div>

          {/* 보증서 파일 다운로드 버튼 */}
          <a 
            href={`/api/certificates/download/${tagId}?token=${goldbar.download_token}`} 
            download
            className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-black h-14 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 no-underline transition-all"
          >
            <Download className="w-5 h-5" />
            정품인증서(보증서) 다운로드
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
    name: '프리미엄 제품 (데모)',
    description: 'NFC 태그를 스캔하면 실제 제품 정보를 확인할 수 있습니다.',
    video_url: '#',
    manual_url: '#',
    image_url: '/jewelry.png'
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-6 pb-20 animate-in fade-in duration-500 font-sans leading-relaxed text-slate-900">
      {/* 헤더 영역 */}
      <div className="w-full max-w-md flex justify-between items-center mb-10">
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
          <ChevronRight className="w-6 h-6 text-primary rotate-180" />
        </div>
        <h1 className="text-xl font-black text-slate-800 tracking-tight">WowTag</h1>
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
          <Bookmark className="w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* 메인 비주얼 카드 */}
      <div className="w-full max-w-md relative mb-8">
        <div className="w-full aspect-[3/4] rounded-4xl overflow-hidden shadow-2xl relative border border-slate-100">
          <div className="absolute inset-0 bg-purple-gradient opacity-20"></div>
          <img 
            src={displayData.image_url || '/jewelry.png'} 
            alt={displayData.name} 
            className="w-full h-full object-cover"
          />
          {/* 플로팅 글래스 UI */}
          <div className="absolute bottom-6 left-6 right-6 glass-card p-6 rounded-3xl">
            <h2 className="text-2xl font-black text-slate-800 mb-1 text-center">{displayData.name}</h2>
            <p className="text-slate-500 mb-4 text-xs font-bold leading-relaxed text-center">
              {displayData.description}
            </p>
            <a 
              href={displayData.video_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full purple-btn flex items-center justify-center gap-2 text-sm !py-3 font-black no-underline shadow-xl shadow-primary/30"
            >
              <Play className="w-5 h-5 fill-current" />
              사용 설명 영상 보기
            </a>
          </div>
        </div>
      </div>

      {/* 정보 카드 리스트 */}
      <div className="w-full max-w-md space-y-3">
        <div className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-slate-50 transition-all active:scale-95 cursor-pointer hover:border-primary/20">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-slate-800 text-sm">정품 인증서 공유</h3>
            <p className="text-[10px] text-slate-400 font-bold">디지털 원본을 전송합니다</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </div>
        
        <a 
          href={displayData.manual_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-slate-50 transition-all active:scale-95 no-underline hover:border-primary/20"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-slate-800 text-sm">설명서 다운로드</h3>
            <p className="text-[10px] text-slate-400 font-bold">PDF 파일로 확인 가능</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </a>
      </div>
    </div>
  );
}
