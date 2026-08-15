import React from "react";
import useSWR from "swr";
import { AlertTriangle, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Coverage warning that surfaces how many members lack the `country` field
 * (they get source-language DMs instead of localised variants) AND how many
 * ISO2 codes present in the DB aren't in the backend's COUNTRY_TO_LANG map
 * (silent TR fallback). Sits alongside the DM analytics badge inside the
 * Event Notifications panel — only visible to admins.
 *
 * States:
 *   • 100% coverage + no unmapped codes → green "all clear" chip
 *   • Some missing OR unmapped         → amber warning with counts
 */
export default function CountryCoverageBadge() {
  const { isAdmin } = useAuth();
  const { data } = useSWR(
    isAdmin ? "/admin/country-coverage" : null,
    fetcher,
    { refreshInterval: 120000 }
  );
  if (!isAdmin || !data) return null;
  const { total_members, with_country, missing_country, coverage_pct, unmapped_countries = {} } = data;
  const unmappedList = Object.entries(unmapped_countries).sort((a, b) => b[1] - a[1]);
  const hasIssue = missing_country > 0 || unmappedList.length > 0;

  if (!hasIssue) {
    return (
      <div
        data-testid="country-coverage-ok"
        className="text-[10px] px-2 py-1 rounded flex items-center gap-1.5"
        style={{
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.35)",
          color: "#6EE7B7",
        }}
        title={`Tüm ${total_members} üyenin ülkesi tanımlı ve haritada`}
      >
        <Globe className="w-3 h-3" />
        <span className="font-bold uppercase tracking-wider">
          Ülke kapsamı %100 · {with_country} üye
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="country-coverage-warning"
      className="text-[10px] px-2 py-1.5 rounded flex flex-col gap-1"
      style={{
        background: "rgba(245,166,35,0.10)",
        border: "1px solid rgba(245,166,35,0.45)",
        color: "#F5A623",
      }}
    >
      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
        <AlertTriangle className="w-3 h-3" />
        <span>Ülke kapsamı %{coverage_pct}</span>
      </div>
      {missing_country > 0 && (
        <div
          data-testid="country-coverage-missing"
          className="text-[10px] leading-tight"
          style={{ color: "#FBBF24" }}
        >
          <b>{missing_country}</b> / {total_members} üyenin{" "}
          <code className="px-1 rounded bg-black/40">country</code> alanı boş → onlara
          bildirim <b>Türkçe</b> (kaynak dil) gidecek. Üye listesinden ülke atayın.
        </div>
      )}
      {unmappedList.length > 0 && (
        <div
          data-testid="country-coverage-unmapped"
          className="text-[10px] leading-tight"
          style={{ color: "#FBBF24" }}
        >
          Haritada olmayan ülke kodları (bildirim TR fallback):{" "}
          {unmappedList.slice(0, 8).map(([iso, n]) => (
            <span
              key={iso}
              className="inline-block px-1 mx-0.5 rounded"
              style={{ background: "rgba(239,68,68,0.20)", color: "#FCA5A5" }}
              data-testid={`country-coverage-unmapped-${iso}`}
            >
              {iso}:{n}
            </span>
          ))}
          {unmappedList.length > 8 && <span>+{unmappedList.length - 8}</span>}
        </div>
      )}
    </div>
  );
}
