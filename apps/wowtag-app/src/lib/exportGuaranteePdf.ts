import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { sanitizeGuaranteeFileBase } from './guaranteeCertificateData';

export async function downloadProductGuaranteePdf(element: HTMLElement, fileTitle: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png', 1.0);
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
