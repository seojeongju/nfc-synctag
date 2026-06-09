import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Award,
  ChevronRight,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  Tag,
  User,
  X,
} from 'lucide-react';

type AdminUserRow = {
  id: string;
  email: string;
  name?: string | null;
  created_at?: string | null;
  has_password?: number;
  tag_link_count?: number;
  goldbar_link_count?: number;
};

type TagLinkRow = {
  tag_uid: string;
  linked_at?: string | null;
  product_id?: number | string | null;
  product_name?: string | null;
  product_sold_at?: string | null;
  tag_registered_at?: string | null;
  match_status: 'product_linked' | 'asset_only' | 'unknown';
};

type UserDetail = {
  user: AdminUserRow;
  tag_links: TagLinkRow[];
  goldbar_links: Record<string, unknown>[];
  wallet_items: Record<string, unknown>[];
  pending_release_requests: { goldbar_id: number; status: string; requested_at?: string }[];
};

function formatTagUid(uid: string, t: any) {
  const raw = String(uid || '').trim();
  if (!raw) return '—';
  if (raw.startsWith('__PENDING')) return t('admin_dashboard.users.nfc_unconnected');
  return raw;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function matchStatusLabel(s: TagLinkRow['match_status'], t: any) {
  if (s === 'product_linked') return { text: t('admin_dashboard.users.match_status_linked'), className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (s === 'asset_only') return { text: t('admin_dashboard.users.match_status_asset'), className: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { text: t('admin_dashboard.users.match_status_unregistered'), className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

export function AdminUsersPanel({
  getAuthHeaders,
  onGoToNfc,
}: {
  getAuthHeaders: () => HeadersInit;
  onGoToNfc?: () => void;
}) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsers([]);
        return;
      }
      const list = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];
      setUsers(list as AdminUserRow[]);
    } catch {
      setUsers([]);
    } finally {
      setLoadingList(false);
    }
  }, [getAuthHeaders]);

  const fetchDetail = useCallback(
    async (userId: string) => {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDetail(null);
          setDetailError(typeof data.error === 'string' ? data.error : t('admin_dashboard.users.error_detail_fetch'));
          return;
        }
        setDetail(data as UserDetail);
      } catch {
        setDetail(null);
        setDetailError(t('admin_dashboard.users.error_network'));
      } finally {
        setLoadingDetail(false);
      }
    },
    [getAuthHeaders, t]
  );

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    void fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        String(u.name || '')
          .toLowerCase()
          .includes(q) ||
        u.id.toLowerCase().includes(q)
    );
  }, [users, search]);

  const selectedUser = users.find((u) => u.id === selectedId) ?? detail?.user ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">{t('admin_dashboard.users.title')}</h2>
          <p className="text-xs font-bold text-slate-400 mt-1 leading-relaxed">
            {t('admin_dashboard.users.desc')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchUsers()}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-black text-xs rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          {t('admin_dashboard.users.refresh_btn')}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,340px)_1fr] gap-6 items-start">
        {/* 회원 목록 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin_dashboard.users.search_placeholder')}
                className="w-full h-11 pl-10 pr-4 bg-slate-50 rounded-xl text-sm font-bold outline-none border border-transparent focus:border-violet-300 focus:bg-white"
              />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {t('admin_dashboard.users.total_count', { count: filtered.length })}
            </p>
          </div>

          <div className="max-h-[min(70vh,640px)] overflow-y-auto divide-y divide-slate-50">
            {loadingList ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-400">{t('admin_dashboard.users.no_users')}</p>
              </div>
            ) : (
              filtered.map((u) => {
                const active = selectedId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className={`w-full text-left px-4 py-4 flex items-center gap-3 transition-colors ${
                      active ? 'bg-violet-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        active ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-800 truncate">{u.email}</p>
                      <p className="text-[11px] font-bold text-slate-500 truncate">
                        {u.name?.trim() || t('admin_dashboard.users.name_empty')}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
                          {t('admin_dashboard.users.tag_count', { count: u.tag_link_count ?? 0 })}
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {t('admin_dashboard.users.goldbar_count', { count: u.goldbar_link_count ?? 0 })}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${active ? 'text-violet-500' : 'text-slate-300'}`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 상세 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm min-h-[320px] overflow-hidden">
          {!selectedId ? (
            <div className="py-24 px-8 text-center">
              <User className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="font-black text-slate-500 text-sm">{t('admin_dashboard.users.select_user_prompt')}</p>
            </div>
          ) : loadingDetail ? (
            <div className="py-24 flex justify-center">
              <Loader2 className="w-9 h-9 text-violet-500 animate-spin" />
            </div>
          ) : detailError ? (
            <div className="p-8 text-center">
              <p className="text-sm font-black text-rose-600">{detailError}</p>
              <button
                type="button"
                onClick={() => selectedId && void fetchDetail(selectedId)}
                className="mt-4 text-xs font-black text-violet-600 underline"
              >
                {t('admin_dashboard.users.retry_btn')}
              </button>
            </div>
          ) : detail && selectedUser ? (
            <div className="divide-y divide-slate-100">
              <div className="p-5 sm:p-6 bg-gradient-to-br from-violet-50/90 via-white to-amber-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-1">
                      {t('admin_dashboard.users.user_info_title')}
                    </p>
                    <h3 className="text-lg font-black text-slate-900 break-all">{detail.user.email}</h3>
                    <p className="text-sm font-bold text-slate-600 mt-0.5">
                      {detail.user.name?.trim() || t('admin_dashboard.users.name_empty')}
                    </p>
                    <p className="text-[10px] font-mono font-bold text-slate-400 mt-2 break-all">
                      {detail.user.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setDetail(null);
                    }}
                    className="p-2 rounded-xl bg-white/80 text-slate-400 hover:text-slate-600 border border-slate-100 shrink-0"
                    aria-label="선택 해제"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600">
                    {t('admin_dashboard.users.registered_date', { date: formatDate(detail.user.created_at) })}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-1 rounded-lg border ${
                      detail.user.has_password
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {detail.user.has_password ? t('admin_dashboard.users.password_set') : t('admin_dashboard.users.password_not_set')}
                  </span>
                  {detail.pending_release_requests.length > 0 && (
                    <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                      {t('admin_dashboard.users.pending_releases', { count: detail.pending_release_requests.length })}
                    </span>
                  )}
                </div>
              </div>

              {/* NFC 태그 연결 */}
              <section className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-600" />
                    {t('admin_dashboard.users.connected_nfc_title')}
                    <span className="text-slate-400 font-bold">({detail.tag_links.length})</span>
                  </h4>
                  {onGoToNfc && (
                    <button
                      type="button"
                      onClick={onGoToNfc}
                      className="text-[10px] font-black text-violet-600 hover:underline"
                    >
                      {t('admin_dashboard.users.manage_tags_btn')}
                    </button>
                  )}
                </div>
                {detail.tag_links.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 bg-slate-50 rounded-xl px-4 py-6 text-center">
                    {t('admin_dashboard.users.no_connected_nfc')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {detail.tag_links.map((link) => {
                      const badge = matchStatusLabel(link.match_status, t);
                      return (
                        <div
                          key={link.tag_uid}
                          className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-mono font-black text-slate-800 break-all">
                              {formatTagUid(link.tag_uid, t)}
                            </p>
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${badge.className}`}
                            >
                              {badge.text}
                            </span>
                          </div>
                          {link.match_status === 'product_linked' ? (
                            <p className="text-sm font-black text-slate-800">
                              {t('admin_dashboard.users.product_name_label', { name: link.product_name || `(ID ${link.product_id})` })}
                              {link.product_sold_at ? (
                                <span className="text-[10px] font-bold text-rose-600 ml-2">{t('admin_dashboard.users.product_sold')}</span>
                              ) : null}
                            </p>
                          ) : link.match_status === 'asset_only' ? (
                            <p className="text-xs font-bold text-amber-800">
                              {t('admin_dashboard.users.product_not_matched')}
                            </p>
                          ) : (
                            <p className="text-xs font-bold text-slate-500">
                              {t('admin_dashboard.users.uid_not_in_db')}
                            </p>
                          )}
                          <p className="text-[10px] font-bold text-slate-400">
                            {t('admin_dashboard.users.linked_at_label', { date: formatDate(link.linked_at) })}
                            {link.tag_registered_at
                              ? ` · ${t('admin_dashboard.users.tag_registered_at_label', { date: formatDate(link.tag_registered_at) })}`
                              : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 지갑 항목 */}
              <section className="p-5 sm:p-6 bg-slate-50/40">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
                  <Award className="w-4 h-4 text-amber-600" />
                  {t('admin_dashboard.users.wallet_items_title')}
                  <span className="text-slate-400 font-bold">({detail.wallet_items.length})</span>
                </h4>
                {detail.wallet_items.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 bg-white rounded-xl px-4 py-6 text-center border border-slate-100">
                    {t('admin_dashboard.users.no_wallet_items')}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.wallet_items.map((item, idx) => {
                      const isCatalog = item.wallet_source === 'catalog_product';
                      const title = isCatalog
                        ? String(item.name || item.serial_number || t('admin_dashboard.users.wallet_source_catalog'))
                        : String(item.serial_number || item.display_name || t('admin_dashboard.users.wallet_source_goldbar'));
                      return (
                        <div
                          key={`${String(item.id)}-${idx}`}
                          className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">
                            {isCatalog ? t('admin_dashboard.users.wallet_source_catalog') : t('admin_dashboard.users.wallet_source_goldbar')}
                          </span>
                          <p className="text-sm font-black text-slate-800 mt-1 break-words">{title}</p>
                          {item.tag_uid || item.linked_tag_uid ? (
                            <p className="text-[10px] font-mono font-bold text-slate-500 mt-1 break-all">
                              {formatTagUid(String(item.tag_uid || item.linked_tag_uid), t)}
                            </p>
                          ) : null}
                          {!isCatalog && item.weight ? (
                            <p className="text-[10px] font-bold text-slate-400 mt-1">
                              {String(item.weight)} · {String(item.purity || '')}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* user_goldbars 직접 연결 */}
              {detail.goldbar_links.length > 0 && (
                <section className="p-5 sm:p-6 border-t border-slate-100">
                  <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-3">
                    <Hash className="w-4 h-4 text-slate-500" />
                    {t('admin_dashboard.users.direct_links_title')}
                  </h4>
                  <div className="space-y-2">
                    {detail.goldbar_links.map((g) => (
                      <div
                        key={String(g.goldbar_id)}
                        className="text-xs font-bold text-slate-600 flex flex-wrap gap-x-3 gap-y-1"
                      >
                        <span className="font-black text-slate-800">{String(g.serial_number)}</span>
                        {g.tag_uid ? (
                          <span className="font-mono">{formatTagUid(String(g.tag_uid), t)}</span>
                        ) : null}
                        <span className="text-slate-400">{formatDate(g.added_at as string)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

