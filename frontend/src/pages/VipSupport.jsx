import React, { useState, useMemo, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Search, Bell, ChevronUp, ChevronDown, CheckCircle2, Eye, Pin,
  MessageSquarePlus, Shield, Sparkles, Lock, Globe as GlobeIcon, X,
  ChevronRight, ChevronDown as ChevronD, Loader2, Trash2, CheckSquare, Square, Undo2, Archive,
} from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const VIOLET = "#8B5CF6";
const AMBER = "#F59E0B";
const BASE = "#0A0015";

function CategoryPill({ cat, active, onClick }) {
  const badge = cat.unread || 0;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`vip-cat-${cat.slug}`}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all"
      style={{
        background: active
          ? `linear-gradient(90deg, ${cat.color}33, ${VIOLET}22)`
          : "rgba(139,92,246,0.06)",
        border: active ? `1px solid ${cat.color}` : "1px solid rgba(139,92,246,0.2)",
        boxShadow: active ? `0 0 12px ${cat.color}55` : "none",
      }}
    >
      <span
        className="text-xs font-bold uppercase tracking-wider truncate"
        style={{ color: active ? "#fff" : "rgba(196,181,253,0.85)", fontFamily: "Cinzel, serif" }}
      >
        #{cat.label}
      </span>
      {badge > 0 && (
        <span
          className="text-[10px] font-black mono px-1.5 rounded-full"
          style={{ background: AMBER, color: "#0A0015", minWidth: 20, textAlign: "center" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function VoteControl({ thread, myVote, onVote, size = "md" }) {
  const s = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        data-testid={`vip-upvote-${thread.id}`}
        onClick={(e) => { e.stopPropagation(); onVote(myVote === 1 ? 0 : 1); }}
        style={{ color: myVote === 1 ? AMBER : "rgba(196,181,253,0.5)" }}
      >
        <ChevronUp className={s} />
      </button>
      <span className="text-[10px] mono font-bold" style={{ color: "#F5F0E8" }}>
        {(thread.upvotes || 0) - (thread.downvotes || 0)}
      </span>
      <button
        type="button"
        data-testid={`vip-downvote-${thread.id}`}
        onClick={(e) => { e.stopPropagation(); onVote(myVote === -1 ? 0 : -1); }}
        style={{ color: myVote === -1 ? "#EF4444" : "rgba(196,181,253,0.5)" }}
      >
        <ChevronDown className={s} />
      </button>
    </div>
  );
}

function ThreadCard({ thread, onOpen, canAdmin, onDelete, selectionMode, selected, onToggleSelect }) {
  const { t } = useTranslation();
  return (
    <div
      onClick={selectionMode ? () => onToggleSelect(thread.id) : onOpen}
      data-testid={`vip-thread-${thread.id}`}
      className="cursor-pointer p-3 rounded-lg flex gap-3 transition-all hover:translate-y-[-1px]"
      style={{
        background: selected
          ? `linear-gradient(135deg, rgba(239,68,68,0.15), rgba(10,0,21,0.6))`
          : "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(10,0,21,0.6))",
        border: selected
          ? "1px solid #EF4444"
          : (thread.has_admin_reply ? `1px solid ${AMBER}66` : "1px solid rgba(139,92,246,0.25)"),
        boxShadow: thread.has_admin_reply ? `0 0 14px ${AMBER}22` : "none",
      }}
    >
      {selectionMode && canAdmin && (
        <div className="flex-shrink-0 flex items-center" onClick={(e) => { e.stopPropagation(); onToggleSelect(thread.id); }}>
          {selected
            ? <CheckSquare className="w-4 h-4" style={{ color: "#EF4444" }} />
            : <Square className="w-4 h-4" style={{ color: "rgba(196,181,253,0.5)" }} />
          }
        </div>
      )}
      <VoteControl thread={thread} myVote={0} onVote={() => {}} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {thread.pinned && <Pin className="w-3 h-3" style={{ color: AMBER }} />}
          <h3 className="text-sm font-black truncate" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
            {thread.title}
          </h3>
          {thread.resolved && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap"
              style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.4)" }}
            >
              <CheckCircle2 className="w-2.5 h-2.5" /> {t("vip_resolved_badge")}
            </span>
          )}
          {thread.has_admin_reply && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap"
              style={{ background: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}66` }}
            >
              <Sparkles className="w-2.5 h-2.5" /> TİTAN
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed line-clamp-2 mb-2" style={{ color: "rgba(245,240,232,0.65)" }}>
          {thread.body}
        </p>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "rgba(196,181,253,0.7)" }}>
          <span className="mono">@{thread.author_name}</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{thread.views || 0}</span>
          <span>💬 {thread.reply_count || 0}</span>
        </div>
      </div>
      {canAdmin && !selectionMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(thread); }}
          data-testid={`vip-thread-delete-${thread.id}`}
          title={t("vip_delete_tooltip")}
          className="flex-shrink-0 p-1.5 rounded-md transition-colors hover:bg-red-500/20"
          style={{ color: "#EF4444", border: "1px solid rgba(239,68,68,0.35)" }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function TrashDialog({ open, onClose, refreshThreads }) {
  const { t } = useTranslation();
  const { data: rows = [], mutate: refetch } = useSWR(open ? "/vip/trash" : null, fetcher);
  if (!open) return null;
  const restore = async (tid) => {
    try {
      await api.post(`/vip/threads/${tid}/restore`);
      toast.success(t("vip_toast_restored"));
      await refetch();
      refreshThreads?.();
    } catch (e) {
      toast.error(t("vip_toast_restore_fail"));
    }
  };
  const relHours = (iso) => {
    if (!iso) return "";
    const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    return t("vip_trash_ago", { h: diffH, r: Math.max(0, 24 - diffH) });
  };
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/85 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ zIndex: 999999 }}
      data-testid="vip-trash-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl p-4 rounded-lg my-4"
        style={{ background: BASE, border: `1px solid ${AMBER}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"
              style={{ color: AMBER, fontFamily: "Cinzel, serif" }}>
            <Archive className="w-4 h-4" /> {t("vip_trash_title")}
          </h3>
          <button onClick={onClose} data-testid="vip-trash-close"><X className="w-4 h-4 text-white" /></button>
        </div>
        <p className="text-[10px] mb-3" style={{ color: "rgba(196,181,253,0.6)" }}>
          {t("vip_trash_desc")}
        </p>
        {rows.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>
            {t("vip_trash_empty")}
          </div>
        )}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="p-3 rounded-lg"
                 data-testid={`vip-trash-item-${row.id}`}
                 style={{ background: "rgba(245,158,11,0.06)", border: `1px solid ${AMBER}44` }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: "#F5F0E8" }}>{row.title}</div>
                  <div className="text-[10px] mt-1" style={{ color: "rgba(196,181,253,0.6)" }}>
                    @{row.author_name} · #{row.category} · {relHours(row.deleted_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restore(row.id)}
                  data-testid={`vip-trash-restore-${row.id}`}
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid #10B981" }}
                >
                  <Undo2 className="w-3 h-3" /> {t("vip_trash_restore")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({ open, thread, onCancel, onConfirm, busy }) {
  const { t } = useTranslation();
  if (!open || !thread) return null;
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/85 flex items-center justify-center p-4"
      style={{ zIndex: 1000000 }}
      data-testid="vip-delete-confirm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm p-5 rounded-lg text-center"
        style={{ background: BASE, border: "1px solid #EF4444" }}
      >
        <Trash2 className="w-8 h-8 mx-auto mb-2" style={{ color: "#EF4444" }} />
        <h3 className="text-sm font-black uppercase tracking-widest mb-2"
            style={{ color: "#EF4444", fontFamily: "Cinzel, serif" }}>
          {t("vip_delete_title")}
        </h3>
        <p className="text-xs mb-4" style={{ color: "rgba(245,240,232,0.85)" }}>
          <b className="block truncate" title={thread.title}>{thread.title}</b>
          {t("vip_delete_warn")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="vip-delete-cancel"
            className="flex-1 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            style={{ background: "rgba(139,92,246,0.15)", color: "#C4B5FD", border: `1px solid ${VIOLET}55` }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="vip-delete-confirm-btn"
            className="flex-1 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            style={{ background: "#EF4444", color: "#fff", border: "1px solid #EF4444" }}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : t("vip_delete_permanent")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplyCard({ reply, canAdmin, onToggleVisibility }) {
  const { t } = useTranslation();
  const isAdmin = reply.is_admin;
  return (
    <div
      data-testid={`vip-reply-${reply.id}`}
      className="p-3 rounded-lg"
      style={{
        background: isAdmin ? `linear-gradient(135deg, ${AMBER}18, ${VIOLET}0A)` : "rgba(139,92,246,0.08)",
        border: isAdmin ? `1px solid ${AMBER}` : "1px solid rgba(139,92,246,0.2)",
        boxShadow: isAdmin ? `0 0 16px ${AMBER}33` : "none",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {isAdmin && (
          <span
            className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: AMBER, color: BASE, fontFamily: "Cinzel, serif" }}
          >
            <Shield className="w-3 h-3" /> TiTaNXiS
          </span>
        )}
        <span className="text-xs font-bold" style={{ color: isAdmin ? AMBER : "#C4B5FD" }}>
          @{reply.author_name}
        </span>
        <span className="text-[10px]" style={{ color: "rgba(196,181,253,0.5)" }}>
          {new Date(reply.created_at).toLocaleString("tr")}
        </span>
        {!reply.is_public && (
          <span
            className="ml-auto text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}
          >
            <Lock className="w-2.5 h-2.5" /> {t("vip_private")}
          </span>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#F5F0E8" }}>
        {reply.body}
      </p>
      {canAdmin && (
        <div className="mt-2 flex items-center gap-2">
          <label
            className="flex items-center gap-1.5 text-[10px] cursor-pointer"
            style={{ color: reply.is_public ? "#10B981" : "rgba(245,240,232,0.6)" }}
          >
            <input
              type="checkbox"
              checked={!!reply.is_public}
              onChange={(e) => onToggleVisibility(reply.id, e.target.checked)}
              data-testid={`vip-reply-public-${reply.id}`}
            />
            <GlobeIcon className="w-3 h-3" />
            <span className="uppercase tracking-wider font-bold">{t("vip_public")}</span>
          </label>
        </div>
      )}
    </div>
  );
}

function NewThreadDialog({ open, onClose, categorySlug, onCreated, initialTitle = "", initialBody = "" }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setBody(initialBody);
    }
  }, [open, initialTitle, initialBody]);
  if (!open) return null;
  const submit = async () => {
    if (title.trim().length < 3 || body.trim().length < 1) {
      toast.error(t("vip_toast_title_empty"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/vip/threads", { category: categorySlug, title, body });
      toast.success(t("vip_toast_created"));
      setTitle(""); setBody("");
      onCreated?.(res.data);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("vip_toast_create_fail"));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/85 flex items-center justify-center p-4"
      style={{ zIndex: 999999 }}
      data-testid="vip-new-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-4 rounded-lg"
        style={{ background: BASE, border: `1px solid ${VIOLET}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: AMBER, fontFamily: "Cinzel, serif" }}>
            {t("vip_new_thread_title")} · #{categorySlug}
          </h3>
          <button onClick={onClose} data-testid="vip-new-close"><X className="w-4 h-4 text-white" /></button>
        </div>
        <input
          type="text"
          placeholder={t("vip_new_title_placeholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="vip-new-title"
          className="w-full px-3 py-2 rounded mb-2 text-sm outline-none"
          style={{ background: "rgba(139,92,246,0.1)", border: `1px solid ${VIOLET}66`, color: "#F5F0E8" }}
        />
        <textarea
          placeholder={t("vip_new_body_placeholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          data-testid="vip-new-body"
          rows={6}
          className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
          style={{ background: "rgba(139,92,246,0.1)", border: `1px solid ${VIOLET}66`, color: "#F5F0E8" }}
        />
        <button
          onClick={submit}
          disabled={submitting}
          data-testid="vip-new-submit"
          className="mt-3 w-full py-2 rounded font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${VIOLET}, ${AMBER})`, color: BASE, fontFamily: "Cinzel, serif" }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("vip_send")}
        </button>
      </div>
    </div>
  );
}

function ThreadDetailDialog({ threadId, open, onClose, refreshThreads, isAdminUser, user }) {
  const { t } = useTranslation();
  const { data, mutate: refetch } = useSWR(open && threadId ? `/vip/threads/${threadId}` : null, fetcher);
  const [replyBody, setReplyBody] = useState("");
  const [replyPublic, setReplyPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;
  const canAdmin = data?.can_admin || isAdminUser;
  const thread = data?.thread;

  const submitReply = async () => {
    if (replyBody.trim().length < 1) {
      toast.error(t("vip_toast_reply_empty"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/vip/threads/${threadId}/reply`, { body: replyBody, is_public: replyPublic });
      setReplyBody("");
      toast.success(t("vip_toast_reply_added"));
      await refetch();
      refreshThreads?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("vip_toast_add_fail"));
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (val) => {
    if (!user) { toast.error(t("vip_toast_vote_login")); return; }
    try {
      await api.post(`/vip/threads/${threadId}/vote`, { value: val });
      await refetch();
      refreshThreads?.();
    } catch {}
  };

  const toggleResolve = async () => {
    try {
      await api.patch(`/vip/threads/${threadId}/resolve`, { resolved: !thread.resolved });
      await refetch();
      refreshThreads?.();
    } catch {}
  };

  const togglePin = async () => {
    try {
      await api.patch(`/vip/threads/${threadId}/pin`, { pinned: !thread.pinned });
      await refetch();
      refreshThreads?.();
    } catch {}
  };

  const toggleVisibility = async (rid, next) => {
    try {
      await api.patch(`/vip/replies/${rid}/visibility`, { is_public: next });
      await refetch();
    } catch {}
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/90 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      style={{ zIndex: 999999 }}
      data-testid="vip-detail-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl p-4 rounded-lg my-4"
        style={{ background: BASE, border: `1px solid ${VIOLET}` }}
      >
        {!thread && <div className="text-center py-6 text-white">{t("loading")}</div>}
        {thread && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <VoteControl thread={thread} myVote={data?.my_vote || 0} onVote={vote} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {thread.pinned && <Pin className="w-4 h-4" style={{ color: AMBER }} />}
                  <h2 className="text-lg font-black" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
                    {thread.title}
                  </h2>
                  {thread.resolved && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.4)" }}>
                      <CheckCircle2 className="w-3 h-3" /> {t("vip_resolved_badge")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] mb-3" style={{ color: "rgba(196,181,253,0.7)" }}>
                  <span className="mono">@{thread.author_name}</span>
                  <span>{new Date(thread.created_at).toLocaleString("tr")}</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{thread.views}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#F5F0E8" }}>
                  {thread.body}
                </p>
              </div>
              <button onClick={onClose} data-testid="vip-detail-close">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {canAdmin && (
              <div className="flex items-center gap-2 mb-4 p-2 rounded"
                   style={{ background: `${AMBER}0F`, border: `1px solid ${AMBER}55` }}>
                <button onClick={toggleResolve} data-testid="vip-toggle-resolve"
                        className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                        style={{ background: thread.resolved ? "#10B981" : "rgba(16,185,129,0.2)", color: thread.resolved ? BASE : "#10B981" }}>
                  {thread.resolved ? t("vip_resolved_check") : t("vip_mark_resolved")}
                </button>
                <button onClick={togglePin} data-testid="vip-toggle-pin"
                        className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                        style={{ background: thread.pinned ? AMBER : `${AMBER}22`, color: thread.pinned ? BASE : AMBER }}>
                  {thread.pinned ? t("vip_pinned") : t("vip_pin")}
                </button>
              </div>
            )}

            <div className="space-y-2 mb-4">
              {(data?.replies || []).map((r) => (
                <ReplyCard key={r.id} reply={r} canAdmin={canAdmin} onToggleVisibility={toggleVisibility} />
              ))}
              {(data?.replies || []).length === 0 && (
                <div className="text-center py-4 text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>
                  {t("vip_no_replies")}
                </div>
              )}
            </div>

            {user && (
              <div className="border-t pt-3" style={{ borderColor: `${VIOLET}44` }}>
                <textarea
                  placeholder={t("vip_reply_placeholder")}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  data-testid="vip-reply-body"
                  rows={3}
                  className="w-full px-3 py-2 rounded text-sm outline-none resize-none mb-2"
                  style={{ background: "rgba(139,92,246,0.1)", border: `1px solid ${VIOLET}66`, color: "#F5F0E8" }}
                />
                <div className="flex items-center justify-between gap-2">
                  {canAdmin && (
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer"
                           style={{ color: replyPublic ? "#10B981" : "rgba(245,240,232,0.6)" }}>
                      <input type="checkbox" checked={replyPublic} onChange={(e) => setReplyPublic(e.target.checked)}
                             data-testid="vip-reply-public-toggle" />
                      <GlobeIcon className="w-3 h-3" />
                      <span className="uppercase tracking-wider font-bold">{t("vip_public")}</span>
                    </label>
                  )}
                  <button onClick={submitReply} disabled={submitting} data-testid="vip-reply-submit"
                          className="ml-auto px-4 py-2 rounded text-xs font-black uppercase tracking-widest disabled:opacity-50"
                          style={{ background: `linear-gradient(135deg, ${VIOLET}, ${AMBER})`, color: BASE, fontFamily: "Cinzel, serif" }}>
                    {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : t("vip_reply_btn")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FaqAccordion({ items }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState(null);
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4" data-testid="vip-faq-accordion">
      <div className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2"
           style={{ color: AMBER, fontFamily: "Cinzel, serif" }}>
        <Pin className="w-3 h-3" /> {t("vip_pinned_questions")}
      </div>
      <div className="space-y-1.5">
        {items.map((it) => {
          const isOpen = openId === it.id;
          return (
            <div key={it.id} className="rounded-lg overflow-hidden"
                 style={{ background: "rgba(245,158,11,0.05)", border: `1px solid ${AMBER}44` }}>
              <button
                onClick={() => setOpenId(isOpen ? null : it.id)}
                data-testid={`vip-faq-toggle-${it.id}`}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                {isOpen ? <ChevronD className="w-3 h-3" style={{ color: AMBER }} /> : <ChevronRight className="w-3 h-3" style={{ color: AMBER }} />}
                <span className="text-xs font-bold flex-1" style={{ color: "#F5F0E8" }}>{it.title}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 text-xs leading-relaxed" style={{ color: "rgba(245,240,232,0.85)" }}>
                  <div className="mb-2 whitespace-pre-wrap">{it.body}</div>
                  {it.answer && (
                    <div className="mt-2 p-2 rounded" style={{ background: `${AMBER}11`, border: `1px solid ${AMBER}66` }}>
                      <div className="text-[9px] font-black uppercase mb-1" style={{ color: AMBER }}>{t("vip_titan_reply")}</div>
                      <div className="whitespace-pre-wrap" style={{ color: "#F5F0E8" }}>{it.answer}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function VipSupport() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCat = searchParams.get("category") || "genel-sorular";
  const [activeCat, setActiveCat] = useState(initialCat);
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState(null);
  const [prefill, setPrefill] = useState({ title: "", body: "" });

  // Auto-open the "new thread" modal when routed here with `?compose=1`,
  // pre-filling title/body from URL when provided (used by Access-Denied page).
  useEffect(() => {
    if (searchParams.get("compose") === "1") {
      setPrefill({
        title: searchParams.get("title") || "",
        body: searchParams.get("body") || "",
      });
      setNewModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("compose");
      next.delete("title");
      next.delete("body");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: categories = [] } = useSWR("/vip/categories", fetcher, { refreshInterval: 30000 });
  const listUrl = `/vip/threads?category=${activeCat}&status=${statusFilter}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data: threads = [], mutate: mutateThreads } = useSWR(listUrl, fetcher);
  const { data: faq = [] } = useSWR("/vip/faq", fetcher);
  const { data: stats } = useSWR("/vip/stats", fetcher, { refreshInterval: 30000 });

  const refreshThreads = () => {
    mutateThreads();
    globalMutate("/vip/categories");
    globalMutate("/vip/stats");
    globalMutate("/vip/faq");
  };

  const catDetails = useMemo(() => categories.find((c) => c.slug === activeCat), [categories, activeCat]);
  const canAdminUI = isAdmin || user?.can_edit === true;

  // Admin moderation state (soft-delete + bulk + trash)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/vip/threads/${deleteTarget.id}`);
      toast.success(t("vip_toast_soft_deleted"));
      setDeleteTarget(null);
      refreshThreads();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("vip_toast_delete_fail"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleteBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.delete(`/vip/threads/${id}`)));
      toast.success(t("vip_toast_bulk_soft_deleted", { n: selectedIds.size }));
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkConfirm(false);
      refreshThreads();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("vip_toast_bulk_delete_fail"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const filterTabs = [
    { key: "all", label: t("vip_filter_all") },
    { key: "new", label: t("vip_filter_new") },
    { key: "resolved", label: t("vip_filter_resolved") },
  ];

  return (
    <div
      className="w-full min-h-[calc(100vh-120px)]"
      style={{
        background: `radial-gradient(1200px 600px at 20% 0%, ${VIOLET}22, transparent), ${BASE}`,
        color: "#F5F0E8",
      }}
      data-testid="vip-support-page"
    >
      <div className="max-w-6xl mx-auto p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5" style={{ color: AMBER }} />
          <h1 className="text-xl font-black uppercase tracking-widest"
              style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
            {t("vip_page_title")}
          </h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full ml-2"
                style={{ background: `${VIOLET}33`, color: "#C4B5FD", border: `1px solid ${VIOLET}66` }}>
            {catDetails?.label || activeCat}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          <aside className="space-y-1.5" data-testid="vip-sidebar">
            {categories.map((c) => (
              <CategoryPill key={c.slug} cat={c} active={c.slug === activeCat} onClick={() => setActiveCat(c.slug)} />
            ))}
          </aside>

          <main className="min-w-0">
            <div
              className="flex flex-wrap items-center gap-2 mb-4 p-2 rounded-lg"
              style={{
                background: "rgba(139,92,246,0.06)",
                border: `1px solid ${VIOLET}44`,
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-[180px] px-2 py-1 rounded"
                   style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${VIOLET}44` }}>
                <Search className="w-3.5 h-3.5" style={{ color: VIOLET }} />
                <input
                  type="text"
                  placeholder={t("vip_search_placeholder")}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  data-testid="vip-search"
                  className="bg-transparent outline-none text-xs flex-1"
                  style={{ color: "#F5F0E8" }}
                />
              </div>
              <div className="flex items-center gap-1" data-testid="vip-status-tabs">
                {filterTabs.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    data-testid={`vip-filter-${f.key}`}
                    className="text-[10px] font-bold uppercase px-2.5 py-1 rounded transition-all"
                    style={{
                      background: statusFilter === f.key ? AMBER : "rgba(245,158,11,0.1)",
                      color: statusFilter === f.key ? BASE : AMBER,
                      border: `1px solid ${AMBER}66`,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button data-testid="vip-bell" className="p-1.5 rounded-full transition-colors"
                      style={{ background: "rgba(245,158,11,0.1)" }}>
                <Bell className="w-3.5 h-3.5" style={{ color: AMBER }} />
              </button>
              {canAdminUI && (
                <>
                  <button
                    type="button"
                    onClick={() => { setSelectionMode((v) => !v); setSelectedIds(new Set()); }}
                    data-testid="vip-selection-toggle"
                    className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full"
                    style={{
                      background: selectionMode ? "#EF4444" : "rgba(239,68,68,0.1)",
                      color: selectionMode ? "#fff" : "#EF4444",
                      border: "1px solid #EF4444",
                    }}
                  >
                    {selectionMode ? t("cancel") : t("vip_selection_mode")}
                  </button>
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={() => setBulkConfirm(true)}
                      disabled={selectedIds.size === 0}
                      data-testid="vip-bulk-delete"
                      className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full disabled:opacity-40 flex items-center gap-1"
                      style={{ background: "#EF4444", color: "#fff", border: "1px solid #EF4444" }}
                    >
                      <Trash2 className="w-3 h-3" /> {t("vip_delete_selected", { n: selectedIds.size })}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTrashOpen(true)}
                    data-testid="vip-trash-open"
                    className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full flex items-center gap-1"
                    style={{ background: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}` }}
                  >
                    <Archive className="w-3 h-3" /> {t("vip_trash_btn")}
                  </button>
                </>
              )}
            </div>

            <FaqAccordion items={faq} />

            <div className="space-y-2" data-testid="vip-threads-list">
              {threads.length === 0 && (
                <div className="text-center py-10 text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>
                  {t("vip_empty_category")}
                </div>
              )}
              {threads.map((t) => (
                <ThreadCard
                  key={t.id}
                  thread={t}
                  onOpen={() => setOpenThreadId(t.id)}
                  canAdmin={canAdminUI}
                  onDelete={(th) => setDeleteTarget(th)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(t.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>

            {stats && (
              <div
                className="mt-6 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs"
                data-testid="vip-stats-bar"
                style={{
                  background: "rgba(139,92,246,0.06)",
                  border: `1px solid ${VIOLET}44`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(196,181,253,0.7)" }}>
                    {t("vip_stats_total")}
                  </span>
                  <span className="text-lg font-black mono" style={{ color: AMBER }}>{stats.total_threads}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(196,181,253,0.7)" }}>
                    {t("vip_stats_resolved")}
                  </span>
                  <span className="text-lg font-black mono" style={{ color: "#10B981" }}>{stats.resolved_threads}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(196,181,253,0.7)" }}>
                    {t("vip_stats_avg")}
                  </span>
                  <span className="text-lg font-black mono" style={{ color: "#C4B5FD" }}>
                    {stats.avg_response_hours != null ? `${stats.avg_response_hours}s` : "—"}
                  </span>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {user && (
        <button
          onClick={() => setNewModalOpen(true)}
          data-testid="vip-fab-new"
          className="fixed bottom-20 right-4 z-40 rounded-full p-4 shadow-2xl transition-transform hover:scale-110"
          style={{
            background: `linear-gradient(135deg, ${VIOLET}, ${AMBER})`,
            boxShadow: `0 8px 24px ${VIOLET}88, 0 0 40px ${AMBER}44`,
          }}
        >
          <MessageSquarePlus className="w-6 h-6" style={{ color: BASE }} />
        </button>
      )}

      <NewThreadDialog
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        categorySlug={activeCat}
        onCreated={refreshThreads}
        initialTitle={prefill.title}
        initialBody={prefill.body}
      />
      <ThreadDetailDialog
        threadId={openThreadId}
        open={!!openThreadId}
        onClose={() => setOpenThreadId(null)}
        refreshThreads={refreshThreads}
        isAdminUser={isAdmin}
        user={user}
      />
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        thread={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        busy={deleteBusy}
      />
      <ConfirmDeleteDialog
        open={bulkConfirm}
        thread={{ title: t("vip_bulk_target", { n: selectedIds.size }), id: "bulk" }}
        onCancel={() => setBulkConfirm(false)}
        onConfirm={bulkDelete}
        busy={deleteBusy}
      />
      <TrashDialog
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        refreshThreads={refreshThreads}
      />
    </div>
  );
}
