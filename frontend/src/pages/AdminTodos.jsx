import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import {
  ClipboardList, Plus, X, Loader2, Check, Trash2, Pencil, Calendar, User,
} from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Admin To-Do list — /admin/gorevler (v135.31).
 * Lonca yönetimi görevleri. Sadece admin. Tüm metinler `useTranslation()`
 * fallback ile geçiyor — 29 dil için hazır.
 */
export default function AdminTodos() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState("open");
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null);
  const swrKey = filter === "all" ? "/admin-todos" : `/admin-todos?status=${filter}`;
  const { data, mutate, isLoading } = useSWR(swrKey, fetcher, { refreshInterval: 60000 });
  const items = data?.items || [];

  const toggleDone = async (tpl) => {
    try {
      await api.patch(`/admin-todos/${tpl.id}`, { done: !tpl.done });
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const deleteTodo = async (tpl) => {
    if (!window.confirm(t("admin_todo_confirm_delete", "Bu görevi silmek istiyor musun?"))) return;
    try {
      await api.delete(`/admin-todos/${tpl.id}`);
      toast.success(t("admin_todo_deleted_toast", "Görev silindi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">
          {t("admin_todo_access_denied", "Bu sayfa yalnızca yöneticilere açıktır.")}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="admin-todos-page">
      <Header title={t("admin_todo_page_title", "Görevler")} />
      <div className="max-w-4xl mx-auto py-4 px-4 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <ClipboardList className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">
            {t("admin_todo_page_title", "Görevler")}
          </h1>
          <button
            onClick={() => { setEditing(null); setShowCompose(true); }}
            className="ml-auto btn-gold text-xs flex items-center gap-1.5 px-3 py-2"
            data-testid="admin-todo-new-btn"
          >
            <Plus className="w-3.5 h-3.5" /> {t("admin_todo_new_btn", "Yeni Görev")}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="admin-todo-filter-bar">
          {[
            { k: "open", label: t("admin_todo_filter_open",  "Bekleyen") },
            { k: "done", label: t("admin_todo_filter_done",  "Tamamlanan") },
            { k: "all",  label: t("admin_todo_filter_all",   "Tümü") },
          ].map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className="chip text-[11px]"
              data-testid={`admin-todo-filter-${f.k}`}
              style={filter === f.k
                ? { background: "rgba(245,166,35,0.20)", borderColor: "#F5A623", color: "#F5A623" }
                : undefined}
            >
              {f.label}
            </button>
          ))}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {t("admin_todo_counts", "Bekleyen: {{open}} · Tamamlanan: {{done}}",
              { open: data?.open_count ?? 0, done: data?.done_count ?? 0 })}
          </span>
        </div>

        {isLoading && (
          <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("admin_todo_loading", "Yükleniyor…")}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="card-red-gold p-6 text-center text-sm text-muted-foreground" data-testid="admin-todo-empty">
            {t("admin_todo_empty", "Şu an listede görev yok.")}
          </div>
        )}

        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="card-red-gold p-3 flex items-start gap-3"
              data-testid={`admin-todo-row-${it.id}`}
              style={it.done ? { opacity: 0.55 } : undefined}
            >
              <button
                onClick={() => toggleDone(it)}
                className="flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center"
                style={{
                  borderColor: it.done ? "#22c55e" : "rgba(245,166,35,0.55)",
                  background: it.done ? "rgba(34,197,94,0.15)" : "transparent",
                }}
                data-testid={`admin-todo-toggle-${it.id}`}
                title={it.done ? t("admin_todo_reopen", "Beklemede yap") : t("admin_todo_complete", "Tamamlandı yap")}
              >
                {it.done && <Check className="w-4 h-4" style={{ color: "#22c55e" }} />}
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-bold ${it.done ? "line-through text-muted-foreground" : "text-white"}`}
                  data-testid={`admin-todo-title-${it.id}`}
                >
                  {it.title}
                </div>
                <div className="flex items-center gap-3 flex-wrap mt-1 text-[10px] text-muted-foreground font-mono">
                  {it.due_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {it.due_date}
                    </span>
                  )}
                  {it.assigned_to && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {it.assigned_to}
                    </span>
                  )}
                  {it.done && it.done_at && (
                    <span className="text-emerald-400">
                      {t("admin_todo_done_at",
                        "Tamamlandı: {{when}}",
                        { when: new Date(it.done_at).toLocaleString("tr-TR") })}
                    </span>
                  )}
                </div>
                {it.note && (
                  <div className="text-[11px] text-white mt-1 whitespace-pre-wrap">{it.note}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditing(it); setShowCompose(true); }}
                  className="chip text-[10px] p-1"
                  data-testid={`admin-todo-edit-${it.id}`}
                  title={t("admin_todo_edit", "Düzenle")}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => deleteTodo(it)}
                  className="chip text-[10px] p-1"
                  data-testid={`admin-todo-delete-${it.id}`}
                  style={{ borderColor: "#ef4444", color: "#FCA5A5" }}
                  title={t("admin_todo_delete", "Sil")}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCompose && (
        <TodoComposer
          initial={editing}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSaved={() => { mutate(); setShowCompose(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TodoComposer({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title || "");
  const [dueDate, setDueDate] = useState(initial?.due_date || "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || "");
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t("admin_todo_title_required", "Görev adı zorunlu")); return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        due_date: dueDate || null,
        assigned_to: assignedTo || null,
        note: note || null,
      };
      if (initial) {
        await api.patch(`/admin-todos/${initial.id}`, payload);
        toast.success(t("admin_todo_updated_toast", "Görev güncellendi"));
      } else {
        await api.post(`/admin-todos`, payload);
        toast.success(t("admin_todo_created_toast", "Görev oluşturuldu"));
      }
      onSaved();
    } catch (e2) { toast.error(apiErr(e2)); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
      data-testid="admin-todo-composer-modal"
    >
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold p-4 max-w-lg w-full space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
            {initial ? t("admin_todo_edit_title", "Görevi Düzenle") : t("admin_todo_new_title", "Yeni Görev")}
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="block">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
            {t("admin_todo_field_title", "Görev Adı")}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder={t("admin_todo_field_title_ph", "Örn: SvS strateji dokümanı hazırla")}
                 data-testid="admin-todo-composer-title"
                 maxLength={200}
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("admin_todo_field_due", "Son Tarih")}
            </div>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                   data-testid="admin-todo-composer-due"
                   className="w-full bg-background border border-border rounded-md px-2 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("admin_todo_field_assigned", "Atanan")}
            </div>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                   placeholder={t("admin_todo_field_assigned_ph", "Örn: PashaSenol")}
                   data-testid="admin-todo-composer-assigned"
                   className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <label className="block">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
            {t("admin_todo_field_note", "Not (opsiyonel)")}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    data-testid="admin-todo-composer-note"
                    rows={3}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" disabled={saving}
                className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
                data-testid="admin-todo-composer-submit">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving
            ? t("saving", "Kaydediliyor…")
            : (initial ? t("admin_todo_save_edit_btn", "Değişiklikleri Kaydet")
                       : t("admin_todo_save_new_btn", "Görevi Oluştur"))}
        </button>
      </form>
    </div>
  );
}
