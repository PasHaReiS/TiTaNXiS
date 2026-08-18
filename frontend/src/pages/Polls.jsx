import React, { useState } from "react";
import useSWR from "swr";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Loader2, Plus, X, CheckCircle2, Circle, Vote, Clock, ShieldOff, Trash2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Polls / Anket-Oylama sayfası (Faz 4).
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │  [+ Yeni Anket] (admin only)           │
 *   ├────────────────────────────────────────┤
 *   │  Aktif Anketler                        │
 *   │   • Poll card w/ inline vote buttons   │
 *   │   • Real-time bar tallies              │
 *   │  Kapalı Anketler                        │
 *   └────────────────────────────────────────┘
 */
export default function Polls() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [showCompose, setShowCompose] = useState(false);
  const { data, mutate, isLoading } = useSWR("/polls", fetcher, { refreshInterval: 30000 });
  const items = data?.items || [];
  const active = items.filter((p) => !p.closed);
  const closed = items.filter((p) => p.closed);

  return (
    <div data-testid="polls-page">
      <Header title="Anketler" />
      <div className="px-4 space-y-3">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCompose((v) => !v)}
            className="btn-gold w-full flex items-center justify-center gap-2 text-sm py-2"
            data-testid="polls-compose-toggle"
          >
            {showCompose ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCompose ? "İptal" : "Yeni Anket Oluştur"}
          </button>
        )}
        {showCompose && isAdmin && (
          <PollComposer
            onCreated={() => { setShowCompose(false); mutate(); }}
          />
        )}

        {isLoading && (
          <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
               data-testid="polls-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("poll_loading")}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
               data-testid="polls-empty">
            Henüz anket yok. {isAdmin ? "Yeni anket oluşturun." : "Yönetici yeni bir anket açtığında burada görünecek."}
          </div>
        )}
        {active.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
              Aktif Anketler ({active.length})
            </div>
            {active.map((p) => (
              <PollCard key={p.id} poll={p} onChanged={() => mutate()} isAdmin={isAdmin} />
            ))}
          </div>
        )}
        {closed.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground">
              Kapalı Anketler ({closed.length})
            </div>
            {closed.map((p) => (
              <PollCard key={p.id} poll={p} onChanged={() => mutate()} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PollComposer({ onCreated }) {
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [saving, setSaving] = useState(false);
  const addOpt = () => setOpts((o) => [...o, ""]);
  const removeOpt = (i) => setOpts((o) => o.filter((_, idx) => idx !== i));
  const submit = async (e) => {
    e.preventDefault();
    if (!question.trim()) { toast.error("Soru zorunlu"); return; }
    const cleaned = opts.map((t) => (t || "").trim()).filter(Boolean);
    if (cleaned.length < 2) { toast.error("En az 2 seçenek gerekli"); return; }
    let closesIso = null;
    if (closesAt) {
      const d = new Date(closesAt);
      if (isNaN(d.getTime())) { toast.error("Geçersiz kapanış zamanı"); return; }
      if (d.getTime() <= Date.now()) { toast.error("Kapanış zamanı gelecekte olmalı"); return; }
      closesIso = d.toISOString();
    }
    setSaving(true);
    try {
      await api.post("/polls", {
        question: question.trim(),
        options: cleaned.map((t) => ({ text: t })),
        multi_choice: multi,
        closes_at: closesIso || undefined,
      });
      toast.success("Anket oluşturuldu");
      onCreated?.();
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="card-red-gold p-3 space-y-2" data-testid="polls-composer">
      <input
        type="text" required
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Soru — Örn: Bu haftaki SvS'de hangi hedefe odaklanalım?"
        className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-sm"
        data-testid="polls-composer-question"
      />
      <div className="space-y-1.5">
        {opts.map((v, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold gold-text w-5 text-center">{i + 1}.</span>
            <input
              type="text"
              value={v}
              onChange={(e) => setOpts((o) => o.map((x, idx) => idx === i ? e.target.value : x))}
              placeholder={`Seçenek ${i + 1}`}
              className="flex-1 px-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
              data-testid={`polls-composer-opt-${i}`}
            />
            {opts.length > 2 && (
              <button type="button" onClick={() => removeOpt(i)}
                      className="text-red-400 hover:text-red-300"
                      data-testid={`polls-composer-remove-${i}`}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addOpt}
                className="chip text-[10px]"
                data-testid="polls-composer-add-opt">
          <Plus className="w-3 h-3" /> Seçenek Ekle
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-[11px] text-white">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)}
                 data-testid="polls-composer-multi" />
          Birden fazla seçim
        </label>
        <div className="flex items-center gap-1.5 text-[11px]">
          <Clock className="w-3 h-3 gold-text" />
          <span className="text-muted-foreground">Kapanış:</span>
          <input type="datetime-local" value={closesAt}
                 onChange={(e) => setClosesAt(e.target.value)}
                 className="px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
                 data-testid="polls-composer-closes-at" />
          {closesAt && (
            <button type="button" onClick={() => setClosesAt("")}
                    className="text-[10px] text-red-300 hover:text-red-200">Temizle</button>
          )}
        </div>
      </div>
      <button type="submit" disabled={saving}
              className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
              data-testid="polls-composer-submit">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Vote className="w-4 h-4" />}
        {saving ? "Kaydediliyor…" : "Anketi Yayınla"}
      </button>
    </form>
  );
}

function PollCard({ poll, onChanged, isAdmin }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(poll.my_option_ids || []);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { data: results } = useSWR(
    showDetails ? `/polls/${poll.id}/results` : null,
    fetcher,
    { refreshInterval: 20000 },
  );
  const closed = poll.closed;
  const hasVoted = poll.has_voted;
  const canChange = !closed;

  const toggleOption = (oid) => {
    if (!canChange) return;
    if (poll.multi_choice) {
      setSelected((s) => s.includes(oid) ? s.filter((x) => x !== oid) : [...s, oid]);
    } else {
      setSelected([oid]);
    }
  };
  const submit = async () => {
    if (!selected.length) { toast.error("En az bir seçenek seç"); return; }
    setBusy(true);
    try {
      await api.post(`/polls/${poll.id}/vote`, { option_ids: selected });
      toast.success(hasVoted ? "Oy güncellendi" : "Oyun kaydedildi");
      onChanged?.();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  const unvote = async () => {
    if (!window.confirm("Oyunu geri çekmek istediğine emin misin?")) return;
    setBusy(true);
    try {
      await api.delete(`/polls/${poll.id}/vote`);
      toast.success("Oy geri çekildi");
      setSelected([]);
      onChanged?.();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  const closePoll = async () => {
    if (!window.confirm("Anketi kapatmak istediğine emin misin?")) return;
    try { await api.patch(`/polls/${poll.id}/close`); toast.success("Kapatıldı"); onChanged?.(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const reopenPoll = async () => {
    try { await api.patch(`/polls/${poll.id}/reopen`); toast.success("Yeniden açıldı"); onChanged?.(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const deletePoll = async () => {
    if (!window.confirm("Anket ve tüm oylar silinecek. Devam?")) return;
    try { await api.delete(`/polls/${poll.id}`); toast.success("Silindi"); onChanged?.(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="card-red-gold p-3 space-y-2"
         style={{ opacity: closed ? 0.75 : 1 }}
         data-testid={`poll-card-${poll.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white">{poll.question}</h3>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span>{poll.created_by_username || "sistem"}</span>
            <span>·</span>
            <span>{new Date(poll.created_at).toLocaleString("tr-TR")}</span>
            {poll.tg_broadcast && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5"
                    style={{ background: "rgba(52,152,219,0.2)", color: "#93C5FD" }}
                    title={`Telegram grubunda ${poll.tg_voters || 0} oy`}
                    data-testid={`poll-tg-badge-${poll.id}`}>
                📡 TG · {poll.tg_voters || 0}
              </span>
            )}
            {poll.multi_choice && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}>
                ÇOKLU SEÇİM
              </span>
            )}
            {poll.closes_at && !closed && (
              <span className="px-1 py-0.5 rounded text-[9px] flex items-center gap-0.5"
                    style={{ background: "rgba(245,166,35,0.2)", color: "#F5A623" }}>
                <Clock className="w-2.5 h-2.5" /> {new Date(poll.closes_at).toLocaleString("tr-TR")}
              </span>
            )}
            {closed && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#FCA5A5" }}
                    data-testid={`poll-closed-${poll.id}`}>
                KAPALI
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {closed ? (
              <button onClick={reopenPoll} title="Yeniden aç"
                      className="p-1 rounded hover:bg-amber-500/20 gold-text"
                      data-testid={`poll-reopen-${poll.id}`}>
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={closePoll} title="Kapat"
                      className="p-1 rounded hover:bg-red-500/20 text-red-300"
                      data-testid={`poll-close-${poll.id}`}>
                <ShieldOff className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={deletePoll} title="Sil"
                    className="p-1 rounded hover:bg-red-500/20 text-red-400"
                    data-testid={`poll-delete-${poll.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const isSel = selected.includes(o.id);
          const isMine = (poll.my_option_ids || []).includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggleOption(o.id)}
              disabled={closed}
              className="w-full text-left rounded relative overflow-hidden"
              style={{
                background: isSel
                  ? "linear-gradient(90deg, rgba(245,166,35,0.25), rgba(180,83,9,0.35))"
                  : "rgba(20,15,25,0.75)",
                border: `1px solid ${isSel ? "#F5A623" : "rgba(120,53,15,0.35)"}`,
                cursor: closed ? "default" : "pointer",
              }}
              data-testid={`poll-option-${poll.id}-${o.id}`}
            >
              {/* result bar */}
              <div
                style={{
                  position: "absolute", top: 0, left: 0, bottom: 0,
                  width: `${o.pct}%`,
                  background: isMine ? "rgba(34,197,94,0.20)" : "rgba(245,166,35,0.12)",
                  transition: "width 0.4s ease",
                }}
                aria-hidden
              />
              <div className="relative flex items-center gap-2 px-2 py-1.5">
                {isSel ? <CheckCircle2 className="w-3.5 h-3.5 gold-text flex-shrink-0" />
                       : <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                <span className="text-xs text-white flex-1">{o.text}</span>
                <span className="text-[11px] font-bold gold-text flex-shrink-0">
                  {o.pct}% · {o.votes}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-[10px] text-muted-foreground">
          {poll.total_voters} oy · {hasVoted ? "✓ oyladın" : "henüz oylamadın"}
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="chip text-[10px] flex items-center gap-1"
          style={{
            borderColor: "rgba(52,152,219,0.55)",
            color: "#93C5FD",
            background: showDetails ? "rgba(52,152,219,0.20)" : "rgba(52,152,219,0.08)",
          }}
          data-testid={`poll-tg-details-toggle-${poll.id}`}
          title={showDetails ? t("poll_tg_details_hide") : t("poll_tg_details_show")}
        >
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {t("poll_tg_details_toggle")}{typeof poll.tg_voters === "number" ? ` · ${poll.tg_voters}` : ""}
        </button>
        <div className="flex items-center gap-1.5 ml-auto">
          {hasVoted && canChange && (
            <button onClick={unvote} disabled={busy}
                    className="chip text-[10px]"
                    style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
                    data-testid={`poll-unvote-${poll.id}`}>
              Oyu Geri Çek
            </button>
          )}
          {canChange && (
            <button onClick={submit} disabled={busy || selected.length === 0}
                    className="chip text-[10px]"
                    style={{ borderColor: "#F5A623", color: "#FFEDD5", background: "rgba(245,166,35,0.15)" }}
                    data-testid={`poll-submit-${poll.id}`}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Vote className="w-3 h-3" />}
              {hasVoted ? "Güncelle" : "Oyla"}
            </button>
          )}
        </div>
      </div>
      {showDetails && (
        <div
          className="mt-2 rounded-lg p-2 space-y-2"
          style={{ background: "rgba(52,152,219,0.06)", border: "1px dashed rgba(52,152,219,0.35)" }}
          data-testid={`poll-tg-details-panel-${poll.id}`}
        >
          {!results ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> {t("poll_loading")}
            </div>
          ) : (
            <>
              <div className="flex items-center flex-wrap gap-2 text-[10px]">
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(59,130,246,0.15)", color: "#93C5FD" }}
                  data-testid={`poll-tg-summary-${poll.id}`}
                >
                  {t("poll_tg_summary_tg", { n: results.tg_voters || 0 })}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(245,166,35,0.15)", color: "#F5A623" }}
                >
                  {t("poll_tg_summary_app", { n: results.app_voters || 0 })}
                </span>
                <span className="text-muted-foreground">
                  {t("poll_tg_summary_total", { n: results.total_voters || 0 })}
                </span>
              </div>
              <div className="space-y-1">
                {(results.options || []).map((o) => (
                  <div
                    key={o.id}
                    className="text-[11px] flex items-center gap-2 px-2 py-1 rounded"
                    style={{ background: "rgba(20,15,25,0.55)", border: "1px solid rgba(120,53,15,0.25)" }}
                    data-testid={`poll-tg-details-option-${poll.id}-${o.id}`}
                  >
                    <span className="flex-1 truncate text-white" title={o.text}>{o.text}</span>
                    <span className="mono opacity-75" title="Uygulama oyu">📱 {o.app_votes}</span>
                    <span className="mono" style={{ color: "#93C5FD" }} title="Telegram oyu">📡 {o.tg_votes}</span>
                    <span className="mono font-bold gold-text">= {o.total}</span>
                  </div>
                ))}
              </div>
              {(results.tg_voter_details || []).length > 0 && isAdmin && (
                <button
                  type="button"
                  data-testid={`poll-tg-csv-${poll.id}`}
                  onClick={() => {
                    const lines = [["username", "options", "voted_at"]];
                    (results.tg_voter_details || []).forEach((v) => {
                      lines.push([
                        (v.username || "anon"),
                        (v.options || []).join(" | "),
                        v.voted_at || "",
                      ]);
                    });
                    const csv = lines.map((r) => r.map((c) => {
                      const s = String(c || "");
                      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                    }).join(",")).join("\n");
                    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `poll-${poll.id.slice(0, 8)}-tg-voters.csv`;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                    toast.success(`${(results.tg_voter_details || []).length} TG oy dökümü indirildi`);
                  }}
                  className="chip text-[10px] flex items-center gap-1 self-start"
                  style={{ borderColor: "rgba(34,197,94,0.55)", color: "#86EFAC", background: "rgba(34,197,94,0.10)" }}
                  title="TG oy verenleri CSV olarak indir"
                >
                  📥 TG Oy Dökümü İndir ({(results.tg_voter_details || []).length})
                </button>
              )}
              {isAdmin ? (
                (results.tg_voter_details || []).length === 0 ? (
                  <div className="text-[10px] text-muted-foreground italic">
                    {t("poll_tg_no_votes")}
                  </div>
                ) : (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest gold-text font-bold mb-1">
                      {t("poll_tg_voters_header")}
                    </div>
                    <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                      {(results.tg_voter_details || []).map((v, i) => (
                        <div
                          key={`${v.username || "anon"}-${i}`}
                          className="flex items-center gap-2 text-[11px] px-2 py-1 rounded"
                          style={{ background: "rgba(52,152,219,0.08)", border: "1px solid rgba(52,152,219,0.30)" }}
                          data-testid={`poll-tg-voter-${poll.id}-${i}`}
                        >
                          <span className="font-bold text-white truncate" style={{ minWidth: 90 }}>
                            @{v.username || "anon"}
                          </span>
                          <span className="flex-1 truncate opacity-90" title={(v.options || []).join(", ")}>
                            → {(v.options || []).join(", ") || "—"}
                          </span>
                          {v.voted_at && (
                            <span className="text-[9px] mono opacity-60">
                              {new Date(v.voted_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="text-[10px] text-muted-foreground italic">
                  {t("poll_tg_admin_only_note")}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
