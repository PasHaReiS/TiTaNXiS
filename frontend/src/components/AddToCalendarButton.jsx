import React from "react";
import { CalendarPlus } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * v124 — "Takvimime Ekle" button. Two options in a dropdown:
 * 1. Google Calendar deep link (opens in new tab, prefilled fields)
 * 2. iCal (.ics) file download — works for Apple Calendar, Outlook, etc.
 *
 * Placed inline in each event card so the CTA sits next to RSVP.
 */
export default function AddToCalendarButton({ event }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const gcalUrl = React.useMemo(() => {
    try {
      const start = new Date(event.date);
      if (isNaN(start.getTime())) return null;
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const params = new URLSearchParams({
        action: "TEMPLATE",
        text: event.name || "TiTaNXiS Event",
        dates: `${fmt(start)}/${fmt(end)}`,
        details: event.subtitle || "TiTaNXiS Etkinliği",
      });
      return `https://www.google.com/calendar/render?${params.toString()}`;
    } catch { return null; }
  }, [event.date, event.name, event.subtitle]);

  const downloadIcs = async () => {
    try {
      const r = await api.get(`/events/${event.id}/ics`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `titanxis-${(event.name || "event").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success("Takvim dosyası indirildi");
      setOpen(false);
    } catch (err) {
      toast.error("Takvim dosyası indirilemedi");
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`event-cal-btn-${event.id}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest"
        style={{
          background: "rgba(59,130,246,0.12)",
          color: "#93C5FD",
          border: "1px solid rgba(59,130,246,0.35)",
        }}
      >
        <CalendarPlus className="w-3 h-3" /> Takvimime Ekle
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-50 rounded-md overflow-hidden"
          style={{ background: "#0F0806", border: "1px solid rgba(59,130,246,0.5)", boxShadow: "0 8px 24px rgba(0,0,0,0.7)", minWidth: 200 }}
          data-testid={`event-cal-menu-${event.id}`}
        >
          {gcalUrl && (
            <a
              href={gcalUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              data-testid={`event-cal-google-${event.id}`}
              className="block px-3 py-2 text-[11px] hover:bg-blue-500/10"
              style={{ color: "#93C5FD", borderBottom: "1px solid rgba(59,130,246,0.25)" }}
            >
              📅 Google Takvim
            </a>
          )}
          <button
            type="button"
            onClick={downloadIcs}
            data-testid={`event-cal-ics-${event.id}`}
            className="block w-full text-left px-3 py-2 text-[11px] hover:bg-blue-500/10"
            style={{ color: "#93C5FD" }}
          >
            🍎 iCal / Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
}
