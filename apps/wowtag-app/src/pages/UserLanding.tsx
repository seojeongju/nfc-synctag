import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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

  // --- 골드바 인증 성공 UI ---
  if (goldbar) {
    return (
      <div className="min-h-screen bg-[#FFFDF5] flex flex-col items-center p-6 pb-20 font-sans animate-in fade-in duration-500">
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
            href={`/api/certificates/download/${tagId}`} 
            download
            className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-black h-14 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 no-underline transition-all"
          >
            <Download className="w-5 h-5" />
            정품인증서(보증서) 다운로드
          </a>
        </div>

        <p className="text-[11px] font-bold text-slate-400 text-center max-w-xs leading-relaxed">
          본 제품은 WowTag 블록체인 및 Edge Runtime 시스템을 통해 안전하게 무결성 및 정품 확인이 완료되었습니다.
        </p>
      </div>
    );
  }

  // --- 일반 제품 인증 성공 UI (기존 데모 데이터 fallback) ---
  const displayData = product || {
    name: '프리미엄 제품 (데모)',
    description: 'NFC 태그를 스캔하면 실제 제품 정보를 확인할 수 있습니다.',
    video_url: '#',
    manual_url: '#',
    image_url: '/jewelry.png'
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-6 pb-20 animate-in fade-in duration-500 font-sans leading-relaxed">
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
