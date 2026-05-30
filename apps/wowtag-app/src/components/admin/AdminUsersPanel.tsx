import { useCallback, useEffect, useMemo, useState } from 'react';
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

function formatTagUid(uid: string) {
  const raw = String(uid || '').trim();
  if (!raw) return '—';
  if (raw.startsWith('__PENDING')) return 'NFC 미연결';
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

function matchStatusLabel(s: TagLinkRow['match_status']) {
  if (s === 'product_linked') return { text: '제품 매칭', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (s === 'asset_only') return { text: '출고 전 자산', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { text: '태그 미등록', className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

export function AdminUsersPanel({
  getAuthHeaders,
  onGoToNfc,
}: {
  getAuthHeaders: () => HeadersInit;
  onGoToNfc?: () => void;
}) {
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
          setDetailError(typeof data.error === 'string' ? data.error : '상세 조회에 실패했습니다.');
          return;
        }
        setDetail(data as UserDetail);
      } catch {
        setDetail(null);
        setDetailError('네트워크 오류가 발생했습니다.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [getAuthHeaders]
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
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">사용자 관리</h2>
          <p className="text-xs font-bold text-slate-400 mt-1 leading-relaxed">
            소비자 회원 목록과 NFC 태그 연결·제품 매칭·지갑에 담긴 정품 정보를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchUsers()}
          className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-black text-xs rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          새로고침
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
                placeholder="이메일·이름 검색"
                className="w-full h-11 pl-10 pr-4 bg-slate-50 rounded-xl text-sm font-bold outline-none border border-transparent focus:border-violet-300 focus:bg-white"
              />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              총 {filtered.length}명
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
                <p className="text-sm font-black text-slate-400">등록된 사용자가 없습니다.</p>
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
                        {u.name?.trim() || '이름 없음'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
                          태그 {u.tag_link_count ?? 0}
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          골드바 {u.goldbar_link_count ?? 0}
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
              <p className="font-black text-slate-500 text-sm">왼쪽에서 사용자를 선택하세요.</p>
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
                다시 시도
              </button>
            </div>
          ) : detail && selectedUser ? (
            <div className="divide-y divide-slate-100">
              <div className="p-5 sm:p-6 bg-gradient-to-br from-violet-50/90 via-white to-amber-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-1">
                      회원 정보
                    </p>
                    <h3 className="text-lg font-black text-slate-900 break-all">{detail.user.email}</h3>
                    <p className="text-sm font-bold text-slate-600 mt-0.5">
                      {detail.user.name?.trim() || '이름 없음'}
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
                    가입 {formatDate(detail.user.created_at)}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-1 rounded-lg border ${
                      detail.user.has_password
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {detail.user.has_password ? '비밀번호 설정됨' : '비밀번호 미설정'}
                  </span>
                  {detail.pending_release_requests.length > 0 && (
                    <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                      해지 요청 {detail.pending_release_requests.length}건
                    </span>
                  )}
                </div>
              </div>

              {/* NFC 태그 연결 */}
              <section className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-600" />
                    연결된 NFC 태그
                    <span className="text-slate-400 font-bold">({detail.tag_links.length})</span>
                  </h4>
                  {onGoToNfc && (
                    <button
                      type="button"
                      onClick={onGoToNfc}
                      className="text-[10px] font-black text-violet-600 hover:underline"
                    >
                      태그 관리 →
                    </button>
                  )}
                </div>
                {detail.tag_links.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 bg-slate-50 rounded-xl px-4 py-6 text-center">
                    아직 계정에 연결된 NFC 태그가 없습니다.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {detail.tag_links.map((link) => {
                      const badge = matchStatusLabel(link.match_status);
                      return (
                        <div
                          key={link.tag_uid}
                          className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-mono font-black text-slate-800 break-all">
                              {formatTagUid(link.tag_uid)}
                            </p>
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${badge.className}`}
                            >
                              {badge.text}
                            </span>
                          </div>
                          {link.match_status === 'product_linked' ? (
                            <p className="text-sm font-black text-slate-800">
                              제품: {link.product_name || `(ID ${link.product_id})`}
                              {link.product_sold_at ? (
                                <span className="text-[10px] font-bold text-rose-600 ml-2">판매완료</span>
                              ) : null}
                            </p>
                          ) : link.match_status === 'asset_only' ? (
                            <p className="text-xs font-bold text-amber-800">
                              태그는 등록됐으나 아직 출고 제품과 매칭되지 않았습니다.
                            </p>
                          ) : (
                            <p className="text-xs font-bold text-slate-500">
                              관리자 태그 DB에 없는 UID입니다. (스캔만 한 경우)
                            </p>
                          )}
                          <p className="text-[10px] font-bold text-slate-400">
                            계정 연결: {formatDate(link.linked_at)}
                            {link.tag_registered_at
                              ? ` · 태그 등록: ${formatDate(link.tag_registered_at)}`
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
                  지갑에 표시되는 항목
                  <span className="text-slate-400 font-bold">({detail.wallet_items.length})</span>
                </h4>
                {detail.wallet_items.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 bg-white rounded-xl px-4 py-6 text-center border border-slate-100">
                    지갑 항목이 없습니다. NFC 태그 스캔 후 로그인·연결이 필요합니다.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.wallet_items.map((item, idx) => {
                      const isCatalog = item.wallet_source === 'catalog_product';
                      const title = isCatalog
                        ? String(item.name || item.serial_number || '제품')
                        : String(item.serial_number || item.display_name || '골드바');
                      return (
                        <div
                          key={`${String(item.id)}-${idx}`}
                          className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">
                            {isCatalog ? '카탈로그 제품' : '골드바 인증'}
                          </span>
                          <p className="text-sm font-black text-slate-800 mt-1 break-words">{title}</p>
                          {item.tag_uid || item.linked_tag_uid ? (
                            <p className="text-[10px] font-mono font-bold text-slate-500 mt-1 break-all">
                              {formatTagUid(String(item.tag_uid || item.linked_tag_uid))}
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
                    골드바 계정 연결 (user_goldbars)
                  </h4>
                  <div className="space-y-2">
                    {detail.goldbar_links.map((g) => (
                      <div
                        key={String(g.goldbar_id)}
                        className="text-xs font-bold text-slate-600 flex flex-wrap gap-x-3 gap-y-1"
                      >
                        <span className="font-black text-slate-800">{String(g.serial_number)}</span>
                        {g.tag_uid ? (
                          <span className="font-mono">{formatTagUid(String(g.tag_uid))}</span>
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
