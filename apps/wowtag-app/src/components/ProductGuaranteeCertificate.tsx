import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { downloadProductGuaranteePdf } from '../lib/exportGuaranteePdf';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';

const gold = '#b8860b';
const border = '#e2e8f0';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td
        style={{
          border: `1px solid ${border}`,
          padding: '14px 16px',
          backgroundColor: '#fafafa',
          fontSize: '12px',
          fontWeight: 700,
          color: '#64748b',
          width: '28%',
          verticalAlign: 'middle',
        }}
      >
        {label}
      </td>
      <td
        style={{
          border: `1px solid ${border}`,
          padding: '14px 16px',
          fontSize: '13px',
          fontWeight: 700,
          color: '#0f172a',
          verticalAlign: 'middle',
          lineHeight: 1.5,
        }}
      >
        {value}
      </td>
    </tr>
  );
}

export function ProductGuaranteeCertificate({ data }: { data: GuaranteeCertificateData }) {
  return (
    <div
      style={{
        width: '794px',
        minHeight: '1123px',
        boxSizing: 'border-box',
        padding: '44px 52px 48px',
        backgroundColor: '#ffffff',
        fontFamily: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        color: '#0f172a',
      }}
    >
      <h1
        style={{
          textAlign: 'center',
          color: gold,
          fontSize: '22px',
          fontWeight: 800,
          margin: '0 0 6px',
          letterSpacing: '-0.02em',
        }}
      >
        제품 보증서 / Certificate of Guarantee
      </h1>
      <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontWeight: 700, margin: '0 0 28px' }}>
        본 문서는 정품 제품에 대해 발행된 보증서입니다.
      </p>

      <div style={{ marginBottom: '10px' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: '12px',
            fontWeight: 800,
            color: gold,
            letterSpacing: '0.06em',
            borderBottom: `2px solid ${gold}`,
            paddingBottom: '4px',
          }}
        >
          제품 상세 정보
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px' }}>
        <tbody>
          <Row label="품명 (Product)" value={data.productName} />
          <Row label="중량 (Weight)" value={data.weightLine} />
          <Row label="순도 (Purity)" value={data.purityLine} />
          <Row label="관리 번호 (Serial No.)" value={data.serialNo === '—' ? '—' : `№ ${data.serialNo}`} />
          <Row label="발행 일자 (Date)" value={data.issueDateLine} />
          {data.optionsLine ? <Row label="옵션 / 규격" value={data.optionsLine} /> : null}
        </tbody>
      </table>

      <div style={{ marginBottom: '10px' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: '12px',
            fontWeight: 800,
            color: gold,
            letterSpacing: '0.06em',
            borderBottom: `2px solid ${gold}`,
            paddingBottom: '4px',
          }}
        >
          보증 조건 (Terms)
        </span>
      </div>
      <div
        style={{
          border: `1px solid ${border}`,
          borderRadius: '12px',
          padding: '16px 18px',
          backgroundColor: '#fafafa',
          fontSize: '11px',
          fontWeight: 600,
          color: '#475569',
          lineHeight: 1.75,
          marginBottom: '36px',
        }}
      >
        본 제품은 표기된 순도 및 중량을 준수한 정품이며, 제조·유통 과정에서 발생한 명백한 하자에 대해서는 발행처 정책에 따라
        보증·상담을 제공합니다. 보증 범위 및 기간은 판매 조건 및 별도 안내를 따릅니다.
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '24px',
          marginTop: 'auto',
          paddingTop: '12px',
        }}
      >
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', margin: '0 0 6px' }}>발행처 (Issuer)</p>
          <p style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{data.issuerName}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', margin: '0 0 8px' }}>서명 / 도장 (Signature)</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px' }}>
            <div
              style={{
                width: '120px',
                borderBottom: '1px solid #cbd5e1',
                height: '1px',
              }}
            />
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                border: `2px solid ${gold}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 800,
                color: gold,
                flexShrink: 0,
              }}
            >
              印
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 화면 밖에서 보증서를 렌더한 뒤 PDF로 저장하고 종료합니다.
 */
export function GuaranteePdfHost({
  data,
  onDone,
}: {
  data: GuaranteeCertificateData;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      onDoneRef.current();
      return;
    }
    let cancelled = false;

    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      /** 모바일 WebView: 레이아웃·웹폰트 안정화 */
      await new Promise<void>((r) => setTimeout(r, 150));
      if (cancelled) return;
      try {
        await downloadProductGuaranteePdf(el, data.productName);
      } catch (e) {
        console.error(e);
        const msg =
          e instanceof Error && e.message
            ? e.message
            : '보증서 PDF를 만드는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
        alert(msg);
      } finally {
        if (!cancelled) onDoneRef.current();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [data]);

  /**
   * 모바일 Chrome/WebView는 z-index 음수·화면 멀리 떨어진 노드를 레이어에서 생략해
   * html2canvas가 빈 캔버스/예외로 실패할 수 있음 → 뷰포트 (0,0)에 두고 opacity 0으로만 숨김.
   */
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 794,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 2147483646,
        overflow: 'hidden',
      }}
      aria-hidden
    >
      <div ref={ref} style={{ width: 794 }}>
        <ProductGuaranteeCertificate data={data} />
      </div>
    </div>,
    document.body
  );
}
