
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Share2, Download, Play, ChevronRight, Bookmark, Loader2 } from 'lucide-react';

export default function UserLanding() {
  const { tagId } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProduct() {
      if (!tagId) {
        setLoading(false);
        return;
      }
      
      try {
        const res = await fetch(`/api/t/${tagId}`);
        if (!res.ok) throw new Error('제품을 찾을 수 없습니다.');
        const data = await res.json();
        setProduct(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [tagId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-soft">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (error || (!product && tagId)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg-soft p-6 text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">앗! 문제가 발생했습니다</h2>
        <p className="text-slate-500 mb-8">{error || '유효하지 않은 태그입니다.'}</p>
        <button className="purple-btn" onClick={() => window.location.href = '/'}>홈으로 돌아가기</button>
      </div>
    );
  }

  // 기본 데모 데이터 (tagId가 없을 때)
  const displayData = product || {
    name: '프리미엄 제품 (데모)',
    description: 'NFC 태그를 스캔하면 실제 제품 정보를 확인할 수 있습니다.',
    video_url: '#',
    manual_url: '#',
    image_url: '/jewelry.png'
  };

  return (
    <div className="min-h-screen bg-bg-soft flex flex-col items-center p-6 pb-20">
      {/* 헤더 영역 */}
      <div className="w-full max-w-md flex justify-between items-center mb-10">
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
          <ChevronRight className="w-6 h-6 text-primary rotate-180" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">WowTag</h1>
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
          <Bookmark className="w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* 메인 비주얼 카드 */}
      <div className="w-full max-w-md relative mb-8">
        <div className="w-full aspect-[3/4] rounded-4xl overflow-hidden shadow-2xl relative">
          <div className="absolute inset-0 bg-purple-gradient opacity-20"></div>
          <img 
            src={displayData.image_url || '/jewelry.png'} 
            alt={displayData.name} 
            className="w-full h-full object-cover"
          />
          {/* 플로팅 글래스 UI */}
          <div className="absolute bottom-6 left-6 right-6 glass-card p-6 rounded-3xl">
            <h2 className="text-2xl font-bold text-slate-800 mb-1 text-center">{displayData.name}</h2>
            <p className="text-slate-500 mb-4 text-xs leading-relaxed text-center">
              {displayData.description}
            </p>
            <a 
              href={displayData.video_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full purple-btn flex items-center justify-center gap-2 text-sm !py-2.5 no-underline"
            >
              <Play className="w-5 h-5 fill-current" />
              사용 설명 영상 보기
            </a>
          </div>
        </div>
      </div>

      {/* 정보 카드 리스트 */}
      <div className="w-full max-w-md space-y-3">
        <div className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-white transition-all active:scale-95 cursor-pointer">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800 text-sm">정품 인증서 공유</h3>
            <p className="text-[10px] text-slate-400">디지털 원본을 전송합니다</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </div>
        
        <a 
          href={displayData.manual_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-white transition-all active:scale-95 no-underline"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800 text-sm">설명서 다운로드</h3>
            <p className="text-[10px] text-slate-400">PDF 파일로 확인 가능</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </a>
      </div>

      {/* 하단 내비게이션 (더미) */}
      <div className="fixed bottom-6 w-full max-w-md flex justify-center px-6">
        <div className="bg-slate-900 rounded-full py-4 px-10 flex gap-12 items-center shadow-2xl">
          <div className="w-2 h-2 rounded-full bg-white"></div>
          <div className="w-2 h-2 rounded-full bg-white/30"></div>
          <div className="w-2 h-2 rounded-full bg-white/30"></div>
        </div>
      </div>
    </div>
  );
}
