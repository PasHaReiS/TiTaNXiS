import React, { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { Globe, MapPin, X } from "lucide-react";
import { api } from "@/lib/api";
import { COUNTRY_BY_ISON, COUNTRY_BY_ISO2 } from "@/lib/countries";

// world-atlas countries-110m: TopoJSON with numeric ISO 3166-1 codes as `id`.
// CDN-served, ~100 KB, cached by browser after first load.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const fetcher = (url) => api.get(url).then((r) => r.data);

/** Dashboard card: choropleth world map of guild members by country. */
export default function MemberLocationMap() {
  const { t } = useTranslation();
  const { data: rows = [] } = useSWR("/dashboard/member-locations", fetcher, { refreshInterval: 60000 });
  const [hoverCode, setHoverCode] = useState(null);
  const [selectedIso2, setSelectedIso2] = useState(null); // opens the side panel

  // Build lookup: ISO numeric → count (for map colour) and ISO2 → count (for list).
  const byIsoN = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const meta = COUNTRY_BY_ISO2[(r.country || "").toUpperCase()];
      if (meta) m[meta.isoN] = r.count;
    });
    return m;
  }, [rows]);

  const maxCount = useMemo(
    () => rows.reduce((mx, r) => Math.max(mx, r.count || 0), 0),
    [rows],
  );

  const colorScale = useMemo(
    () => scaleLinear().domain([0, Math.max(maxCount, 1)]).range(["#1F1F1F", "#F5A623"]),
    [maxCount],
  );

  const topList = useMemo(() => rows.slice(0, 5), [rows]);
  const totalPlaced = useMemo(() => rows.reduce((s, r) => s + (r.count || 0), 0), [rows]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "#1F1F1F",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      data-testid="dash-member-locations"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Globe className="w-4 h-4" style={{ color: "#F5A623" }} />
        <span className="text-[11px] uppercase tracking-widest font-bold text-white/90">
          {t("dash_member_locations")}
        </span>
        <span className="ml-auto text-[10px] text-white/50">
          {t("dash_placed_x_of_y", { placed: totalPlaced })}
        </span>
      </div>

      <div className="relative" style={{ background: "#111" }}>
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 155 }}
          height={280}
          style={{ width: "100%", height: 280 }}
          data-testid="dash-member-locations-map"
        >
          <ZoomableGroup center={[10, 20]} zoom={1} minZoom={1} maxZoom={4}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const isoN = String(geo.id).padStart(3, "0");
                  const count = byIsoN[isoN] || 0;
                  const meta = COUNTRY_BY_ISON[isoN];
                  const fill = count > 0 ? colorScale(count) : "#262626";
                  const isHover = hoverCode === isoN;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => setHoverCode(isoN)}
                      onMouseLeave={() => setHoverCode(null)}
                      onClick={() => {
                        if (count > 0 && meta) setSelectedIso2(meta.iso2);
                      }}
                      style={{
                        default: {
                          fill,
                          stroke: "#3d3d3d",
                          strokeWidth: 0.3,
                          outline: "none",
                          transition: "fill 0.15s ease",
                        },
                        hover: {
                          fill: count > 0 ? "#F5A623" : "#3a3a3a",
                          stroke: "#F5A623",
                          strokeWidth: 0.6,
                          outline: "none",
                          cursor: count > 0 ? "pointer" : "default",
                        },
                        pressed: { fill, outline: "none" },
                      }}
                      data-testid={meta ? `map-geo-${meta.iso2}` : undefined}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {hoverCode && (
          <TooltipBadge
            iso2={COUNTRY_BY_ISON[hoverCode]?.iso2}
            name={COUNTRY_BY_ISON[hoverCode]?.name}
            flag={COUNTRY_BY_ISON[hoverCode]?.flag}
            count={byIsoN[hoverCode] || 0}
          />
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/5">
        {topList.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-white/50 justify-center py-2">
            <MapPin className="w-3 h-3" />
            <span>{t("dash_no_country_data")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="dash-member-locations-legend">
            <span className="text-[9px] uppercase tracking-widest font-bold text-white/50 mb-0.5">
              {t("dash_top_countries")}
            </span>
            {topList.map((r) => {
              const meta = COUNTRY_BY_ISO2[r.country];
              const pct = maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0;
              return (
                <button
                  key={r.country}
                  type="button"
                  onClick={() => setSelectedIso2(r.country)}
                  className="flex items-center gap-2 text-xs w-full text-left hover:bg-white/5 rounded px-1 py-0.5 transition"
                  data-testid={`legend-row-${r.country}`}
                  title={t("dash_click_to_view_members")}
                >
                  <span className="w-16 text-white/90 flex items-center gap-1">
                    <span>{meta?.flag || "🏳️"}</span>
                    <span className="font-bold">{r.country}</span>
                  </span>
                  <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: "#0f0f0f" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: colorScale(r.count),
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-bold mono text-white/80">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedIso2 && (
        <CountryMembersDrawer iso2={selectedIso2} onClose={() => setSelectedIso2(null)} />
      )}
    </div>
  );
}

/** Right-side drawer showing all members from the selected country. */
function CountryMembersDrawer({ iso2, onClose }) {
  const { t } = useTranslation();
  const meta = COUNTRY_BY_ISO2[iso2];
  const { data: members = [], isLoading } = useSWR(
    `/members?country=${encodeURIComponent(iso2)}`,
    fetcher,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
      data-testid="country-drawer-backdrop"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full overflow-y-auto"
        style={{
          background: "linear-gradient(180deg,#181818 0%,#0F0F0F 100%)",
          borderLeft: "1px solid rgba(245,166,35,0.3)",
          boxShadow: "-8px 0 30px rgba(0,0,0,0.6)",
        }}
        data-testid="country-drawer"
      >
        <div className="sticky top-0 flex items-center gap-2 px-4 py-3 border-b border-white/5"
             style={{ background: "rgba(20,12,10,0.95)", backdropFilter: "blur(6px)" }}>
          <span className="text-2xl">{meta?.flag || "🏳️"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{meta?.name || iso2}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">
              {members.length} {t("dash_member_count_suffix")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/10 transition"
            data-testid="country-drawer-close"
            aria-label={t("close") || "Close"}
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="p-3">
          {isLoading && (
            <div className="text-xs text-white/50 text-center py-4">…</div>
          )}
          {!isLoading && members.length === 0 && (
            <div className="text-xs text-white/50 text-center py-6">{t("no_records_dot")}</div>
          )}
          <div className="flex flex-col gap-1.5" data-testid="country-drawer-list">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                data-testid={`country-drawer-member-${m.id}`}
              >
                <span
                  className={`rank-badge rank-${m.rank || "R1"} flex-shrink-0`}
                  style={{ width: 26, height: 22, fontSize: 10, borderRadius: 4, fontWeight: 800 }}
                >
                  {m.rank || "R1"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate" style={{ textTransform: "none" }}>{m.name}</div>
                  <div className="text-[10px] text-white/50 truncate">
                    {m.alliance_name || "—"}{m.castle_level ? ` · F${m.castle_level}` : ""}
                  </div>
                </div>
                {m.bireysel_guc ? (
                  <div className="text-[11px] font-bold mono" style={{ color: "#F5A623" }}>
                    {new Intl.NumberFormat().format(m.bireysel_guc)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TooltipBadge({ iso2, name, flag, count }) {
  const { t } = useTranslation();
  if (!name) return null;
  return (
    <div
      className="absolute pointer-events-none px-3 py-1.5 rounded-md flex items-center gap-2 text-xs"
      style={{
        top: 10,
        right: 10,
        background: "rgba(0,0,0,0.75)",
        border: "1px solid rgba(245,166,35,0.55)",
        backdropFilter: "blur(4px)",
      }}
      data-testid="map-tooltip"
    >
      <span>{flag}</span>
      <span className="font-bold text-white">{name}</span>
      <span className="text-white/60">·</span>
      <span className="font-bold mono" style={{ color: "#F5A623" }}>
        {count} {t("dash_member_count_suffix")}
      </span>
    </div>
  );
}
