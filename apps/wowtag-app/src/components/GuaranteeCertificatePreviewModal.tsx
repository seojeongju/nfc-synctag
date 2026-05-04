import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2 } from 'lucide-react';

import { ProductGuaranteeCertificate } from './ProductGuaranteeCertificate';
import { downloadProductGuaranteePdf } from '../lib/exportGuaranteePdf';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';

/**
 * 제품 보증서 A4 미리보기 + 같은 화면에서 PDF 저장
 */
export function GuaranteeCertificatePreviewModal({
  data,
  onClose,
}: {
  data: GuaranteeCertificateData | null;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  if (!data) return null;

  const handleDownloadPdf = async () => {
    const root = wrapRef.current?.querySelector('[data-guarantee-pdf-root="1"]') as HTMLElement | null;
    if (!root) {
      alert('보증서 영역을 찾을 수 없습니다.');
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
      alert(msg);
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

        <div className="flex-1 min-h-0 overflow-auto bg-slate-100/90 p-3 sm:p-6">
          <p className="text-[10px] font-bold text-slate-500 mb-2 sm:hidden">
            좌우로 스크롤하여 전체 보증서를 확인하세요.
          </p>
          <div className="flex justify-center">
            <div
              ref={wrapRef}
              className="inline-block rounded-lg shadow-lg ring-1 ring-slate-200/80 bg-white overflow-hidden"
            >
              <ProductGuaranteeCertificate data={data} />
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
