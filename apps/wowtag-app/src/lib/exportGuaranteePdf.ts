import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { sanitizeGuaranteeFileBase } from './guaranteeCertificateData';

async function renderToCanvas(el: HTMLElement, scale: number) {
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: '#ffffff',
    /** 모바일 WebKit에서 foreignObject 경로가 불안정한 경우가 있음 */
    foreignObjectRendering: false,
  });
}

export async function downloadProductGuaranteePdf(element: HTMLElement, fileTitle: string) {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) => setTimeout(r, 100));

  let canvas: HTMLCanvasElement;
  try {
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 2) : 2;
    canvas = await renderToCanvas(element, dpr);
  } catch (first) {
    console.warn('[guarantee-pdf] html2canvas retry scale=1', first);
    try {
      canvas = await renderToCanvas(element, 1);
    } catch (second) {
      console.error('[guarantee-pdf] html2canvas failed', second);
      throw second;
    }
  }

  if (!canvas.width || !canvas.height) {
    throw new Error('보증서 렌더 결과가 비어 있습니다. 화면을 한 번 닫았다가 다시 시도해 주세요.');
  }

  let imgData: string;
  try {
    imgData = canvas.toDataURL('image/png', 1.0);
  } catch (e) {
    console.error('[guarantee-pdf] toDataURL', e);
    throw e;
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgWidthMm = pageW;
  const imgHeightMm = (canvas.height * pageW) / canvas.width;
  if (imgHeightMm <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm);
  } else {
    const wFit = (canvas.width * pageH) / canvas.height;
    pdf.addImage(imgData, 'PNG', (pageW - wFit) / 2, 0, wFit, pageH);
  }

  const base = sanitizeGuaranteeFileBase(fileTitle);
  pdf.save(`제품보증서_${base}.pdf`);
}
