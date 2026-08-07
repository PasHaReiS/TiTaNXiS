import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { UserPlus, Zap, Flag, ClipboardEdit, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

const fmt = (n) => Number(n || 0).toLocaleString("tr-TR").replace(/,/g, ".");
const digitsOnly = (v) => String(v || "").replace(/[^0-9]/g, "");

/* ---------------------------------------------------------------
   MODAL WRAPPER
--------------------------------------------------------------- */
function BulkModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-2xl p-5 relative my-8"
        style={{ maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4" style={{ fontFamily: "Cinzel, Rajdhani, serif", letterSpacing: "0.08em" }}>
          {title}
        </h3>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   1) MEMBER ADD — pick alliance, view existing members, add new by name
--------------------------------------------------------------- */
function MemberAddPanel({ onClose }) {
  const { t } = useTranslation();
  const { data: alliances = [] } = useSWR("/alliances", fetcher);
  const { data: members = [] } = useSWR("/members", fetcher);
  const [alliance, setAlliance] = useState("");
  const [names, setNames] = useState("");
  const [saving, setSaving] = useState(false);

  const existingInAlliance = useMemo(
    () => members.filter((m) => (m.alliance_name || "") === alliance),
    [members, alliance]
  );
  const existingNameSet = new Set(members.map((m) => m.name.toLowerCase()));

  const parsedNewNames = useMemo(
    () => names.split(/\n|,/).map((s) => s.trim()).filter(Boolean),
    [names]
  );

  const addAll = async () => {
    if (!alliance) return toast.error("Önce ittifak seçin");
    const uniqueNew = parsedNewNames.filter((n) => !existingNameSet.has(n.toLowerCase()));
    if (uniqueNew.length === 0) return toast.error("Eklenecek yeni üye yok");
    setSaving(true);
    try {
      let added = 0;
      for (const name of uniqueNew) {
        await api.post("/members", { name, alliance_name: alliance });
        added += 1;
      }
      toast.success(`${added} üye eklendi`);
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      mutate("/alliances");
      mutate("/stats");
      setNames("");
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="bulk-member-add">
      <div>
        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">İttifak</label>
        <div className="flex gap-1.5 flex-wrap">
          {alliances.map((a) => (
            <button key={a} type="button" onClick={() => setAlliance(a)} className={`chip ${alliance === a ? "active" : ""}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {alliance && (
        <>
          <div className="text-[11px] text-muted-foreground">
            <span className="gold-text font-bold">{alliance}</span> ittifakında zaten <span className="gold-text">{existingInAlliance.length}</span> üye var
          </div>

          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">
              Yeni Üye İsimleri <span className="text-white/60 normal-case">(satır veya virgülle ayırın)</span>
            </label>
            <textarea
              rows={5}
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder={"Warlord\nHunter\nMage,Rogue"}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white resize-none"
              data-testid="bulk-add-names"
            />
            {parsedNewNames.length > 0 && (
              <div className="text-[11px] mt-1">
                Toplam: <span className="gold-text font-bold">{parsedNewNames.length}</span>
                {" • "}
                Zaten sistemde: <span className="text-red-400 font-bold">
                  {parsedNewNames.filter((n) => existingNameSet.has(n.toLowerCase())).length}
                </span>
              </div>
            )}
          </div>

          {existingInAlliance.length > 0 && (
            <div className="border border-border rounded-md p-2 max-h-40 overflow-y-auto">
              <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Mevcut Üyeler</div>
              <div className="flex flex-wrap gap-1">
                {existingInAlliance.map((m) => (
                  <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button data-testid="bulk-add-submit" onClick={addAll} disabled={saving || parsedNewNames.length === 0} className="btn-gold w-full">
            {saving ? "Ekleniyor..." : `Tümünü Ekle (${parsedNewNames.filter((n) => !existingNameSet.has(n.toLowerCase())).length})`}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   2) BIREYSEL GÜÇ BULK UPDATE — pick alliance, edit each power
--------------------------------------------------------------- */
function PowerBulkPanel({ onClose }) {
  const { data: alliances = [] } = useSWR("/alliances", fetcher);
  const { data: members = [] } = useSWR("/members", fetcher);
  const [alliance, setAlliance] = useState("");
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const inAlliance = useMemo(
    () => members.filter((m) => (m.alliance_name || "") === alliance).sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [members, alliance]
  );

  const displayValue = (m) => edits[m.id] !== undefined ? edits[m.id] : String(m.bireysel_guc || "");

  const saveAll = async () => {
    const dirty = Object.entries(edits).filter(([id, v]) => {
      const orig = members.find((m) => m.id === id);
      return orig && parseInt(v || "0", 10) !== (orig.bireysel_guc || 0);
    });
    if (dirty.length === 0) return toast.info("Değişiklik yok");
    setSaving(true);
    try {
      for (const [id, v] of dirty) {
        await api.patch(`/members/${id}`, { bireysel_guc: parseInt(v || "0", 10) });
      }
      toast.success(`${dirty.length} üye güç güncellendi`);
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      mutate("/stats");
      setEdits({});
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="bulk-power">
      <div>
        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">İttifak Seç</label>
        <div className="flex gap-1.5 flex-wrap">
          {alliances.map((a) => (
            <button key={a} type="button" onClick={() => { setAlliance(a); setEdits({}); }} className={`chip ${alliance === a ? "active" : ""}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {alliance && (
        <>
          <div className="border border-border rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_180px] text-[10px] uppercase font-bold text-muted-foreground bg-black/40 px-3 py-1.5">
              <span>Üye</span><span className="text-right">Bireysel Güç</span>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {inAlliance.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_180px] items-center px-3 py-1.5 gap-2">
                  <span className="text-xs text-white truncate flex items-center gap-1.5" title={m.name}>
                    <span className={`rank-badge rank-${m.rank}`} style={{ width: 18, height: 18, fontSize: 8, borderRadius: 4 }}>{m.rank}</span>
                    {m.name}
                  </span>
                  <input
                    data-testid={`bulk-power-input-${m.id}`}
                    type="text"
                    inputMode="numeric"
                    value={displayValue(m) ? displayValue(m).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
                    onChange={(e) => setEdits({ ...edits, [m.id]: digitsOnly(e.target.value) })}
                    placeholder="0"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white mono text-right"
                    style={{ color: "#FF6B00" }}
                  />
                </div>
              ))}
              {inAlliance.length === 0 && (
                <div className="text-xs text-muted-foreground p-3 text-center">Bu ittifakta üye yok</div>
              )}
            </div>
          </div>
          <button data-testid="bulk-power-save" onClick={saveAll} disabled={saving} className="btn-gold w-full">
            {saving ? "Kaydediliyor..." : "Tümünü Kaydet"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   3) EVENT ADD — quick create + list existing
--------------------------------------------------------------- */
function EventAddPanel({ onClose }) {
  const { data: events = [] } = useSWR("/events", fetcher);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("SvS vs 10007");
  const [mult, setMult] = useState("1.0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [subtitle, setSubtitle] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast.error("İsim gerekli");
    setSaving(true);
    try {
      await api.post("/events", {
        name: name.trim(),
        group_name: group.trim() || "SvS vs 10007",
        multiplier: parseFloat(mult) || 1.0,
        date: new Date(date).toISOString(),
        subtitle: subtitle.trim() || null,
      });
      toast.success("Etkinlik eklendi");
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate("/stats");
      setName(""); setSubtitle("");
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="bulk-event-add">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">İsim</label>
          <input data-testid="event-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pre 7.Gün"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Grup</label>
          <input value={group} onChange={(e) => setGroup(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Çarpan</label>
          <input value={mult} onChange={(e) => setMult(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />
        </div>
        <div>
          <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Tarih</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Alt Başlık</label>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
      </div>
      <button data-testid="event-create-btn" onClick={create} disabled={saving} className="btn-gold w-full">
        {saving ? "Ekleniyor..." : "Etkinlik Ekle"}
      </button>

      <div>
        <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Mevcut Etkinlikler ({events.length})</div>
        <div className="border border-border rounded-md max-h-52 overflow-y-auto divide-y divide-border">
          {events.map((e) => (
            <div key={e.id} className="px-3 py-1.5 text-xs flex items-center justify-between">
              <span className={e.archived ? "text-muted-foreground" : "text-white"}>{e.name}</span>
              <span className="gold-text mono text-[10px]">×{e.multiplier}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   4) EVENT POINTS BULK UPDATE — pick event, edit each member's points
--------------------------------------------------------------- */
function EventPointsPanel({ onClose }) {
  const { data: events = [] } = useSWR("/events", fetcher);
  const { data: members = [] } = useSWR("/members", fetcher);
  const [eventId, setEventId] = useState("");
  const { data: allPoints = [] } = useSWR(eventId ? "/points" : null, fetcher);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const pointsByMember = useMemo(() => {
    const map = {};
    for (const p of allPoints) {
      if (p.event_id === eventId) map[p.member_id] = p;
    }
    return map;
  }, [allPoints, eventId]);

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [members]
  );

  const displayValue = (mid) => {
    if (edits[mid] !== undefined) return edits[mid];
    const p = pointsByMember[mid];
    return p ? String(p.points || "") : "";
  };

  const saveAll = async () => {
    const dirty = Object.entries(edits);
    if (dirty.length === 0) return toast.info("Değişiklik yok");
    setSaving(true);
    try {
      let created = 0, updated = 0;
      for (const [mid, v] of dirty) {
        const newVal = parseInt(v || "0", 10);
        const existing = pointsByMember[mid];
        if (existing) {
          if (newVal !== (existing.points || 0)) {
            await api.patch(`/points/${existing.id}`, { points: newVal });
            updated += 1;
          }
        } else if (newVal > 0) {
          await api.post("/points", { member_id: mid, event_id: eventId, points: newVal });
          created += 1;
        }
      }
      toast.success(`${created} eklendi, ${updated} güncellendi`);
      mutate((k) => typeof k === "string" && k.startsWith("/points"));
      mutate("/stats");
      mutate((k) => typeof k === "string" && k.startsWith("/leaderboard"));
      setEdits({});
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="bulk-event-points">
      <div>
        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Etkinlik Seç</label>
        <select
          data-testid="event-points-select"
          value={eventId}
          onChange={(e) => { setEventId(e.target.value); setEdits({}); }}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        >
          <option value="">— Seçin —</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} (×{ev.multiplier}){ev.archived ? " [arşiv]" : ""}</option>
          ))}
        </select>
      </div>

      {eventId && (
        <>
          <div className="border border-border rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_180px] text-[10px] uppercase font-bold text-muted-foreground bg-black/40 px-3 py-1.5">
              <span>Üye</span><span className="text-right">Puan</span>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {sorted.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_180px] items-center px-3 py-1.5 gap-2">
                  <span className="text-xs text-white truncate flex items-center gap-1.5" title={m.name}>
                    <span className={`rank-badge rank-${m.rank}`} style={{ width: 18, height: 18, fontSize: 8, borderRadius: 4 }}>{m.rank}</span>
                    {m.name}
                    {m.alliance_name && <span className="text-[9px] text-white/50">— {m.alliance_name}</span>}
                  </span>
                  <input
                    data-testid={`bulk-points-input-${m.id}`}
                    type="text"
                    inputMode="numeric"
                    value={displayValue(m.id) ? displayValue(m.id).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
                    onChange={(e) => setEdits({ ...edits, [m.id]: digitsOnly(e.target.value) })}
                    placeholder="0"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-white mono text-right"
                  />
                </div>
              ))}
            </div>
          </div>
          <button data-testid="bulk-points-save" onClick={saveAll} disabled={saving} className="btn-gold w-full">
            {saving ? "Kaydediliyor..." : "Tümünü Kaydet"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN — 4 action buttons + modal orchestrator
--------------------------------------------------------------- */
const ACTIONS = [
  { key: "member", label: "Üye Ekle", Icon: UserPlus, testId: "bulk-btn-member" },
  { key: "power", label: "Bireysel Güçleri Güncelle", Icon: Zap, testId: "bulk-btn-power" },
  { key: "event", label: "Etkinlikleri Ekle", Icon: Flag, testId: "bulk-btn-event" },
  { key: "points", label: "Etkinlik Puanlarını Güncelle", Icon: ClipboardEdit, testId: "bulk-btn-points" },
];

async function exportAllXlsx() {
  try {
    const res = await api.get("/export/all", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    a.href = url;
    a.download = `gow-export-${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success("Export tamamlandı");
  } catch (err) {
    toast.error(apiErr(err));
  }
}

/* ---------------------------------------------------------------
   IMPORT — pick file, preview, choose duplicate mode, apply
--------------------------------------------------------------- */
function ImportPanel({ onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("skip");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const upload = async (dryRun) => {
    if (!file) return toast.error("Dosya seçin");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", dryRun ? "true" : "false");
      fd.append("duplicate_mode", mode);
      const res = await api.post("/import/bulk", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (dryRun) {
        setPreview(res.data);
      } else {
        setResult(res.data);
        mutate((k) => typeof k === "string" && (k.startsWith("/members") || k.startsWith("/events") || k.startsWith("/points") || k === "/stats" || k.startsWith("/leaderboard") || k === "/alliances"));
        toast.success("İçe aktarma tamamlandı");
      }
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); };

  return (
    <div className="space-y-3" data-testid="bulk-import-panel">
      {!result && (
        <>
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Dosya (.xlsx veya .csv)</label>
            <input
              data-testid="import-file-input"
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }}
              className="w-full text-xs text-white bg-background border border-border rounded-md p-2"
            />
            {file && (
              <div className="text-[11px] gold-text mt-1">
                📄 {file.name} — {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Duplicate Davranışı</label>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 text-xs text-white cursor-pointer">
                <input type="radio" name="dup" checked={mode === "skip"} onChange={() => setMode("skip")} data-testid="dup-mode-skip" />
                Atla
              </label>
              <label className="flex items-center gap-1.5 text-xs text-white cursor-pointer">
                <input type="radio" name="dup" checked={mode === "update"} onChange={() => setMode("update")} data-testid="dup-mode-update" />
                Güncelle
              </label>
            </div>
          </div>

          {!preview && (
            <button data-testid="import-preview-btn" onClick={() => upload(true)} disabled={busy || !file} className="btn-gold w-full">
              {busy ? "Analiz ediliyor..." : "Önizle"}
            </button>
          )}

          {preview && (
            <div className="border border-border rounded-md p-3 bg-black/40">
              <div className="text-sm gold-text font-bold mb-2">Önizleme</div>
              <ul className="text-xs text-white space-y-1">
                <li>👥 <span className="gold-text font-bold mono">{preview.members_found}</span> üye bulundu</li>
                <li>🏁 <span className="gold-text font-bold mono">{preview.events_found}</span> etkinlik bulundu</li>
                <li>⭐ <span className="gold-text font-bold mono">{preview.points_found}</span> puan kaydı bulundu</li>
              </ul>
              <div className="flex gap-2 mt-3">
                <button onClick={reset} disabled={busy} className="chip flex-1">İptal</button>
                <button data-testid="import-apply-btn" onClick={() => upload(false)} disabled={busy} className="btn-gold flex-1">
                  {busy ? "İçe Aktarılıyor..." : "İçe Aktar"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <div className="border border-border rounded-md p-3 bg-black/40" data-testid="import-result">
          <div className="text-sm gold-text font-bold mb-2">Sonuç</div>
          {["members", "events", "points"].map((k) => (
            <div key={k} className="text-xs text-white mb-1">
              <span className="uppercase gold-text mr-2">{k === "members" ? "Üyeler" : k === "events" ? "Etkinlikler" : "Puanlar"}:</span>
              <span className="text-green-400">+{result.result[k].added}</span> eklendi,
              <span className="text-blue-400 ml-1">↺{result.result[k].updated}</span> güncellendi,
              <span className="text-yellow-400 ml-1">⤼{result.result[k].skipped}</span> atlandı,
              <span className="text-red-400 ml-1">✗{result.result[k].errors}</span> hata
            </div>
          ))}
          <button onClick={reset} className="btn-gold w-full mt-3">Yeni Dosya İçe Aktar</button>
        </div>
      )}
    </div>
  );
}


export default function BulkAdminActions() {
  const [mode, setMode] = useState(null);

  const renderPanel = () => {
    if (mode === "member") return <MemberAddPanel onClose={() => setMode(null)} />;
    if (mode === "power") return <PowerBulkPanel onClose={() => setMode(null)} />;
    if (mode === "event") return <EventAddPanel onClose={() => setMode(null)} />;
    if (mode === "points") return <EventPointsPanel onClose={() => setMode(null)} />;
    if (mode === "import") return <ImportPanel onClose={() => setMode(null)} />;
    return null;
  };

  const titleOf = (m) => {
    if (m === "import") return "📥 Import Et";
    return ACTIONS.find((a) => a.key === m)?.label || "";
  };

  return (
    <>
      <div className="bulk-admin-grid" data-testid="bulk-admin-grid">
        {ACTIONS.map((a) => {
          const IconEl = a.Icon;
          return (
            <button
              key={a.key}
              data-testid={a.testId}
              type="button"
              onClick={() => setMode(a.key)}
              className="bulk-admin-btn"
            >
              <span className="bulk-admin-btn-icon"><IconEl className="w-4 h-4" /></span>
              <span className="bulk-admin-btn-label">{a.label}</span>
            </button>
          );
        })}
        <button
          data-testid="bulk-btn-export"
          type="button"
          onClick={exportAllXlsx}
          className="bulk-admin-btn"
        >
          <span className="bulk-admin-btn-icon"><Download className="w-4 h-4" /></span>
          <span className="bulk-admin-btn-label">📤 Export Et</span>
        </button>
        <button
          data-testid="bulk-btn-import"
          type="button"
          onClick={() => setMode("import")}
          className="bulk-admin-btn"
        >
          <span className="bulk-admin-btn-icon"><Upload className="w-4 h-4" /></span>
          <span className="bulk-admin-btn-label">📥 Import Et</span>
        </button>
      </div>
      {mode && (
        <BulkModal title={titleOf(mode)} onClose={() => setMode(null)}>
          {renderPanel()}
        </BulkModal>
      )}
    </>
  );
}
