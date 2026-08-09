import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function PushPrefsCard() {
  const { t } = useTranslation();
  const { data: groups = [] } = useSWR("/push/event-groups", fetcher);
  const { data: prefs, mutate } = useSWR("/push/prefs", fetcher);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (prefs && selected === null) setSelected(new Set(prefs.groups || []));
  }, [prefs, selected]);

  if (!prefs || selected === null) return null;

  const toggle = (g) => {
    const next = new Set(selected);
    next.has(g) ? next.delete(g) : next.add(g);
    setSelected(next);
  };

  const save = async () => {
    try {
      await api.post("/push/prefs", { groups: [...selected] });
      toast.success(t("push_prefs_saved"));
      mutate();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const receiveAll = selected.size === 0;

  return (
    <div
      data-testid="push-prefs-card"
      className="p-4 rounded-lg mb-4"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: "1px solid rgba(56,189,248,0.4)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4" style={{ color: "#38BDF8" }} />
        <h3 className="text-xs font-bold uppercase" style={{ color: "#38BDF8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("push_prefs_title")}
        </h3>
      </div>
      <div className="text-[11px] mb-3" style={{ color: "#F5F0E8", opacity: 0.7 }}>
        {receiveAll ? t("push_prefs_all_hint") : t("push_prefs_filter_hint", { count: selected.size })}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {groups.length === 0 && <span className="text-[10px] opacity-60" style={{ color: "#F5F0E8" }}>{t("push_prefs_empty")}</span>}
        {groups.map((g) => {
          const active = selected.has(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              data-testid={`push-prefs-group-${g}`}
              aria-pressed={active}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1"
              style={{
                background: active ? "linear-gradient(135deg,#38BDF8,#0EA5E9)" : "rgba(20,12,10,0.6)",
                border: `1px solid ${active ? "#38BDF8" : "rgba(56,189,248,0.4)"}`,
                color: active ? "#0B0704" : "#38BDF8",
                letterSpacing: "0.06em",
              }}
            >
              {active && <Check className="w-3 h-3" />} {g}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={save}
        data-testid="push-prefs-save"
        className="px-3 py-1.5 rounded-lg text-white text-[11px] font-bold"
        style={{ background: "linear-gradient(135deg,#0EA5E9,#38BDF8)" }}
      >
        {t("save")}
      </button>
    </div>
  );
}
