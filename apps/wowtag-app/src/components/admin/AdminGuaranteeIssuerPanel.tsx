import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Stamp, Trash2, Upload } from 'lucide-react';

import { ImeTextInput } from '../ImeTextInput';
import { ProductGuaranteeCertificate } from '../ProductGuaranteeCertificate';
import { useToast } from '../ToastProvider';
import type { GuaranteeCertificateData } from '../../lib/guaranteeCertificateData';
import {
  DEFAULT_GUARANTEE_ISSUER_PROFILE,
  invalidateGuaranteeIssuerCache,
  loadGuaranteeIssuer,
  type GuaranteeIssuerProfile,
} from '../../lib/guaranteeIssuer';

function previewCertificateData(issuer: GuaranteeIssuerProfile): GuaranteeCertificateData {
  return {
    productName: '미리보기 샘플',
    weightLine: '3.75g / 1.00 돈',
    purityLine: '24K · 999.9',
    serialNo: 'SAMPLE',
    issueDateLine: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일`,
    issuerName: issuer.issuerName,
    imageUrl: '/jewelry.png',
  };
}

async function fileToStampPayload(file: File): Promise<{ base64: string; fileName: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('invalid_type');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('too_large');
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode_failed'));
      el.src = url;
    });
    const maxEdge = 600;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    let width = srcW;
    let height = srcH;
    if (srcW > maxEdge || srcH > maxEdge) {
      if (srcW >= srcH) {
        width = maxEdge;
        height = Math.round((srcH * maxEdge) / srcW);
      } else {
        height = maxEdge;
        width = Math.round((srcW * maxEdge) / srcH);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_failed');
    ctx.drawImage(img, 0, 0, width, height);
    return { base64: canvas.toDataURL('image/png'), fileName: 'stamp.png' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AdminGuaranteeIssuerPanel({ getAuthHeaders }: { getAuthHeaders: () => HeadersInit }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const stampInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<GuaranteeIssuerProfile>(DEFAULT_GUARANTEE_ISSUER_PROFILE);
  const [stampFile, setStampFile] = useState<{ base64: string; fileName: string } | null>(null);
  const [clearStamp, setClearStamp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const stampPreview = stampFile?.base64 || (!clearStamp ? form.stampUrl : '');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      invalidateGuaranteeIssuerCache();
      const profile = await loadGuaranteeIssuer();
      if (!cancelled) {
        setForm(profile);
        setStampFile(null);
        setClearStamp(false);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStampChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const prepared = await fileToStampPayload(file);
      setStampFile(prepared);
      setClearStamp(false);
    } catch {
      showToast('error', t('admin_dashboard.guarantee_issuer.stamp_invalid'));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.issuerName.trim()) {
      showToast('error', t('admin_dashboard.guarantee_issuer.name_required'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/guarantee/issuer', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          issuerName: form.issuerName.trim(),
          issuerPlace: form.issuerPlace.trim(),
          contact: form.contact.trim(),
          stamp_file_base64: stampFile?.base64,
          stamp_file_name: stampFile?.fileName,
          clearStamp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('error', data.error || t('admin_dashboard.guarantee_issuer.save_failed'));
        return;
      }
      invalidateGuaranteeIssuerCache();
      const saved = await loadGuaranteeIssuer();
      setForm(saved);
      setStampFile(null);
      setClearStamp(false);
      showToast('success', t('admin_dashboard.guarantee_issuer.save_success'));
    } catch {
      showToast('error', t('admin_dashboard.guarantee_issuer.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const liveIssuer: GuaranteeIssuerProfile = {
    ...form,
    stampUrl: stampPreview,
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
          {t('admin_dashboard.guarantee_issuer.title')}
        </h2>
        <p className="text-[11px] sm:text-xs font-bold text-slate-400 mt-1 leading-relaxed">
          {t('admin_dashboard.guarantee_issuer.desc')}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
        <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Stamp className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-black text-slate-800">{t('admin_dashboard.guarantee_issuer.form_title')}</h3>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
              {t('admin_dashboard.guarantee_issuer.issuer_name')}
            </label>
            <ImeTextInput
              value={form.issuerName}
              onChange={(v) => setForm((p) => ({ ...p, issuerName: v }))}
              placeholder={t('admin_dashboard.guarantee_issuer.issuer_name_placeholder')}
              scrollIntoViewOnFocus
              className="w-full h-12 bg-slate-50 rounded-xl px-4 text-sm font-bold outline-none border border-transparent focus:border-amber-300 focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
              {t('admin_dashboard.guarantee_issuer.issuer_place')}
            </label>
            <ImeTextInput
              value={form.issuerPlace}
              onChange={(v) => setForm((p) => ({ ...p, issuerPlace: v }))}
              placeholder={t('admin_dashboard.guarantee_issuer.issuer_place_placeholder')}
              scrollIntoViewOnFocus
              className="w-full h-12 bg-slate-50 rounded-xl px-4 text-sm font-bold outline-none border border-transparent focus:border-amber-300 focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
              {t('admin_dashboard.guarantee_issuer.contact')}
            </label>
            <ImeTextInput
              value={form.contact}
              onChange={(v) => setForm((p) => ({ ...p, contact: v }))}
              placeholder={t('admin_dashboard.guarantee_issuer.contact_placeholder')}
              scrollIntoViewOnFocus
              className="w-full h-12 bg-slate-50 rounded-xl px-4 text-sm font-bold outline-none border border-transparent focus:border-amber-300 focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
              {t('admin_dashboard.guarantee_issuer.stamp')}
            </label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl border border-amber-200/70 bg-amber-50/50 overflow-hidden flex items-center justify-center shrink-0">
                {stampPreview ? (
                  <img src={stampPreview} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-lg font-black text-amber-700">印</span>
                )}
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                <input ref={stampInputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void handleStampChange(e)} />
                <button
                  type="button"
                  onClick={() => stampInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-black border border-amber-200/70 hover:bg-amber-100"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('admin_dashboard.guarantee_issuer.stamp_upload')}
                </button>
                {stampPreview ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStampFile(null);
                      setClearStamp(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-white text-rose-600 text-xs font-black border border-rose-100 hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('admin_dashboard.guarantee_issuer.stamp_remove')}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400">{t('admin_dashboard.guarantee_issuer.stamp_hint')}</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('admin_dashboard.guarantee_issuer.save_btn')}
          </button>
        </form>

        <div className="bg-slate-100/80 rounded-3xl border border-slate-200/80 p-4 overflow-auto max-h-[80vh]">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1">
            {t('admin_dashboard.guarantee_issuer.live_preview')}
          </p>
          <div className="origin-top-left scale-[0.42] sm:scale-[0.55] w-[794px]">
            <ProductGuaranteeCertificate data={previewCertificateData(liveIssuer)} issuer={liveIssuer} />
          </div>
        </div>
      </div>
    </>
  );
}
