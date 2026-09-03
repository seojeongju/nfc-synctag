import { useLayoutEffect, useRef, useState } from 'react';
import { useToast } from './ToastProvider';
import { createPortal } from 'react-dom';

import { downloadProductGuaranteePdf } from '../lib/exportGuaranteePdf';
import type { GuaranteeCertificateData } from '../lib/guaranteeCertificateData';
import {
  DEFAULT_GUARANTEE_ISSUER_PROFILE,
  loadGuaranteeIssuer,
  type GuaranteeIssuerProfile,
} from '../lib/guaranteeIssuer';

/** public/ — PDF·html2canvas 동일 출처 */
export const GUARANTEE_LUXURY_BG = '/guarantee-luxury-bg.svg';

/** A4 @ 96dpi 근사 — 화면·PDF 공통 1장 크기 */
export const GUARANTEE_PAGE_W = 794;
export const GUARANTEE_PAGE_H = 1123;

const gold = '#b8860b';
const border = 'rgba(201, 162, 39, 0.28)';

/** 제품 사진 — A4 1장 유지하면서 충분히 크게 (기존 260px의 2배) */
const PRODUCT_IMAGE_H = 520;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td
        style={{
          border: `1px solid ${border}`,
          padding: '6px 10px',
          backgroundColor: 'rgba(255, 250, 242, 0.95)',
          fontSize: '10px',
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
          padding: '6px 10px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#0f172a',
          verticalAlign: 'middle',
          lineHeight: 1.35,
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
        }}
      >
        {value}
      </td>
    </tr>
  );
}

export function ProductGuaranteeCertificate({
  data,
  issuer,
}: {
  data: GuaranteeCertificateData;
  issuer?: GuaranteeIssuerProfile;
}) {
  const [loadedIssuer, setLoadedIssuer] = useState<GuaranteeIssuerProfile>(
    issuer ?? DEFAULT_GUARANTEE_ISSUER_PROFILE
  );

  useLayoutEffect(() => {
    if (issuer) {
      setLoadedIssuer(issuer);
      return;
    }
    let cancelled = false;
    void loadGuaranteeIssuer().then((profile) => {
      if (!cancelled) setLoadedIssuer(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [issuer]);

  const issuerName = loadedIssuer.issuerName || data.issuerName;
  const issuerPlace = loadedIssuer.issuerPlace;
  const contact = loadedIssuer.contact;
  const stampUrl = loadedIssuer.stampUrl;

  return (
    <div
      data-guarantee-pdf-root="1"
      style={{
        position: 'relative',
        width: `${GUARANTEE_PAGE_W}px`,
        height: `${GUARANTEE_PAGE_H}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: '8px',
        fontFamily: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        color: '#0f172a',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${GUARANTEE_LUXURY_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(155deg, rgba(28, 20, 16, 0.55) 0%, rgba(55, 42, 30, 0.2) 42%, rgba(18, 12, 8, 0.65) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '14px',
          padding: data.imageUrl ? '12px 22px 14px' : '20px 28px 18px',
          height: 'calc(100% - 28px)',
          boxSizing: 'border-box',
          backgroundColor: 'rgba(255, 253, 248, 0.97)',
          borderRadius: '12px',
          border: '1px solid rgba(201, 162, 39, 0.38)',
          boxShadow:
            '0 12px 40px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(212, 175, 55, 0.12)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {data.imageUrl ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '0 0 8px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                height: `${PRODUCT_IMAGE_H}px`,
                borderRadius: '10px',
                border: `1px solid ${border}`,
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 0 0 1px rgba(212, 175, 55, 0.08)',
              }}
            >
              <img
                src={data.imageUrl}
                alt=""
                style={{
                  maxWidth: '100%',
                  maxHeight: `${PRODUCT_IMAGE_H}px`,
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
          </div>
        ) : null}

        <h1
          style={{
            textAlign: 'center',
            color: gold,
            fontSize: '16px',
            fontWeight: 800,
            margin: '0 0 2px',
            letterSpacing: '-0.02em',
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.8)',
            flexShrink: 0,
          }}
        >
          제품 보증서 / Certificate of Guarantee
        </h1>
        <p
          style={{
            textAlign: 'center',
            fontSize: '9px',
            color: '#78716c',
            fontWeight: 700,
            margin: '0 0 8px',
            flexShrink: 0,
          }}
        >
          본 문서는 정품 제품에 대해 발행된 보증서입니다.
        </p>

        <div style={{ marginBottom: '4px', flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: '10px',
              fontWeight: 800,
              color: gold,
              letterSpacing: '0.06em',
              borderBottom: `2px solid ${gold}`,
              paddingBottom: '2px',
            }}
          >
            제품 상세 정보
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', flexShrink: 0 }}>
          <tbody>
            <Row label="품명 (Product)" value={data.productName} />
            <Row label="중량 (Weight)" value={data.weightLine} />
            <Row label="순도 (Purity)" value={data.purityLine} />
            <Row label="관리 번호 (Serial No.)" value={data.serialNo === '—' ? '—' : `№ ${data.serialNo}`} />
            <Row label="발행 일자 (Date)" value={data.issueDateLine} />
            {data.optionsLine ? <Row label="옵션 / 규격" value={data.optionsLine} /> : null}
          </tbody>
        </table>

        <div style={{ marginBottom: '4px', flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: '10px',
              fontWeight: 800,
              color: gold,
              letterSpacing: '0.06em',
              borderBottom: `2px solid ${gold}`,
              paddingBottom: '2px',
            }}
          >
            보증 조건 (Terms)
          </span>
        </div>
        <div
          style={{
            border: `1px solid ${border}`,
            borderRadius: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 251, 242, 0.92)',
            fontSize: '9px',
            fontWeight: 600,
            color: '#475569',
            lineHeight: 1.45,
            marginBottom: '8px',
            flexShrink: 0,
          }}
        >
          본 제품은 표기된 순도 및 중량을 준수한 정품이며, 제조·유통 과정에서 발생한 명백한 하자에 대하여 발행처 정책에 따라
          보증·상담을 제공합니다. 보증 범위 및 기간은 판매 조건 및 별도 안내를 따릅니다.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: '16px',
            marginTop: 'auto',
            paddingTop: '4px',
            flexShrink: 0,
          }}
        >
          <div>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#78716c', margin: '0 0 3px' }}>보증인 (Guarantor)</p>
            <p style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{issuerName}</p>
            {issuerPlace ? (
              <>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#78716c', margin: '6px 0 2px' }}>발행처 (Issuer)</p>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{issuerPlace}</p>
              </>
            ) : null}
            {contact ? (
              <>
                <p style={{ fontSize: '9px', fontWeight: 700, color: '#78716c', margin: '6px 0 2px' }}>연락처 (Contact)</p>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{contact}</p>
              </>
            ) : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#78716c', margin: '0 0 6px' }}>서명 / 도장 (Signature)</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
              <div
                style={{
                  width: '100px',
                  borderBottom: '1px solid #cbd5e1',
                  height: '1px',
                }}
              />
              {stampUrl ? (
                <img
                  src={stampUrl}
                  alt=""
                  style={{
                    width: '56px',
                    height: '56px',
                    objectFit: 'contain',
                    flexShrink: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    borderRadius: '6px',
                    border: `1px solid ${border}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    border: `2px solid ${gold}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: 800,
                    color: gold,
                    flexShrink: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                  }}
                >
                  印
                </div>
              )}
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
  const { showToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [issuer, setIssuer] = useState<GuaranteeIssuerProfile | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    void loadGuaranteeIssuer().then((profile) => {
      if (!cancelled) setIssuer(profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!issuer) return;
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
        showToast('error', msg);
      } finally {
        if (!cancelled) onDoneRef.current();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [issuer, data, showToast]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: GUARANTEE_PAGE_W,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 2147483646,
        overflow: 'hidden',
      }}
      aria-hidden
    >
      <div ref={ref} style={{ width: GUARANTEE_PAGE_W }}>
        {issuer ? <ProductGuaranteeCertificate data={data} issuer={issuer} /> : null}
      </div>
    </div>,
    document.body
  );
}
