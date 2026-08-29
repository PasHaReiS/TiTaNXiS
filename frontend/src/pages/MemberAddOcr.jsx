import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Upload, Loader2, Check, ChevronRight, X, Camera, ScanSearch } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const RANKS = ["R1", "R2", "R3", "R4", "R5"];
// v135.41 — OCR ile üye ekleme sayfası. TEK amaç:
//   1) Görsel yükle → /ocr/parse?mode=members ile 3 alan (alliance, name, rank) çıkart
//   2) Sistemdeki üyelerle karşılaştır → 'Kayıtlı' rozet, olmayanlar vurgulanır
//   3) Olmayanlar için ittifak+rütbe düzenlenip 'Kaydet' ile POST /members
// Başka özellik yok — güç/kale/OCR history kasten devre dışı.
const stripTag = (n) => {
  const m = /^\s*\[[^\]]+\]\s*(.+)$/.exec(String(n || ""));
  return (m ? m[1] : String(n || "")).trim();
};

export default function MemberAddOcr() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState([]); // {name, alliance_name, rank, existing_id, existing_alliance, save?}
  const [savingIds, setSavingIds] = useState(() => new Set());

  const { data: membersData, mutate: mutateMembers } = useSWR("/members", fetcher);
  const { data: alliancesData } = useSWR("/alliances", fetcher);
  const alliances = useMemo(() => {
    const names = Array.isArray(alliancesData?.items)
      ? alliancesData.items.map((x) => x.name).filter(Boolean)
      : (Array.isArray(alliancesData) ? alliancesData.map((x) => x.name).filter(Boolean) : []);
    // GOW/GoW/GOw korunur (case-sensitive)
    return Array.from(new Set(names));
  }, [alliancesData]);
  const existingByName = useMemo(() => {
    const map = new Map();
    const list = Array.isArray(membersData) ? membersData : (membersData?.items || []);
    for (const m of list) map.set(stripTag(m.name).toLowerCase(), m);
    return map;
  }, [membersData]);

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setRows([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/ocr/parse?mode=members", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const items = res.data?.data?.members || res.data?.members || [];
      const enriched = items.map((it) => {
        const clean = stripTag(it.name || "");
        const hit = existingByName.get(clean.toLowerCase());
        return {
          name: clean,
          alliance_name: it.alliance_name || (hit ? hit.alliance_name : "") || "",
          rank: hit ? hit.rank : (RANKS.includes(it.rank) ? it.rank : "R1"),
          existing_id: hit?.id || null,
          existing_name: hit?.name || null,
          existing_alliance: hit?.alliance_name || null,
        };
      }).filter((r) => r.name);
      setRows(enriched);
      toast.success(t("moa_scan_ok",
        "OCR tamam: {{total}} satır ({{matched}} eşleşti, {{missing}} eşleşmedi)",
        {
          total: enriched.length,
          matched: enriched.filter((r) => r.existing_id).length,
          missing: enriched.filter((r) => !r.existing_id).length,
        }));
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setUploading(false); }
  };

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const saveRow = async (idx) => {
    const r = rows[idx];
    if (!r || r.existing_id) return;
    if (!r.name.trim()) { toast.error(t("moa_name_required", "İsim boş")); return; }
    const alliance = (r.alliance_name || "").trim();
    if (!alliance) { toast.error(t("moa_alliance_required", "İttifak seç")); return; }
    setSavingIds((s) => new Set(s).add(idx));
    try {
      await api.post("/members", {
        name: r.name.trim(),
        alliance_name: alliance,
        rank: RANKS.includes(r.rank) ? r.rank : "R1",
      });
      toast.success(t("moa_saved_toast", "{{n}} eklendi", { n: r.name }));
      // Refresh members + mark row as existing to hide the form
      const fresh = await api.get("/members");
      const list = Array.isArray(fresh.data) ? fresh.data : (fresh.data?.items || []);
      const created = list.find((m) => stripTag(m.name).toLowerCase() === stripTag(r.name).toLowerCase());
      updateRow(idx, { existing_id: created?.id || "new", existing_alliance: alliance });
      mutateMembers();
    } catch (e) { toast.error(apiErr(e)); }
    finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(idx); return n; });
    }
  };

  const missing = rows.filter((r) => !r.existing_id);
  const registered = rows.filter((r) => r.existing_id);

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">
          {t("moa_access_denied", "Bu sayfa yalnızca yöneticilere açıktır.")}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="member-add-ocr-page">
      <Header title={t("moa_page_title", "Üye Ekle — OCR")} />
      <div className="max-w-4xl mx-auto py-4 px-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <ScanSearch className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">
            {t("moa_page_title", "Üye Ekle — OCR")}
          </h1>
        </div>

        {/* 1) Görsel yükleme alanı */}
        <label
          className="block card-red-gold p-6 rounded cursor-pointer transition-all hover:border-amber-400"
          data-testid="moa-upload-dropzone"
          style={{ borderStyle: "dashed" }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="moa-file-input"
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-2 text-center">
            {uploading
              ? <Loader2 className="w-10 h-10 gold-text animate-spin" />
              : <Upload className="w-10 h-10 gold-text" />}
            <div className="text-sm font-bold text-white">
              {uploading
                ? t("moa_uploading", "Görsel taranıyor…")
                : t("moa_upload_cta", "Oyun ekran görüntüsü yükle")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("moa_upload_hint", "PNG · JPEG · WEBP (maks. 8 MB) — sadece İttifak, İsim ve Rütbe okunur.")}
            </div>
          </div>
        </label>

        {rows.length > 0 && (
          <>
            {/* Özet çubuğu */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="chip text-[11px]" data-testid="moa-summary-total">
                <Camera className="w-3 h-3" /> {t("moa_summary_total", "Toplam")}: {rows.length}
              </span>
              <span className="chip text-[11px]" style={{ borderColor: "#22C55E", color: "#86EFAC" }}
                    data-testid="moa-summary-registered">
                <Check className="w-3 h-3" /> ✅ {t("moa_summary_matched", "Eşleşti")}: {registered.length}
              </span>
              <span className="chip text-[11px]" style={{ borderColor: "#F5A623", color: "#F5A623" }}
                    data-testid="moa-summary-missing">
                ⚠️ {t("moa_summary_unmatched", "Eşleşmedi")}: {missing.length}
              </span>
            </div>

            {/* Eşleşmeyen üyeler önce (vurgulanır) */}
            {missing.length > 0 && (
              <div className="space-y-2" data-testid="moa-missing-section">
                <div className="text-[11px] uppercase font-bold tracking-widest" style={{ color: "#F5A623" }}>
                  ⚠️ {t("moa_missing_title", "Eşleşmeyen Üyeler — Otomatik Yeni Kayıt Oluşturulabilir")}
                </div>
                {rows.map((r, idx) => {
                  if (r.existing_id) return null;
                  const busy = savingIds.has(idx);
                  return (
                    <div key={idx}
                         className="card-red-gold p-3 space-y-2"
                         style={{
                           borderColor: "#F5A623",
                           boxShadow: "0 0 12px rgba(245,166,35,0.30)",
                           background: "rgba(245,166,35,0.06)",
                         }}
                         data-testid={`moa-missing-row-${idx}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white flex-1 min-w-0 truncate"
                              data-testid={`moa-missing-name-${idx}`}>
                          ⚠️ {t("moa_unmatched_prefix", "Eşleşmedi")}: {r.name}
                        </span>
                        <span className="chip text-[10px]" style={{ borderColor: "#F5A623", color: "#F5A623" }}>
                          {t("moa_missing_badge", "YENİ KAYIT")}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
                            {t("moa_field_alliance", "İttifak Adı")}
                          </div>
                          <input
                            list={`moa-alliances-${idx}`}
                            value={r.alliance_name}
                            onChange={(e) => updateRow(idx, { alliance_name: e.target.value })}
                            data-testid={`moa-missing-alliance-${idx}`}
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
                            placeholder={t("moa_alliance_ph", "Örn: GOW")}
                          />
                          <datalist id={`moa-alliances-${idx}`}>
                            {alliances.map((a) => <option key={a} value={a} />)}
                          </datalist>
                        </label>
                        <label className="block">
                          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
                            {t("moa_field_rank", "Rütbe")}
                          </div>
                          <select
                            value={r.rank}
                            onChange={(e) => updateRow(idx, { rank: e.target.value })}
                            data-testid={`moa-missing-rank-${idx}`}
                            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
                          >
                            {RANKS.map((rk) => <option key={rk} value={rk}>{rk}</option>)}
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveRow(idx)}
                        disabled={busy}
                        data-testid={`moa-missing-save-${idx}`}
                        className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                        {busy ? t("saving", "Kaydediliyor…") : t("moa_save_btn", "Kaydet")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Eşleşen üyeler (info only) */}
            {registered.length > 0 && (
              <div className="space-y-1.5" data-testid="moa-registered-section">
                <div className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground">
                  ✅ {t("moa_registered_title", "Eşleşen Üyeler")}
                </div>
                {rows.map((r, idx) => {
                  if (!r.existing_id) return null;
                  return (
                    <div key={idx}
                         className="rounded p-2 flex items-center gap-2 flex-wrap"
                         style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.35)" }}
                         data-testid={`moa-registered-row-${idx}`}>
                      <span className="text-xs text-white flex-1 min-w-0 truncate">
                        ✅ {t("moa_matched_prefix", "Eşleşti")}: {r.existing_name || r.name}
                        {r.existing_alliance && (
                          <span className="ml-2 text-[10px] mono text-muted-foreground">
                            [{r.existing_alliance}]
                          </span>
                        )}
                      </span>
                      <span className="chip text-[10px]"
                            style={{ borderColor: "#22C55E", color: "#86EFAC" }}
                            data-testid={`moa-registered-badge-${idx}`}>
                        {t("moa_registered_badge", "KAYITLI")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
