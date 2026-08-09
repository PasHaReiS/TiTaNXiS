import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Send, BellRing, RotateCw, History, Bookmark, Trash2, Plus, Clock, Calendar, Eye, MousePointerClick } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function PushBroadcastPanel() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [busy, setBusy] = useState(false);
  const [tplName, setTplName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleRepeat, setScheduleRepeat] = useState("");
  const [tplModal, setTplModal] = useState(null);
  const [tplModalAt, setTplModalAt] = useState("");
  const [tplModalRepeat, setTplModalRepeat] = useState("");
  const { data: history = [], mutate: refreshHistory } = useSWR(isAdmin ? "/push/history" : null, fetcher, { refreshInterval: 20000 });
  const { data: templates = [], mutate: refreshTpl } = useSWR(isAdmin ? "/push/templates" : null, fetcher);
  const { data: scheduled = [], mutate: refreshScheduled } = useSWR(isAdmin ? "/push/scheduled" : null, fetcher, { refreshInterval: 30000 });
  if (!isAdmin) return null;

  const doSend = async (payload) => {
    setBusy(true);
    try {
      const res = await api.post("/push/broadcast", payload);
      toast.success(t("push_bc_sent", { sent: res.data.sent, removed: res.data.removed }));
      refreshHistory();
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
      return false;
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast.error(t("push_bc_required")); return; }
    if (scheduleAt) {
      try {
        const iso = new Date(scheduleAt).toISOString();
        await api.post("/push/scheduled", { title: title.trim(), body: body.trim(), url: url.trim() || "/", scheduled_at: iso, repeat: scheduleRepeat || null });
        toast.success(t("push_sched_created", { at: new Date(scheduleAt).toLocaleString() }));
        setTitle(""); setBody(""); setScheduleAt(""); setScheduleRepeat("");
        refreshScheduled();
      } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
      return;
    }
    const ok = await doSend({ title: title.trim(), body: body.trim(), url: url.trim() || "/", tag: "manual-broadcast" });
    if (ok) { setTitle(""); setBody(""); }
  };

  const cancelScheduled = async (id) => {
    try {
      await api.delete(`/push/scheduled/${id}`);
      toast.success(t("push_sched_cancelled"));
      refreshScheduled();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const resend = (h) => doSend({ title: h.title, body: h.body, url: h.url || "/", tag: h.tag || "manual-broadcast" });

  const applyTemplate = (tpl) => {
    setTitle(tpl.title || "");
    setBody(tpl.body || "");
    setUrl(tpl.url || "/");
    toast.success(t("push_tpl_applied", { name: tpl.name }));
  };

  const scheduleFromTemplate = async () => {
    if (!tplModal || !tplModalAt) return;
    try {
      const iso = new Date(tplModalAt).toISOString();
      await api.post("/push/scheduled", {
        title: tplModal.title,
        body: tplModal.body,
        url: tplModal.url || "/",
        scheduled_at: iso,
        repeat: tplModalRepeat || null,
      });
      toast.success(t("push_sched_created", { at: new Date(tplModalAt).toLocaleString() }));
      setTplModal(null);
      setTplModalAt("");
      setTplModalRepeat("");
      refreshScheduled();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const saveTemplate = async () => {
    if (!tplName.trim() || !title.trim() || !body.trim()) { toast.error(t("push_tpl_required")); return; }
    try {
      await api.post("/push/templates", { name: tplName.trim(), title: title.trim(), body: body.trim(), url: url.trim() || "/" });
      toast.success(t("push_tpl_saved"));
      setTplName(""); setShowSave(false);
      refreshTpl();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const deleteTemplate = async (id, name) => {
    if (!window.confirm(t("push_tpl_delete_confirm", { name }))) return;
    try {
      await api.delete(`/push/templates/${id}`);
      toast.success(t("deleted"));
      refreshTpl();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  return (
    <div
      data-testid="push-broadcast-panel"
      className="p-4 rounded-lg mb-4"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: "1px solid rgba(168,85,247,0.4)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="w-4 h-4" style={{ color: "#A855F7" }} />
        <h3 className="text-xs font-bold uppercase" style={{ color: "#A855F7", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("push_bc_title")}
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        {templates.length === 0 && (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg" style={{ background: "rgba(168,85,247,0.08)", border: "1px dashed rgba(168,85,247,0.4)" }} data-testid="push-tpl-seed-hint">
            <span className="text-[11px]" style={{ color: "#E0E7FF" }}>
              {t("push_tpl_seed_hint")}
            </span>
            <button
              type="button"
              data-testid="push-tpl-seed-btn"
              onClick={async () => {
                const defaults = [
                  { name: t("push_tpl_default_rally_name"), title: t("push_tpl_default_rally_title"), body: t("push_tpl_default_rally_body"), url: "/etkinlikler" },
                  { name: t("push_tpl_default_event_name"), title: t("push_tpl_default_event_title"), body: t("push_tpl_default_event_body"), url: "/etkinlikler" },
                  { name: t("push_tpl_default_maint_name"), title: t("push_tpl_default_maint_title"), body: t("push_tpl_default_maint_body"), url: "/" },
                ];
                setBusy(true);
                try {
                  for (const d of defaults) {
                    await api.post("/push/templates", d);
                  }
                  toast.success(t("push_tpl_seeded"));
                  refreshTpl();
                } catch (e) {
                  toast.error(e?.response?.data?.detail || e.message);
                } finally { setBusy(false); }
              }}
              disabled={busy}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)", color: "#fff", letterSpacing: "0.06em" }}
            >
              <Plus className="w-3 h-3 inline mr-0.5" /> {t("push_tpl_seed_btn")}
            </button>
          </div>
        )}
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center" data-testid="push-templates-strip">
            <span className="text-[10px] uppercase tracking-widest opacity-70" style={{ color: "#A855F7" }}>
              <Bookmark className="w-3 h-3 inline" /> {t("push_tpl_favorites")}:
            </span>
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-0.5" data-testid={`push-tpl-${tpl.id}`}>
                <button
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  data-testid={`push-tpl-apply-${tpl.id}`}
                  className="px-2 py-1 rounded-full text-[10px] font-bold uppercase"
                  style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.5)", color: "#E0E7FF", letterSpacing: "0.06em" }}
                >
                  {tpl.name}
                </button>
                <button
                  type="button"
                  onClick={() => { setTplModal(tpl); setTplModalAt(""); }}
                  data-testid={`push-tpl-schedule-${tpl.id}`}
                  className="p-0.5 opacity-60 hover:opacity-100"
                  style={{ color: "#EC4899" }}
                  title={t("push_tpl_schedule_this")}
                >
                  <Clock className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(tpl.id, tpl.name)}
                  data-testid={`push-tpl-del-${tpl.id}`}
                  className="p-0.5 opacity-50 hover:opacity-100"
                  style={{ color: "#f87171" }}
                  title={t("delete")}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="push-bc-title"
          placeholder={t("push_bc_title_placeholder")}
          className="w-full rounded px-3 py-2 text-sm"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          data-testid="push-bc-body"
          placeholder={t("push_bc_body_placeholder")}
          rows={2}
          className="w-full rounded px-3 py-2 text-sm"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          data-testid="push-bc-url"
          placeholder={t("push_bc_url_placeholder")}
          className="w-full rounded px-3 py-2 text-xs mono"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-widest flex items-center gap-1" style={{ color: "#A855F7" }}>
            <Clock className="w-3 h-3" /> {t("push_sched_when")}:
          </label>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            data-testid="push-sched-at"
            className="flex-1 rounded px-2 py-1.5 text-xs mono"
            style={{ background: "#1A1210", border: "1px solid rgba(168,85,247,0.4)", color: "#F5F0E8", colorScheme: "dark" }}
          />
          {scheduleAt && (
            <button
              type="button"
              onClick={() => setScheduleAt("")}
              data-testid="push-sched-clear"
              className="px-2 py-1.5 rounded text-[10px]"
              style={{ background: "#1A1210", color: "#F5F0E8", opacity: 0.6 }}
              title={t("cancel")}
            >
              ×
            </button>
          )}
        </div>
        {scheduleAt && (
          <div className="flex items-center gap-1.5" data-testid="push-sched-repeat-row">
            <label className="text-[10px] uppercase tracking-widest" style={{ color: "#A855F7" }}>{t("push_sched_repeat")}:</label>
            {["", "daily", "weekly"].map((r) => (
              <button
                key={r || "once"}
                type="button"
                onClick={() => setScheduleRepeat(r)}
                data-testid={`push-sched-repeat-${r || "once"}`}
                className="px-2 py-1 rounded-full text-[10px] font-bold uppercase"
                style={{
                  background: scheduleRepeat === r ? "linear-gradient(135deg,#A855F7,#EC4899)" : "rgba(20,12,10,0.6)",
                  color: scheduleRepeat === r ? "#fff" : "#A855F7",
                  border: `1px solid ${scheduleRepeat === r ? "#EC4899" : "rgba(168,85,247,0.4)"}`,
                  letterSpacing: "0.06em",
                }}
              >
                {r === "" ? t("push_sched_once") : r === "daily" ? t("push_sched_daily") : t("push_sched_weekly")}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {showSave ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0" data-testid="push-tpl-save-row">
              <input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                data-testid="push-tpl-name-input"
                placeholder={t("push_tpl_name_placeholder")}
                className="flex-1 rounded px-2 py-1.5 text-xs"
                style={{ background: "#1A1210", border: "1px solid rgba(168,85,247,0.4)", color: "#F5F0E8" }}
              />
              <button
                type="button"
                onClick={saveTemplate}
                data-testid="push-tpl-save-btn"
                className="px-2 py-1.5 rounded text-white text-[11px] font-bold"
                style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
              >
                {t("save")}
              </button>
              <button
                type="button"
                onClick={() => { setShowSave(false); setTplName(""); }}
                data-testid="push-tpl-save-cancel"
                className="px-2 py-1.5 rounded text-[11px]"
                style={{ background: "#1A1210", color: "#F5F0E8", opacity: 0.7 }}
              >
                {t("cancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSave(true)}
              disabled={!title.trim() || !body.trim()}
              data-testid="push-tpl-save-toggle"
              className="px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1"
              style={{
                background: "transparent",
                border: "1px dashed rgba(168,85,247,0.6)",
                color: "#A855F7",
                opacity: (!title.trim() || !body.trim()) ? 0.4 : 1,
              }}
            >
              <Bookmark className="w-3 h-3" /> {t("push_tpl_save_as")}
            </button>
          )}
          <button
            type="button"
            onClick={send}
            disabled={busy}
            data-testid="push-bc-send"
            className="px-4 py-2 rounded-lg text-white text-xs font-bold flex items-center gap-1.5"
            style={{ background: scheduleAt ? "linear-gradient(135deg,#A855F7,#EC4899)" : "linear-gradient(135deg,#7C3AED,#3B82F6)", opacity: busy ? 0.6 : 1 }}
          >
            {scheduleAt ? <Calendar className="w-3 h-3" /> : <Send className="w-3 h-3" />}
            {busy ? t("push_bc_sending") : (scheduleAt ? t("push_sched_submit") : t("push_bc_send"))}
          </button>
        </div>
      </div>

      {scheduled.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(236,72,153,0.25)" }} data-testid="push-scheduled-list">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3.5 h-3.5" style={{ color: "#EC4899" }} />
            <div className="text-[10px] font-bold uppercase" style={{ color: "#EC4899", letterSpacing: "0.08em" }}>
              {t("push_sched_pending")} ({scheduled.length})
            </div>
          </div>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {scheduled.map((s) => (
              <div
                key={s.id}
                data-testid={`push-sched-${s.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded"
                style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(236,72,153,0.2)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate flex items-center gap-1.5" style={{ color: "#F5F0E8" }}>
                    {s.title}
                    {s.repeat && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase" style={{
                        background: "linear-gradient(135deg,#A855F7,#EC4899)",
                        color: "#fff", letterSpacing: "0.06em",
                      }} data-testid={`push-sched-repeat-badge-${s.id}`}>
                        {s.repeat === "daily" ? t("push_sched_daily") : t("push_sched_weekly")}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "#F5F0E8", opacity: 0.6 }}>{s.body}</div>
                  <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: "#EC4899" }}>
                    <Clock className="w-3 h-3" />
                    <span>{new Date(s.scheduled_at).toLocaleString()}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cancelScheduled(s.id)}
                  data-testid={`push-sched-cancel-${s.id}`}
                  className="p-1 rounded flex-shrink-0"
                  style={{ background: "#3B1F1B", color: "#f87171", border: "1px solid rgba(220,38,38,0.35)" }}
                  aria-label={t("cancel")}
                  title={t("cancel")}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(168,85,247,0.25)" }} data-testid="push-history-list">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-3.5 h-3.5" style={{ color: "#A855F7" }} />
            <div className="text-[10px] font-bold uppercase" style={{ color: "#A855F7", letterSpacing: "0.08em" }}>
              {t("push_bc_history")}
            </div>
          </div>
          <PushAnalyticsChart history={history} />
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <div
                key={h.id}
                data-testid={`push-history-${h.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded"
                style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: "#F5F0E8" }}>{h.title}</div>
                  <div className="text-[10px] truncate" style={{ color: "#F5F0E8", opacity: 0.6 }}>{h.body}</div>
                  <div className="text-[9px] mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "#F5F0E8", opacity: 0.5 }}>
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                    <span>·</span>
                    <span>{t("push_bc_sent_short", { sent: h.sent })}</span>
                    {h.sent >= 0 && (
                      <>
                        <span className="inline-flex items-center gap-0.5" style={{ color: "#38BDF8" }} data-testid={`push-history-opened-${h.id}`}>
                          <Eye className="w-3 h-3" /> {h.opened || 0}{h.sent > 0 ? ` · %${Math.round(((h.opened || 0) / h.sent) * 100)}` : ""}
                        </span>
                        <span className="inline-flex items-center gap-0.5" style={{ color: "#22C55E" }} data-testid={`push-history-clicked-${h.id}`}>
                          <MousePointerClick className="w-3 h-3" /> {h.clicked || 0}{h.sent > 0 ? ` · %${Math.round(((h.clicked || 0) / h.sent) * 100)}` : ""}
                        </span>
                      </>
                    )}
                    <span className="mono opacity-70">{h.url}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => resend(h)}
                  disabled={busy}
                  data-testid={`push-history-resend-${h.id}`}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#7C3AED,#3B82F6)", color: "#fff" }}
                >
                  <RotateCw className="w-3 h-3" /> {t("push_bc_resend")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tplModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, background: "rgba(0,0,0,0.75)" }}
          onClick={() => setTplModal(null)}
          data-testid="push-tpl-schedule-modal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md p-5 rounded-xl relative"
            style={{ background: "#1E1410", border: "1px solid #EC4899", boxShadow: "0 8px 32px rgba(0,0,0,0.9)" }}
          >
            <button type="button" onClick={() => setTplModal(null)} className="absolute top-3 right-3 opacity-70 hover:opacity-100" data-testid="push-tpl-schedule-close">
              <Trash2 className="w-4 h-4" style={{ color: "#f87171" }} />
            </button>
            <h3 className="text-lg font-bold mb-3 uppercase flex items-center gap-2"
              style={{ color: "#EC4899", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
              <Clock className="w-4 h-4" /> {t("push_tpl_schedule_title")}
            </h3>
            <div className="mb-3 p-3 rounded-lg" style={{ background: "rgba(20,12,10,0.7)", border: "1px solid rgba(168,85,247,0.3)" }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: "#A855F7", letterSpacing: "0.08em" }}>{tplModal.name}</div>
              <div className="text-sm font-bold" style={{ color: "#F5F0E8" }}>{tplModal.title}</div>
              <div className="text-xs mt-1" style={{ color: "#F5F0E8", opacity: 0.7 }}>{tplModal.body}</div>
              <div className="text-[10px] mt-1 mono" style={{ color: "#F5F0E8", opacity: 0.5 }}>{tplModal.url}</div>
            </div>
            <label className="text-[10px] uppercase tracking-widest flex items-center gap-1 mb-1" style={{ color: "#EC4899" }}>
              <Clock className="w-3 h-3" /> {t("push_sched_when")}
            </label>
            <input
              type="datetime-local"
              value={tplModalAt}
              onChange={(e) => setTplModalAt(e.target.value)}
              data-testid="push-tpl-schedule-at"
              className="w-full rounded px-2 py-2 text-xs mono mb-3"
              style={{ background: "#1A1210", border: "1px solid rgba(236,72,153,0.4)", color: "#F5F0E8", colorScheme: "dark" }}
            />
            <div className="flex items-center gap-1.5 mb-3">
              <label className="text-[10px] uppercase tracking-widest" style={{ color: "#EC4899" }}>{t("push_sched_repeat")}:</label>
              {["", "daily", "weekly"].map((r) => (
                <button
                  key={r || "once"}
                  type="button"
                  onClick={() => setTplModalRepeat(r)}
                  data-testid={`push-tpl-repeat-${r || "once"}`}
                  className="px-2 py-1 rounded-full text-[10px] font-bold uppercase"
                  style={{
                    background: tplModalRepeat === r ? "linear-gradient(135deg,#A855F7,#EC4899)" : "rgba(20,12,10,0.6)",
                    color: tplModalRepeat === r ? "#fff" : "#EC4899",
                    border: `1px solid ${tplModalRepeat === r ? "#EC4899" : "rgba(236,72,153,0.4)"}`,
                    letterSpacing: "0.06em",
                  }}
                >
                  {r === "" ? t("push_sched_once") : r === "daily" ? t("push_sched_daily") : t("push_sched_weekly")}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={scheduleFromTemplate}
              disabled={!tplModalAt}
              data-testid="push-tpl-schedule-submit"
              className="w-full py-2.5 rounded-lg font-bold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#A855F7,#EC4899)", opacity: !tplModalAt ? 0.5 : 1 }}
            >
              <Clock className="w-4 h-4" /> {t("push_sched_submit")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PushAnalyticsChart({ history }) {
  const { t } = useTranslation();
  // Bucket by hour-of-day (0-23), sum sent/opened/clicked → hourly open %
  const buckets = Array.from({ length: 24 }, () => ({ sent: 0, opened: 0, clicked: 0 }));
  (history || []).forEach((h) => {
    const d = h.created_at ? new Date(h.created_at) : null;
    if (!d) return;
    const hr = d.getHours();
    buckets[hr].sent += Number(h.sent || 0);
    buckets[hr].opened += Number(h.opened || 0);
    buckets[hr].clicked += Number(h.clicked || 0);
  });
  const maxSent = Math.max(1, ...buckets.map((b) => b.sent));
  const hasData = buckets.some((b) => b.sent > 0);
  if (!hasData) return null;
  return (
    <div
      data-testid="push-analytics-chart"
      className="mb-3 p-3 rounded-lg"
      style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(56,189,248,0.3)" }}
    >
      <div className="text-[10px] font-bold uppercase mb-2" style={{ color: "#38BDF8", letterSpacing: "0.08em" }}>
        {t("push_analytics_title")}
      </div>
      <div className="flex items-end gap-0.5" style={{ height: 60 }}>
        {buckets.map((b, i) => {
          const rate = b.sent > 0 ? b.opened / b.sent : 0;
          const h = b.sent > 0 ? Math.max(4, (b.sent / maxSent) * 56) : 2;
          const hue = 200 + Math.round(rate * 60); // higher rate = warmer
          return (
            <div
              key={i}
              data-testid={`push-analytics-bar-${i}`}
              className="flex-1 flex flex-col items-center justify-end"
              title={`${i}:00 — ${b.sent} sent, ${b.opened} opened (${Math.round(rate * 100)}%)`}
            >
              <div style={{
                width: "100%",
                height: `${h}px`,
                background: b.sent > 0 ? `linear-gradient(180deg, hsl(${hue},80%,55%), hsl(${hue},70%,40%))` : "rgba(255,255,255,0.05)",
                borderRadius: 2,
              }} />
              {(i % 3 === 0) && (
                <div className="text-[8px] mt-0.5" style={{ color: "#F5F0E8", opacity: 0.55 }}>{i}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[9px] mt-1" style={{ color: "#F5F0E8", opacity: 0.55 }}>
        {t("push_analytics_hint")}
      </div>
    </div>
  );
}
