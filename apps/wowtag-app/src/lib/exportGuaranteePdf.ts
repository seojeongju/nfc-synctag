import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { sanitizeGuaranteeFileBase } from './guaranteeCertificateData';

/**
 * Tailwind v4 등은 oklch() 색을 쓰는데 html2canvas 1.x는 이를 파싱하지 못함.
 * 클론 문서에서 스타일시트를 제거하고(보증서는 인라인 스타일만 사용),
 * 조상 노드에 안전한 hex만 남긴다.
 */
function sanitizeCloneForHtml2Canvas(clonedDoc: Document, clonedElement: HTMLElement) {
  clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
  clonedDoc.querySelectorAll('style').forEach((n) => n.remove());

  const html = clonedDoc.documentElement;
  const body = clonedDoc.body;
  html.style.backgroundColor = '#ffffff';
  html.style.color = '#111111';
  body.style.backgroundColor = '#ffffff';
  body.style.color = '#111111';
  body.style.margin = '0';
  body.style.padding = '0';

  let p: HTMLElement | null = clonedElement;
  while (p && p !== body) {
    p.style.backgroundColor = '#ffffff';
    p.style.color = '#111111';
    p.style.boxShadow = 'none';
    p.style.filter = 'none';
    p.style.opacity = '1';
    p.style.backdropFilter = 'none';
    p = p.parentElement;
  }

  clonedDoc.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement;
    el.removeAttribute('class');
    const st = el.getAttribute('style');
    if (st && /oklch|lab\(|lch\(|color-mix\(/i.test(st)) {
      el.removeAttribute('style');
    }
  });

  /** 보증서 루트는 컴포넌트 인라인 스타일(배경 이미지 등) 유지 — 여기서 덮어쓰지 않음 */
}

async function waitForImages(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
          };
          img.addEventListener('load', done);
          img.addEventListener('error', done);
          window.setTimeout(done, 4000);
        })
    )
  );
}

async function renderToCanvas(el: HTMLElement, scale: number) {
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: '#ffffff',
    /** 모바일 WebKit에서 foreignObject 경로가 불안정한 경우가 있음 */
    foreignObjectRendering: false,
    onclone: (clonedDoc, clonedEl) => {
      sanitizeCloneForHtml2Canvas(clonedDoc, clonedEl);
    },
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
  await waitForImages(element);
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
  if (imgHeightMm <= pageH + 0.01) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm);
  } else {
    /** A4 1장에 맞게 살짝 축소 */
    const fit = pageH / imgHeightMm;
    const w = imgWidthMm * fit;
    const h = pageH;
    pdf.addImage(imgData, 'PNG', (pageW - w) / 2, 0, w, h);
  }

  const base = sanitizeGuaranteeFileBase(fileTitle);
  pdf.save(`제품보증서_${base}.pdf`);
}
