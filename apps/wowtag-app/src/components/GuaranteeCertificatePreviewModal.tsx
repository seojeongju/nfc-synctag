import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2 } from 'lucide-react';

import { ProductGuaranteeCertificate } from './ProductGuaranteeCertificate';
import { downloadProductGuaranteePdf } from '../lib/exportGuaranteePdf';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';
import { useToast } from './ToastProvider';

const CERT_W = 794;
const CERT_H = 1123;

/**
 * 제품 보증서 A4 미리보기 + 같은 화면에서 PDF 저장
 * 화면 너비에 맞춰 축소 후, 슬라이더로 추가 조절 (뷰포트 밖으로 넘치지 않음)
 */
export function GuaranteeCertificatePreviewModal({
  data,
  onClose,
}: {
  data: GuaranteeCertificateData | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [viewportW, setViewportW] = useState(360);
  /** 40~100: 화면 맞춤 비율 기준 추가 조절 */
  const [sizePercent, setSizePercent] = useState(100);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, [data]);

  if (!data) return null;

  const pad = 28;
  const maxFit = Math.min(1, Math.max(0.22, (viewportW - pad) / CERT_W));
  const scale = maxFit * (sizePercent / 100);

  const handleDownloadPdf = async () => {
    const root = wrapRef.current?.querySelector('[data-guarantee-pdf-root="1"]') as HTMLElement | null;
    if (!root) {
      showToast('error', '보증서 영역을 찾을 수 없습니다.');
      return;
    }
    setPdfBusy(true);
    try {
      await downloadProductGuaranteePdf(root, data.productName);
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message
          ? e.message
          : 'PDF 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      showToast('error', msg);
    } finally {
      setPdfBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-4xl max-h-[96vh] sm:rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guarantee-preview-title"
      >
        <header className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-amber-100 bg-amber-50/60">
          <div className="min-w-0">
            <h2 id="guarantee-preview-title" className="text-lg font-black text-slate-900 tracking-tight truncate">
              제품 보증서 미리보기
            </h2>
            <p className="text-[11px] font-bold text-amber-800/80 mt-0.5 truncate">{data.productName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2.5 rounded-xl bg-white text-slate-400 hover:text-slate-700 border border-slate-100 shadow-sm"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="shrink-0 px-3 sm:px-6 pt-3 pb-1 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black text-slate-600 shrink-0">화면 맞춤 크기</span>
          <input
            type="range"
            min={40}
            max={100}
            step={1}
            value={sizePercent}
            onChange={(e) => setSizePercent(Number(e.target.value))}
            className="flex-1 min-w-[120px] max-w-sm h-2 accent-amber-600 rounded-full"
            aria-label="보증서 표시 크기"
          />
          <span className="text-[10px] font-mono font-bold text-slate-500 w-10 text-right tabular-nums">{sizePercent}%</span>
          <button
            type="button"
            onClick={() => setSizePercent(100)}
            className="text-[10px] font-black text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            맞춤 100%
          </button>
        </div>
        <p className="px-3 sm:px-6 text-[10px] font-bold text-slate-400 pb-2">
          슬라이더로 크기를 줄이면 한 화면에 더 많이 보입니다. 넓은 화면에서는 자동으로 최대 맞춤됩니다.
        </p>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-auto overscroll-contain bg-gradient-to-b from-slate-200/50 to-slate-300/30 px-2 sm:px-4 pb-4"
        >
          <div className="flex justify-center py-2">
            <div
              className="rounded-[10px] shadow-xl ring-1 ring-black/10 overflow-hidden bg-neutral-900/5"
              style={{
                width: CERT_W * scale,
                height: CERT_H * scale,
                maxWidth: '100%',
              }}
            >
              <div
                ref={wrapRef}
                style={{
                  width: CERT_W,
                  height: CERT_H,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <ProductGuaranteeCertificate data={data} />
              </div>
            </div>
          </div>
        </div>

        <footer className="shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto h-12 px-6 rounded-xl border border-slate-200 bg-white text-slate-700 font-black text-sm hover:bg-slate-50 transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
            className="w-full sm:w-auto h-12 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF로 저장
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
