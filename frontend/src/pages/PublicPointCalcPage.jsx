import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Lock, AlertTriangle } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");

function normalizeTables(day) {
  if (day.tables && day.tables.length > 0) return day.tables;
  const hasLegacy =
    (day.miktar || 0) > 0 ||
    (day.multipliers && day.multipliers.length > 0) ||
    (day.materials && day.materials.length > 0) ||
    (day.title || "");
  if (hasLegacy) {
    return [{
      id: `legacy-${day.id}`,
      title: day.title || "",
      miktar: day.miktar || 0,
      multipliers: day.multipliers || [],
      materials: day.materials || [],
    }];
  }
  return [];
}

function TranslatedText({ source, translations }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || "tr").toLowerCase();
  const bucket = source && translations ? translations[source] : null;
  const translated = bucket && bucket[lang];
  const showTranslated = translated && translated !== source && lang !== "tr";
  return (
    <span className="inline-flex items-center gap-1">
      <span>{showTranslated ? translated : source}</span>
      {showTranslated && (
        <Globe className="w-3 h-3 inline-block opacity-60" style={{ color: "#A855F7" }} />
      )}
    </span>
  );
}

function ReadOnlyTable({ table, index, translations }) {
  const { t } = useTranslation();
  const mult = (table.multipliers && table.multipliers[0]) || { name: "", value: 0 };
  const multValue = Number(mult.value) || 0;
  const title = table.title || "";

  return (
    <div
      data-testid={`pub-pc-table-${table.id}`}
      className="rounded-lg"
      style={{
        background: "rgba(20,12,10,0.6)",
        border: "1px solid rgba(231,76,26,0.25)",
        padding: "12px",
      }}
    >
      <div className="text-xs font-bold mb-2" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.06em" }}>
        {title ? <TranslatedText source={title} translations={translations} /> : `${t("pc_table")} #${index + 1}`}
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase mb-1" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
          {t("pc_multiplier")}
        </div>
        <div className="flex justify-between items-center rounded px-3 py-1.5 text-sm"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)" }}>
          <span style={{ color: "#F5F0E8" }}>
            {mult.name
              ? <TranslatedText source={mult.name} translations={translations} />
              : <span style={{ opacity: 0.4 }}>{t("pc_no_multiplier")}</span>}
          </span>
          <span className="font-bold" style={{ color: "#F5A623" }}>{fmt(multValue)}</span>
        </div>
      </div>
    </div>
  );
}

export default function PublicPointCalcPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const sig = params.get("sig") || "";
  const [state, setState] = useState({ loading: true, day: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${process.env.REACT_APP_BACKEND_URL}/api/public/point-calc/${encodeURIComponent(id)}?sig=${encodeURIComponent(sig)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const msg = res.status === 403 ? "invalid" : res.status === 404 ? "notfound" : "error";
          if (!cancelled) setState({ loading: false, day: null, error: msg });
          return;
        }
        const day = await res.json();
        if (!cancelled) setState({ loading: false, day, error: null });
      } catch (e) {
        if (!cancelled) setState({ loading: false, day: null, error: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [id, sig]);

  const tables = useMemo(() => (state.day ? normalizeTables(state.day) : []), [state.day]);
  const translations = state.day?.translations || {};

  return (
    <div className="min-h-screen" data-testid="pub-pc-page" style={{ background: "#0A0806", paddingBottom: 40 }}>
      <div className="max-w-3xl mx-auto p-4">
        {/* Minimal top bar: language switcher + readonly badge */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: "rgba(231,76,26,0.35)" }}>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase"
              style={{
                background: "linear-gradient(135deg, rgba(76,29,149,0.5), rgba(30,58,138,0.5))",
                border: "1px solid rgba(168,85,247,0.5)",
                color: "#E0E7FF",
                letterSpacing: "0.08em",
              }}
              data-testid="pub-pc-readonly-badge"
            >
              <Lock className="w-3 h-3" /> {t("pc_public_readonly")}
            </span>
            <span
              className="text-xs font-bold uppercase"
              style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.1em" }}
            >
              TiTaNXiS
            </span>
          </div>
          <LanguageSwitcher />
        </div>

        {state.loading && (
          <div className="rounded-xl p-8 text-center text-sm"
            style={{ color: "#F5F0E8", opacity: 0.7, background: "rgba(30,20,16,0.6)", border: "1px dashed rgba(231,76,26,0.3)" }}
            data-testid="pub-pc-loading">
            {t("loading")}
          </div>
        )}

        {!state.loading && state.error && (
          <div className="rounded-xl p-8 text-center flex flex-col items-center gap-3"
            style={{ background: "rgba(60,20,20,0.35)", border: "1px solid rgba(220,38,38,0.5)", color: "#F5F0E8" }}
            data-testid="pub-pc-error">
            <AlertTriangle className="w-8 h-8" style={{ color: "#f87171" }} />
            <div className="text-sm font-bold uppercase" style={{ letterSpacing: "0.08em" }}>
              {state.error === "invalid" ? t("pc_public_error") : state.error === "notfound" ? t("pc_public_not_found") : t("pc_public_error")}
            </div>
          </div>
        )}

        {!state.loading && !state.error && state.day && (
          <div
            data-testid={`pub-pc-day-${state.day.id}`}
            className="rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
              border: "1px solid rgba(231,76,26,0.4)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(231,76,26,0.05)",
              padding: "16px",
            }}
          >
            <div className="mb-3 pb-2 border-b" style={{ borderColor: "rgba(231,76,26,0.25)" }}>
              <h3
                className="text-lg font-bold"
                style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
                data-testid={`pub-pc-day-name-${state.day.id}`}
              >
                <TranslatedText source={state.day.name} translations={translations} />
              </h3>
            </div>

            {tables.length === 0 ? (
              <div className="text-[11px] px-3 py-3 rounded text-center"
                style={{ color: "#F5F0E8", opacity: 0.55, background: "#1A1210", border: "1px dashed rgba(255,255,255,0.1)" }}>
                {t("pc_no_tables")}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {tables.map((tb, idx) => (
                  <ReadOnlyTable key={tb.id} table={tb} index={idx} translations={translations} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
