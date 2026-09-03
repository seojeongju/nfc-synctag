import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2 } from 'lucide-react';

import {
  ProductGuaranteeCertificate,
  GUARANTEE_PAGE_W,
  GUARANTEE_PAGE_H,
} from './ProductGuaranteeCertificate';
import { downloadProductGuaranteePdf } from '../lib/exportGuaranteePdf';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';
import { useToast } from './ToastProvider';

/**
 * 제품 보증서 미리보기 + PDF 저장
 * A4 1장 고정 — 화면 너비·높이에 맞춰 살짝 축소해 한 장 전체가 보이게 함
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
  const [viewportH, setViewportH] = useState(480);
  /** 70~100: 화면 맞춤 기준에서 추가 조절 (기본 100 = 한 장 맞춤) */
  const [sizePercent, setSizePercent] = useState(100);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data) return;
    const measure = () => {
      setViewportW(el.clientWidth);
      setViewportH(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  if (!data) return null;

  const padX = 24;
  const padY = 16;
  const fitW = Math.min(1, Math.max(0.2, (viewportW - padX) / GUARANTEE_PAGE_W));
  const fitH = Math.min(1, Math.max(0.2, (viewportH - padY) / GUARANTEE_PAGE_H));
  /** 가로·세로 모두 들어가도록 살짝 축소 */
  const fitScale = Math.min(fitW, fitH);
  const scale = fitScale * (sizePercent / 100);

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
            min={70}
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
            1장 맞춤
          </button>
        </div>
        <p className="px-3 sm:px-6 text-[10px] font-bold text-slate-400 pb-2">
          보증서는 A4 1장 기준입니다. 화면에 맞게 자동으로 살짝 축소되어 전체가 한 번에 보입니다.
        </p>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-auto overscroll-contain bg-gradient-to-b from-slate-200/50 to-slate-300/30 px-2 sm:px-4 pb-4"
        >
          <div className="flex justify-center items-start py-2 min-h-full">
            <div
              className="rounded-[10px] shadow-xl ring-1 ring-black/10 overflow-hidden bg-neutral-900/5"
              style={{
                width: GUARANTEE_PAGE_W * scale,
                height: GUARANTEE_PAGE_H * scale,
                maxWidth: '100%',
              }}
            >
              <div
                ref={wrapRef}
                style={{
                  width: GUARANTEE_PAGE_W,
                  height: GUARANTEE_PAGE_H,
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
