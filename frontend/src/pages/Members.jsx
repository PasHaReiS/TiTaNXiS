import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { MEMBERS } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import CanEdit from "@/components/CanEdit";
import { allianceBadgeStyle } from "@/lib/colors";
import { Search, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const RANK_LABELS = {
  GOW: "GOW",
  R5: "R5",
  R4: "R4",
  R3: "R3",
  R2: "R2",
  R1: "R1",
};

export default function Members() {
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const { data: members = [] } = useSWR(`/members${q ? `?search=${encodeURIComponent(q)}` : ""}`, fetcher, {
    refreshInterval: 8000,
  });

  const grouped = useMemo(() => {
    const rankOrder = { R5: 5, R4: 4, R3: 3, R2: 2, R1: 1 };
    const groups = {};
    members.forEach((m) => {
      const raw = (m.alliance_name || "").trim();
      let key;
      if (raw.toLowerCase() === "gow") key = "GOW";
      else if (!raw) key = "Gruplandırılmamış";
      else key = raw;
      (groups[key] = groups[key] || []).push(m);
    });
    // Within each group: rank desc, then name alpha
    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => (rankOrder[b.rank] || 0) - (rankOrder[a.rank] || 0) || a.name.localeCompare(b.name, "tr"))
    );
    // Group order: GOW → alpha (tr) → Gruplandırılmamış
    const orderKey = (name) => {
      if (name === "GOW") return [0, ""];
      if (name === "Gruplandırılmamış") return [2, ""];
      return [1, name.toLowerCase()];
    };
    return Object.keys(groups)
      .sort((a, b) => {
        const [ka, sa] = orderKey(a);
        const [kb, sb] = orderKey(b);
        return ka - kb || sa.localeCompare(sb, "tr");
      })
      .map((name) => ({ name, members: groups[name] }));
  }, [members]);

  const totalCount = members.length;

  return (
    <div data-testid={MEMBERS.container}>
      <Header subtitle="Üye Yönetimi" />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold uppercase red-text tracking-wider">Üyeler</h2>
            <p className="text-xs text-muted-foreground">Toplam <span className="gold-text font-bold mono">{totalCount}</span> üye</p>
          </div>
          <CanEdit>
            <button
              data-testid={MEMBERS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> Yeni
            </button>
          </CanEdit>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid={MEMBERS.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İsim veya ID ara..."
            className="w-full card-dark pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {grouped.map((grp, gi) => (
          <React.Fragment key={grp.name}>
            {gi > 0 && <div className="divider-glow my-4" />}
            <div className="mb-4 fade-in">
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-lg mb-2"
                style={{ ...allianceBadgeStyle(grp.name), color: "#fff", border: "1px solid" }}
              >
                <span className="font-bold uppercase tracking-wider text-sm truncate">{grp.name}</span>
                <span className="text-[11px] font-bold mono opacity-90">{grp.members.length} üye</span>
              </div>
              <div className="space-y-1.5">
                {grp.members.map((m) => (
                  <div
                    key={m.id}
                    data-testid={MEMBERS.card(m.id)}
                    className="card-dark p-3 flex items-center gap-3 row-hover"
                  >
                    <button
                      onClick={() => setProfileId(m.id)}
                      className="rank-badge"
                      style={{
                        ...allianceBadgeStyle(m.alliance_name),
                        width: 60,
                        height: 44,
                        borderRadius: 22,
                        fontSize: 10,
                        padding: "0 8px",
                        lineHeight: 1.1,
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}
                      title={m.alliance_name || "İttifak yok"}
                    >
                      <span className="truncate w-full text-center">{m.alliance_name || "-"}</span>
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setProfileId(m.id)}>
                      <div className="font-bold text-white truncate">
                        {m.name} <span className="text-[10px] gold-text font-bold ml-1">{m.rank}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mono">
                        {m.member_id ? `ID: ${m.member_id}` : "—"}
                        {m.castle_level && <span className="ml-2 gold-text">Kale F{m.castle_level}</span>}
                      </div>
                      {m.title && <div className="text-[10px] gold-text font-semibold uppercase mt-0.5">{m.title}</div>}
                    </div>
                    <CanEdit>
                      <button
                        data-testid={MEMBERS.editBtn(m.id)}
                        onClick={() => { setEditing(m); setShowForm(true); }}
                        className="w-8 h-8 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                        aria-label="Düzenle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        data-testid={MEMBERS.deleteBtn(m.id)}
                        onClick={async () => {
                          if (!window.confirm(`${m.name} silinsin mi?`)) return;
                          await api.delete(`/members/${m.id}`);
                          mutate((k) => typeof k === "string" && k.startsWith("/members"));
                          mutate("/stats");
                          toast.success("Üye silindi");
                        }}
                        className="w-8 h-8 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                        aria-label="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </CanEdit>
                  </div>
                ))}
              </div>
            </div>
          </React.Fragment>
        ))}

        {totalCount === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">Kayıt bulunamadı.</div>
        )}
      </div>

      {showForm && (
        <MemberForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

function MemberForm({ initial, onClose }) {
  const [allianceName, setAllianceName] = useState(initial?.alliance_name || "");
  const [name, setName] = useState(initial?.name || "");
  const [memberId, setMemberId] = useState(initial?.member_id || "");
  const [castleLevel, setCastleLevel] = useState(initial?.castle_level || "");
  const [tetikciF, setTetikciF] = useState(initial?.tetikci_f || "");
  const [tetikciT, setTetikciT] = useState(initial?.tetikci_t || "");
  const [bombaciF, setBombaciF] = useState(initial?.bombaci_f || "");
  const [bombaciT, setBombaciT] = useState(initial?.bombaci_t || "");
  const [kalkanliF, setKalkanliF] = useState(initial?.kalkanli_f || "");
  const [kalkanliT, setKalkanliT] = useState(initial?.kalkanli_t || "");
  const [rank, setRank] = useState(initial?.rank && RANKS.includes(initial.rank) ? initial.rank : "R1");
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);
  const { data: alliances = [] } = useSWR("/alliances", fetcher);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Oyuncu ismi gerekli"); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        member_id: memberId.trim() || null,
        alliance_name: allianceName.trim() || null,
        rank,
        castle_level: castleLevel.trim() || null,
        tetikci_f: tetikciF.trim() || null,
        tetikci_t: tetikciT.trim() || null,
        bombaci_f: bombaciF.trim() || null,
        bombaci_t: bombaciT.trim() || null,
        kalkanli_f: kalkanliF.trim() || null,
        kalkanli_t: kalkanliT.trim() || null,
        note: note.trim() || null,
      };
      if (initial) {
        await api.patch(`/members/${initial.id}`, body);
        toast.success("Üye güncellendi");
      } else {
        await api.post("/members", body);
        toast.success("Üye eklendi");
      }
      mutate((k) => typeof k === "string" && (k.startsWith("/members") || k.startsWith("/alliances")));
      mutate("/stats");
      onClose();
    } catch (err) {
      toast.error("Hata: " + (err?.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const numInput = "w-16 bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white mono text-center focus:outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        data-testid={MEMBERS.form}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative max-h-[90vh] overflow-y-auto"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? "Üyeyi Düzenle" : "Yeni Üye"}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">İttifak Adı</label>
        {alliances.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2">
            {alliances.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAllianceName(a)}
                className={`chip ${allianceName === a ? "active" : ""}`}
                data-testid={`alliance-chip-${a}`}
              >{a}</button>
            ))}
          </div>
        )}
        <input
          data-testid="member-form-alliance"
          value={allianceName}
          onChange={(e) => setAllianceName(e.target.value)}
          list="alliance-list"
          placeholder="Örn: GOW"
          autoComplete="off"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />
        <datalist id="alliance-list">
          {alliances.map((a) => (<option key={a} value={a} />))}
        </datalist>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Oyuncu İsmi</label>
        <input data-testid={MEMBERS.formName} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Warlord42"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">ID (opsiyonel)</label>
        <input data-testid={MEMBERS.formId} value={memberId} onChange={(e) => setMemberId(e.target.value)}
          placeholder="Oyun ID"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs uppercase text-muted-foreground font-bold flex-1">Kale Seviyesi</label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold gold-text w-4 text-center">F</span>
            <input data-testid="member-form-castle-f" value={castleLevel} onChange={(e) => setCastleLevel(e.target.value)}
              placeholder="35" className={numInput} />
          </div>
        </div>

        <div className="section-title mt-4">Askeri Kışla Seviyeleri</div>
        {[
          { label: "Tetikçi", f: tetikciF, setF: setTetikciF, t: tetikciT, setT: setTetikciT, tid: "tetikci" },
          { label: "Bombacı", f: bombaciF, setF: setBombaciF, t: bombaciT, setT: setBombaciT, tid: "bombaci" },
          { label: "Kalkanlı", f: kalkanliF, setF: setKalkanliF, t: kalkanliT, setT: setKalkanliT, tid: "kalkanli" },
        ].map((b) => (
          <div key={b.tid} className="flex items-center gap-2 mt-2">
            <label className="text-xs uppercase text-white font-bold flex-1">{b.label}</label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold gold-text w-4 text-center">F</span>
              <input data-testid={`member-form-${b.tid}-f`} value={b.f} onChange={(e) => b.setF(e.target.value)} placeholder="0" className={numInput} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold red-text w-4 text-center">T</span>
              <input data-testid={`member-form-${b.tid}-t`} value={b.t} onChange={(e) => b.setT(e.target.value)} placeholder="0" className={numInput} />
            </div>
          </div>
        ))}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-4">Rütbe</label>
        <div data-testid={MEMBERS.formRank} className="flex gap-1.5 flex-wrap">
          {RANKS.map((r) => (
            <button key={r} type="button" onClick={() => setRank(r)} className={`chip ${rank === r ? "active" : ""}`}>{r}</button>
          ))}
        </div>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Not (opsiyonel)</label>
        <textarea data-testid="member-form-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white resize-none" />

        <button data-testid={MEMBERS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : "KAYDET"}
        </button>
      </form>
    </div>
  );
}
