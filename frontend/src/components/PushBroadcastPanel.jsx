import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Send, BellRing, RotateCw, History, Bookmark, Trash2, Plus, Clock, Calendar, Eye, MousePointerClick, Volume2 } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const CURATED_TEMPLATES = [
  { key: "rally_15",   category: "rally",  name: "Rally 15dk",         title: "⚔️ Rally 15 dakika sonra!",       body: "Kaleye toplan, buff'ları hazırla.",                       url: "/etkinlikler" },
  { key: "rally_now",  category: "rally",  name: "Rally Başladı",       title: "⚔️ Rally başladı!",                body: "Hemen katıl — kilit anındayız.",                          url: "/etkinlikler" },
  { key: "boss_spawn", category: "rally",  name: "Boss Doğdu",          title: "🐉 Dünya bossu doğdu",             body: "İttifak, buluşma noktasına — hasar yarışı başlasın!",     url: "/" },
  { key: "new_event",  category: "event",  name: "Yeni Etkinlik",       title: "🏆 Yeni etkinlik başladı",         body: "Puan kaçırma — hemen katıl.",                             url: "/etkinlikler" },
  { key: "duel_start", category: "event",  name: "Duello Başladı",      title: "🥊 Duello başladı!",               body: "Rakibi seç ve hasar yapmaya başla.",                      url: "/etkinlikler" },
  { key: "svs_final",  category: "event",  name: "SvS Finali",          title: "🏰 SvS finali sonuna 2 saat",     body: "Son puanları topla, sıralamada üste tırman.",             url: "/etkinlikler" },
  { key: "new_season", category: "event",  name: "Yeni Sezon",          title: "🌟 Yeni sezon açıldı",             body: "Yeni ödüller ve haritalar seni bekliyor.",                url: "/" },
  { key: "signup_end", category: "event",  name: "Kayıt Sonu",           title: "⏰ Kayıt süresi bitiyor",          body: "Son 30 dakika — hemen kaydını tamamla.",                  url: "/etkinlikler" },
  { key: "reward",     category: "system", name: "Ödül Dağıtıldı",       title: "🎁 Ödüller postana düştü",         body: "Postaneyi kontrol et ve ödülleri topla.",                 url: "/" },
  { key: "maint",      category: "system", name: "Bakım Duyurusu",      title: "🛠️ Kısa bakım duyurusu",         body: "Panel 5 dakika bakıma girecek. Kaydettiğinden emin ol.",  url: "/" },
];
const TEMPLATE_CATEGORIES = [
  { key: "all",    color: "#A855F7" },
  { key: "rally",  color: "#E74C1A" },
  { key: "event",  color: "#F5A623" },
  { key: "system", color: "#38BDF8" },
];

const SOUND_PREF_KEY = "titanxis_push_test_sound_v1";
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
  const [seedModalOpen, setSeedModalOpen] = useState(false);
  const [seedSelected, setSeedSelected] = useState(() => new Set(CURATED_TEMPLATES.slice(0, 3).map((t) => t.key)));
  const [seedCat, setSeedCat] = useState("all");
  const [seedSearch, setSeedSearch] = useState("");
  const [seedHover, setSeedHover] = useState(null);
  const seedSearchRef = React.useRef(null);
  const [detailTpl, setDetailTpl] = useState(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailBody, setDetailBody] = useState("");
  const [detailUrl, setDetailUrl] = useState("");
  const [testTarget, setTestTarget] = useState("me");
  const [testUserId, setTestUserId] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testUserSearch, setTestUserSearch] = useState("");
  const [testUserOpen, setTestUserOpen] = useState(false);
  const [testUserActive, setTestUserActive] = useState(0);
  const [testSoundKey, setTestSoundKey] = useState(() => {
    try { const v = localStorage.getItem(SOUND_PREF_KEY); if (v && ["rally","victory","dungeon","alarm"].includes(v)) return v; } catch {}
    return "rally";
  });
  useEffect(() => {
    try { localStorage.setItem(SOUND_PREF_KEY, testSoundKey); } catch {}
  }, [testSoundKey]);
  const testUserRef = React.useRef(null);
  const testAudioRef = React.useRef(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const { data: memberList = [] } = useSWR(isAdmin ? "/members" : null, fetcher);
  useEffect(() => {
    if (!testUserOpen) return;
    const onDoc = (e) => { if (testUserRef.current && !testUserRef.current.contains(e.target)) setTestUserOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setTestUserOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [testUserOpen]);
  const filteredMembers = (() => {
    const q = (testUserSearch || "").trim().toLowerCase();
    const list = memberList || [];
    if (!q) return list.slice(0, 50);
    return list.filter((m) => (m.name || "").toLowerCase().includes(q)).slice(0, 50);
  })();
  const selectedMemberName = (memberList || []).find((m) => m.id === testUserId)?.name || "";
  const previewSound = () => {
    if (audioBusy) return;
    setAudioBusy(true);
    const done = () => setAudioBusy(false);
    try {
      if (testSoundKey === "rally") {
        if (!testAudioRef.current) {
          testAudioRef.current = new Audio("/audio/epic_battle.mp3");
          testAudioRef.current.volume = 0.6;
        }
        testAudioRef.current.currentTime = 0;
        const p = testAudioRef.current.play();
        if (p && p.catch) p.catch(() => { toast.error(t("push_test_sound_blocked")); done(); return; });
        setTimeout(() => { try { testAudioRef.current.pause(); } catch {} done(); }, 3000);
        return;
      }
      // Synthesized sounds via Web Audio API for distinct cues
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { toast.error(t("push_test_sound_blocked")); done(); return; }
      const ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      gain.connect(ctx.destination);
      const beep = (freq, start, dur, type = "sine") => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(g); g.connect(gain);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      let total = 0;
      if (testSoundKey === "victory") {
        beep(523.25, 0.0, 0.18); beep(659.25, 0.18, 0.18); beep(783.99, 0.36, 0.35);
        total = 0.75;
      } else if (testSoundKey === "dungeon") {
        beep(110, 0.0, 0.7, "sawtooth"); beep(146.83, 0.35, 0.6, "sawtooth");
        total = 1.1;
      } else if (testSoundKey === "alarm") {
        beep(880, 0.0, 0.12, "square"); beep(880, 0.2, 0.12, "square"); beep(880, 0.4, 0.12, "square"); beep(880, 0.6, 0.12, "square");
        total = 0.85;
      }
      setTimeout(() => { try { ctx.close(); } catch {} done(); }, total * 1000 + 100);
    } catch {
      toast.error(t("push_test_sound_blocked"));
      done();
    }
  };
  const openDetail = (c) => {
    setDetailTpl(c);
    setDetailTitle(c.title);
    setDetailBody(c.body);
    setDetailUrl(c.url);
  };
  const installOne = async () => {
    if (!detailTpl) return;
    if (!detailTitle.trim() || !detailBody.trim()) { toast.error(t("push_bc_required")); return; }
    setBusy(true);
    try {
      await api.post("/push/templates", { name: detailTpl.name, title: detailTitle.trim(), body: detailBody.trim(), url: detailUrl.trim() || "/", sound: testSoundKey });
      toast.success(t("push_tpl_seeded_n", { n: 1 }));
      setDetailTpl(null);
      refreshTpl();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };
  const sendTest = async () => {
    if (!detailTitle.trim() || !detailBody.trim()) { toast.error(t("push_bc_required")); return; }
    if (testTarget === "user" && !testUserId) { toast.error(t("push_test_pick_user")); return; }
    setTestBusy(true);
    try {
      const res = await api.post("/push/broadcast/test", {
        title: detailTitle.trim(),
        body: detailBody.trim(),
        url: detailUrl.trim() || "/",
        target: testTarget,
        user_id: testTarget === "user" ? testUserId : null,
      });
      toast.success(t("push_test_sent", { sent: res.data.sent, removed: res.data.removed }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setTestBusy(false); }
  };
  // Keyboard shortcut: `/` focuses the search input while the seed modal is open
  useEffect(() => {
    if (!seedModalOpen) return;
    const onKey = (e) => {
      if (e.key !== "/") return;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      e.preventDefault();
      seedSearchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [seedModalOpen]);
  const seedVisible = (() => {
    const q = seedSearch.trim().toLowerCase();
    const byCat = seedCat === "all" ? CURATED_TEMPLATES : CURATED_TEMPLATES.filter((c) => c.category === seedCat);
    if (!q) return byCat;
    return byCat.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q)
    );
  })();
  const installSelectedTemplates = async () => {
    const chosen = CURATED_TEMPLATES.filter((c) => seedSelected.has(c.key));
    if (chosen.length === 0) { toast.error(t("push_tpl_seed_pick_one")); return; }
    setBusy(true);
    try {
      for (const c of chosen) {
        await api.post("/push/templates", { name: c.name, title: c.title, body: c.body, url: c.url, sound: testSoundKey });
      }
      toast.success(t("push_tpl_seeded_n", { n: chosen.length }));
      setSeedModalOpen(false);
      refreshTpl();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };
  const toggleSeed = (key) => setSeedSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
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
              onClick={() => setSeedModalOpen(true)}
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
      {seedModalOpen && (
        <div
          data-testid="push-tpl-seed-overlay"
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          style={{ background: "rgba(5,3,2,0.85)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSeedModalOpen(false); }}
        >
          <div
            data-testid="push-tpl-seed-modal"
            className="relative w-full max-w-lg rounded-2xl overflow-hidden max-h-[85vh] flex flex-col"
            style={{
              background: "linear-gradient(180deg, rgba(30,20,16,0.98), rgba(15,10,8,0.98))",
              border: "1px solid rgba(168,85,247,0.5)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(168,85,247,0.25)" }}>
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4" style={{ color: "#A855F7" }} />
                <h3 className="text-sm font-bold uppercase" style={{ color: "#A855F7", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
                  {t("push_tpl_library_title")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSeedModalOpen(false)}
                data-testid="push-tpl-seed-close"
                className="rounded-full p-1 hover:bg-white/10"
                style={{ color: "#F5F0E8", opacity: 0.7 }}
                aria-label="Close"
              >
                <Trash2 className="w-3.5 h-3.5" style={{ transform: "rotate(0deg)", visibility: "hidden" }} />
                <span style={{ position: "absolute", top: 12, right: 12, fontSize: 18, lineHeight: 1 }}>×</span>
              </button>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: "rgba(168,85,247,0.06)" }}>
              <span className="text-[11px]" style={{ color: "#E0E7FF" }}>
                {t("push_tpl_library_hint", { n: seedSelected.size })}
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setSeedSelected(new Set(seedVisible.map(c => c.key)))} data-testid="push-tpl-seed-selectall" className="text-[10px] uppercase font-bold px-2 py-1 rounded" style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.5)", color: "#E0E7FF", letterSpacing: "0.06em" }}>
                  {t("push_tpl_select_all")}
                </button>
                <button type="button" onClick={() => setSeedSelected(new Set())} data-testid="push-tpl-seed-clear" className="text-[10px] uppercase font-bold px-2 py-1 rounded" style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(255,255,255,0.15)", color: "#F5F0E8", letterSpacing: "0.06em" }}>
                  {t("push_tpl_clear_all")}
                </button>
              </div>
            </div>
            <div className="px-4 pt-2">
              <input
                type="text"
                value={seedSearch}
                onChange={(e) => setSeedSearch(e.target.value)}
                ref={seedSearchRef}
                data-testid="push-tpl-seed-search"
                placeholder={t("push_tpl_search_placeholder_shortcut")}
                className="w-full rounded px-2.5 py-1.5 text-[12px]"
                style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(168,85,247,0.35)", color: "#F5F0E8" }}
              />
            </div>
            <div className="flex gap-1 px-4 pt-2 pb-1" data-testid="push-tpl-seed-tabs">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const count = cat.key === "all" ? CURATED_TEMPLATES.length : CURATED_TEMPLATES.filter((c) => c.category === cat.key).length;
                const active = seedCat === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSeedCat(cat.key)}
                    data-testid={`push-tpl-seed-tab-${cat.key}`}
                    aria-pressed={active}
                    className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                    style={{
                      background: active ? `${cat.color}30` : "rgba(20,12,10,0.5)",
                      border: `1px solid ${active ? cat.color : "rgba(255,255,255,0.1)"}`,
                      color: active ? cat.color : "#F5F0E8",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {t(`push_tpl_cat_${cat.key}`)}
                    <span className="text-[9px] opacity-80" style={{ fontVariantNumeric: "tabular-nums" }}>({count})</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 relative">
              {seedVisible.length === 0 && (
                <div
                  data-testid="push-tpl-seed-empty"
                  className="text-center py-6 text-[12px] rounded-lg"
                  style={{ background: "rgba(20,12,10,0.5)", border: "1px dashed rgba(255,255,255,0.15)", color: "#F5F0E8", opacity: 0.7 }}
                >
                  {t("push_tpl_no_match")}
                </div>
              )}
              {seedVisible.map((c) => {
                const checked = seedSelected.has(c.key);
                return (
                  <label
                    key={c.key}
                    data-testid={`push-tpl-seed-row-${c.key}`}
                    onMouseEnter={() => setSeedHover(c.key)}
                    onMouseLeave={() => setSeedHover((cur) => cur === c.key ? null : cur)}
                    onFocus={() => setSeedHover(c.key)}
                    onBlur={() => setSeedHover((cur) => cur === c.key ? null : cur)}
                    className="relative flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: checked ? "rgba(168,85,247,0.15)" : "rgba(20,12,10,0.4)",
                      border: `1px solid ${checked ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    {seedHover === c.key && (
                      <div
                        data-testid={`push-tpl-seed-preview-${c.key}`}
                        className="absolute z-10 rounded-lg overflow-hidden pointer-events-none"
                        style={{
                          right: 6,
                          top: "100%",
                          marginTop: 6,
                          minWidth: 260,
                          maxWidth: 320,
                          background: "linear-gradient(180deg,#2a1e1a,#1a110d)",
                          border: "1px solid rgba(245,166,35,0.5)",
                          boxShadow: "0 12px 32px rgba(0,0,0,0.75)",
                        }}
                      >
                        <div className="px-2 py-1 text-[9px] font-bold uppercase" style={{ background: "rgba(245,166,35,0.15)", color: "#F5A623", letterSpacing: "0.08em" }}>
                          {t("push_tpl_preview_title")}
                        </div>
                        <div className="flex items-start gap-2 p-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
                          <img src="/icons/pwa-192.png" alt="" className="rounded flex-shrink-0" style={{ width: 32, height: 32 }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold" style={{ color: "#F5F0E8" }}>{c.title}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: "#F5F0E8", opacity: 0.7 }}>{c.body}</div>
                            <div className="text-[9px] mt-1 uppercase" style={{ color: "#A855F7", opacity: 0.7, letterSpacing: "0.04em" }}>TiTaNXiS · şimdi</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSeed(c.key)}
                      data-testid={`push-tpl-seed-check-${c.key}`}
                      className="mt-0.5 flex-shrink-0"
                      style={{ accentColor: "#A855F7", width: 14, height: 14 }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold" style={{ color: "#E0E7FF" }}>{c.title}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "#F5F0E8", opacity: 0.75 }}>{c.body}</div>
                      <div className="text-[9px] uppercase mt-1" style={{ color: "#A855F7", letterSpacing: "0.06em" }}>
                        {c.name} · → {c.url}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDetail(c); }}
                      data-testid={`push-tpl-seed-detail-${c.key}`}
                      className="flex-shrink-0 text-[9px] uppercase font-bold px-1.5 py-1 rounded self-start mt-0.5"
                      style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#A855F7", letterSpacing: "0.06em" }}
                      title={t("push_tpl_detail_open")}
                    >
                      {t("push_tpl_detail_btn")}
                    </button>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 p-4" style={{ borderTop: "1px solid rgba(168,85,247,0.25)", background: "rgba(10,7,5,0.5)" }}>
              <button type="button" onClick={() => setSeedModalOpen(false)} data-testid="push-tpl-seed-cancel" className="text-[11px] uppercase font-bold hover:opacity-80" style={{ color: "#F5F0E8", opacity: 0.6, letterSpacing: "0.06em" }}>
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={installSelectedTemplates}
                disabled={busy || seedSelected.size === 0}
                data-testid="push-tpl-seed-install"
                className="px-4 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1.5"
                style={{
                  background: seedSelected.size === 0 ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#A855F7,#7C3AED)",
                  color: seedSelected.size === 0 ? "#666" : "#fff",
                  letterSpacing: "0.06em",
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {busy ? t("push_tpl_installing") : t("push_tpl_install_n", { n: seedSelected.size })}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailTpl && (
        <div
          data-testid="push-tpl-detail-overlay"
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ background: "rgba(5,3,2,0.92)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDetailTpl(null); }}
        >
          <div
            data-testid="push-tpl-detail-modal"
            className="relative w-full max-w-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{
              background: "linear-gradient(180deg, rgba(30,20,16,0.98), rgba(15,10,8,0.98))",
              border: "1px solid rgba(245,166,35,0.5)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(245,166,35,0.25)" }}>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" style={{ color: "#F5A623" }} />
                <h3 className="text-sm font-bold uppercase" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
                  {t("push_tpl_detail_title")} — {detailTpl.name}
                </h3>
              </div>
              <button type="button" onClick={() => setDetailTpl(null)} data-testid="push-tpl-detail-close" className="rounded-full px-2 hover:bg-white/10" style={{ color: "#F5F0E8", opacity: 0.7, fontSize: 20, lineHeight: 1 }} aria-label="Close">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: "#A855F7", letterSpacing: "0.08em" }}>{t("push_bc_title_placeholder")}</label>
                  <input
                    value={detailTitle}
                    onChange={(e) => setDetailTitle(e.target.value)}
                    data-testid="push-tpl-detail-title-input"
                    className="w-full rounded px-2.5 py-1.5 text-[13px] font-bold"
                    style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(245,166,35,0.35)", color: "#F5F0E8" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: "#A855F7", letterSpacing: "0.08em" }}>{t("push_bc_body_placeholder")}</label>
                  <textarea
                    value={detailBody}
                    onChange={(e) => setDetailBody(e.target.value)}
                    rows={3}
                    data-testid="push-tpl-detail-body-input"
                    className="w-full rounded px-2.5 py-1.5 text-[12px] resize-none"
                    style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(245,166,35,0.35)", color: "#F5F0E8" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: "#A855F7", letterSpacing: "0.08em" }}>{t("push_tpl_detail_url")}</label>
                  <input
                    value={detailUrl}
                    onChange={(e) => setDetailUrl(e.target.value)}
                    data-testid="push-tpl-detail-url-input"
                    placeholder="/etkinlikler"
                    className="w-full rounded px-2.5 py-1.5 text-[12px] font-mono"
                    style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(245,166,35,0.35)", color: "#F5F0E8" }}
                  />
                  <div className="text-[10px] mt-1" style={{ color: "#F5F0E8", opacity: 0.5 }}>{t("push_tpl_detail_url_hint")}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold mb-2" style={{ color: "#F5A623", letterSpacing: "0.08em" }}>{t("push_tpl_preview_title")}</div>
                <div
                  data-testid="push-tpl-detail-preview"
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: "linear-gradient(180deg,#2a1e1a,#1a110d)",
                    border: "1px solid rgba(245,166,35,0.5)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  <div className="flex items-start gap-2.5 p-3">
                    <img src="/icons/pwa-192.png" alt="" className="rounded flex-shrink-0" style={{ width: 40, height: 40 }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold" style={{ color: "#F5F0E8" }}>{detailTitle || t("push_bc_title_placeholder")}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "#F5F0E8", opacity: 0.75, whiteSpace: "pre-wrap" }}>{detailBody || t("push_bc_body_placeholder")}</div>
                      <div className="text-[9px] mt-1.5 uppercase" style={{ color: "#A855F7", opacity: 0.7, letterSpacing: "0.04em" }}>TiTaNXiS · şimdi · {detailUrl || "/"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 p-4 flex-wrap" style={{ borderTop: "1px solid rgba(245,166,35,0.25)", background: "rgba(10,7,5,0.5)" }}>
              <button type="button" onClick={() => setDetailTpl(null)} data-testid="push-tpl-detail-cancel" className="text-[11px] uppercase font-bold hover:opacity-80" style={{ color: "#F5F0E8", opacity: 0.6, letterSpacing: "0.06em" }}>
                {t("cancel")}
              </button>
              <div className="flex items-center gap-2 flex-wrap" data-testid="push-tpl-detail-test-strip">
                <div className="flex items-center gap-1" role="radiogroup" aria-label={t("push_test_target_label")}>
                  {["me", "admins", "user"].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTestTarget(k)}
                      data-testid={`push-tpl-detail-target-${k}`}
                      aria-pressed={testTarget === k}
                      className="text-[10px] uppercase font-bold px-2 py-1 rounded-full"
                      style={{
                        background: testTarget === k ? "rgba(56,189,248,0.25)" : "rgba(20,12,10,0.6)",
                        border: `1px solid ${testTarget === k ? "#38BDF8" : "rgba(255,255,255,0.12)"}`,
                        color: testTarget === k ? "#38BDF8" : "#F5F0E8",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t(`push_test_target_${k}`)}
                    </button>
                  ))}
                </div>
                {testTarget === "user" && (
                  <div className="relative" ref={testUserRef} data-testid="push-tpl-detail-target-user-combo">
                    <button
                      type="button"
                      onClick={() => setTestUserOpen((v) => !v)}
                      data-testid="push-tpl-detail-target-user-toggle"
                      aria-expanded={testUserOpen}
                      className="text-[11px] rounded px-2 py-1 min-w-[160px] text-left truncate"
                      style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(56,189,248,0.35)", color: selectedMemberName ? "#F5F0E8" : "#8B7355" }}
                    >
                      {selectedMemberName || t("push_test_pick_user")}
                    </button>
                    {testUserOpen && (
                      <div
                        data-testid="push-tpl-detail-target-user-popup"
                        className="absolute z-30 mt-1 rounded-lg overflow-hidden"
                        style={{
                          minWidth: 240,
                          right: 0,
                          bottom: "100%",
                          marginBottom: 4,
                          background: "rgba(15,10,8,0.98)",
                          border: "1px solid rgba(56,189,248,0.4)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                        }}
                      >
                        <input
                          autoFocus
                          type="text"
                          value={testUserSearch}
                          onChange={(e) => { setTestUserSearch(e.target.value); setTestUserActive(0); }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") { e.preventDefault(); setTestUserActive((i) => Math.min(filteredMembers.length - 1, i + 1)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setTestUserActive((i) => Math.max(0, i - 1)); }
                            else if (e.key === "Enter") {
                              e.preventDefault();
                              const pick = filteredMembers[testUserActive];
                              if (pick) { setTestUserId(pick.id); setTestUserSearch(""); setTestUserOpen(false); }
                            } else if (e.key === "Home") { e.preventDefault(); setTestUserActive(0); }
                            else if (e.key === "End") { e.preventDefault(); setTestUserActive(filteredMembers.length - 1); }
                          }}
                          data-testid="push-tpl-detail-target-user-search"
                          placeholder={t("push_test_user_search_placeholder")}
                          className="w-full px-2 py-1.5 text-[11px] outline-none"
                          style={{ background: "rgba(20,12,10,0.9)", border: 0, borderBottom: "1px solid rgba(56,189,248,0.25)", color: "#F5F0E8" }}
                        />
                        <div className="max-h-[220px] overflow-y-auto">
                          {filteredMembers.length === 0 && (
                            <div className="px-2 py-2 text-[10px]" style={{ color: "#F5F0E8", opacity: 0.6 }}>
                              {t("push_test_user_no_match")}
                            </div>
                          )}
                          {filteredMembers.map((m, idx) => (
                            <button
                              key={m.id}
                              type="button"
                              onMouseEnter={() => setTestUserActive(idx)}
                              onClick={() => { setTestUserId(m.id); setTestUserSearch(""); setTestUserOpen(false); }}
                              data-testid={`push-tpl-detail-target-user-opt-${m.id}`}
                              aria-selected={testUserActive === idx}
                              className="w-full text-left text-[11px] px-2 py-1.5 hover:opacity-90"
                              style={{
                                background: testUserActive === idx ? "rgba(56,189,248,0.28)" : (testUserId === m.id ? "rgba(56,189,248,0.15)" : "transparent"),
                                color: testUserId === m.id ? "#38BDF8" : "#F5F0E8",
                                fontWeight: testUserId === m.id ? 700 : 400,
                                outline: testUserActive === idx ? "1px solid rgba(56,189,248,0.5)" : "none",
                              }}
                            >
                              {m.name}
                            </button>
                          ))}
                          {(memberList || []).length > filteredMembers.length && !testUserSearch && (
                            <div className="px-2 py-1.5 text-[9px]" style={{ color: "#F5F0E8", opacity: 0.4 }}>
                              {t("push_test_user_more_hint", { n: (memberList || []).length - filteredMembers.length })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={previewSound}
                  disabled={audioBusy}
                  data-testid="push-tpl-detail-sound-preview"
                  className="px-2.5 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1"
                  style={{
                    background: audioBusy ? "rgba(168,85,247,0.35)" : "rgba(168,85,247,0.15)",
                    border: `1px solid ${audioBusy ? "#A855F7" : "rgba(168,85,247,0.5)"}`,
                    color: "#A855F7",
                    letterSpacing: "0.06em",
                  }}
                  title={t("push_test_sound_title")}
                >
                  <Volume2 className="w-3 h-3" />
                  {audioBusy ? t("push_test_sound_playing") : t("push_test_sound_btn")}
                </button>
                <select
                  value={testSoundKey}
                  onChange={(e) => setTestSoundKey(e.target.value)}
                  data-testid="push-tpl-detail-sound-select"
                  className="text-[11px] rounded px-2 py-1.5"
                  style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(168,85,247,0.35)", color: "#F5F0E8" }}
                  title={t("push_test_sound_pick")}
                >
                  {["rally", "victory", "dungeon", "alarm"].map((k) => (
                    <option key={k} value={k}>{t(`push_test_sound_${k}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={testBusy}
                  data-testid="push-tpl-detail-test-send"
                  className="px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1"
                  style={{ background: "linear-gradient(135deg,#38BDF8,#0EA5E9)", color: "#0B0704", letterSpacing: "0.06em" }}
                >
                  <Send className="w-3 h-3" />
                  {testBusy ? t("push_tpl_installing") : t("push_test_send_btn")}
                </button>
                <button
                  type="button"
                  onClick={installOne}
                  disabled={busy}
                  data-testid="push-tpl-detail-install"
                  className="px-4 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1.5"
                  style={{ background: "linear-gradient(135deg,#F5A623,#E74C1A)", color: "#0B0704", letterSpacing: "0.06em" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {busy ? t("push_tpl_installing") : t("push_tpl_detail_install_btn")}
                </button>
              </div>
            </div>
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
