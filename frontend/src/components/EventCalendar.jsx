import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, X, Calendar as CalIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { groupColor } from "@/lib/groupColors";
import EventCountdown from "@/components/EventCountdown";

const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Return the Monday-based day-of-week index (0 = Mon, 6 = Sun). */
const dowMon = (d) => (d.getDay() + 6) % 7;

/**
 * Monthly calendar view of events. Shows a 6-row × 7-col grid, prev/next
 * month nav, and per-day event pills tinted by group colour. Clicking a
 * cell opens a portal dialog with the full event list for that day.
 *
 * Pure presentational — takes the full events array (all tabs merged is
 * fine, we filter by month internally) and an optional onEventClick
 * callback to bubble up to the parent (e.g. to open the edit form).
 */
export default function EventCalendar({ events = [], onEventClick }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null); // Date or null

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - dowMon(monthStart));
  // 42 cells = 6 weeks
  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [gridStart]);

  // Bucket events by YYYY-MM-DD for O(1) lookup per cell
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(e);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    return m;
  }, [events]);

  const keyFor = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const isToday = (d) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const isInMonth = (d) => d.getMonth() === cursor.getMonth();

  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const selectedEvents = selectedDay ? (byDay.get(keyFor(selectedDay)) || []) : [];

  return (
    <div data-testid="event-calendar" className="w-full">
      {/* Month nav */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={goPrev}
          data-testid="calendar-prev-month"
          className="w-8 h-8 rounded-md flex items-center justify-center bg-white/5 hover:bg-white/10 gold-text"
          aria-label="Önceki ay"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2
          className="flex-1 text-center text-sm sm:text-base font-bold uppercase gold-text tracking-widest"
          data-testid="calendar-month-label"
        >
          {MONTHS_TR[cursor.getMonth()]} {cursor.getFullYear()}
        </h2>
        <button
          type="button"
          onClick={goToday}
          data-testid="calendar-today-btn"
          className="chip text-[10px]"
          title="Bugüne git"
        >
          <CalIcon className="w-3 h-3" /> Bugün
        </button>
        <button
          type="button"
          onClick={goNext}
          data-testid="calendar-next-month"
          className="w-8 h-8 rounded-md flex items-center justify-center bg-white/5 hover:bg-white/10 gold-text"
          aria-label="Sonraki ay"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_TR.map((wd) => (
          <div
            key={wd}
            className="text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
        {cells.map((d, i) => {
          const dayEvents = byDay.get(keyFor(d)) || [];
          const dim = !isInMonth(d);
          const todayCell = isToday(d);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDay(d)}
              data-testid={`calendar-cell-${keyFor(d)}`}
              className="text-left rounded-md p-1 sm:p-1.5 transition-all overflow-hidden"
              style={{
                minHeight: 62,
                background: todayCell
                  ? "rgba(245,166,35,0.14)"
                  : dim
                    ? "rgba(20,15,25,0.35)"
                    : "rgba(20,15,25,0.65)",
                border: todayCell
                  ? "1px solid rgba(245,166,35,0.55)"
                  : "1px solid rgba(255,255,255,0.06)",
                opacity: dim ? 0.4 : 1,
                cursor: "pointer",
              }}
            >
              <div
                className="text-[10px] sm:text-xs font-bold mono mb-0.5"
                style={{ color: todayCell ? "#FCD34D" : "#E5E7EB" }}
              >
                {d.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((e) => {
                  const color = e.group_name ? groupColor(e.group_name) : "#818cf8";
                  return (
                    <div
                      key={e.id}
                      data-testid={`calendar-event-${e.id}`}
                      className="text-[9px] leading-tight px-1 py-0.5 rounded truncate"
                      style={{
                        background: `${color}22`,
                        color,
                        borderLeft: `2px solid ${color}`,
                      }}
                      title={e.name}
                    >
                      {e.name}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-muted-foreground font-bold">
                    +{dayEvents.length - 3} daha
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day detail dialog — portal so it escapes the calendar overflow */}
      <AnimatePresence>
        {selectedDay && createPortal(
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[1000]"
              onClick={() => setSelectedDay(null)}
              data-testid="calendar-day-dialog-backdrop"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed z-[1001] card-red-gold p-4 w-[92vw] max-w-md max-h-[80vh] overflow-y-auto"
              style={{
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
              data-testid="calendar-day-dialog"
            >
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-white"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-sm font-bold uppercase gold-text tracking-widest mb-3">
                {selectedDay.getDate()} {MONTHS_TR[selectedDay.getMonth()]} {selectedDay.getFullYear()}
              </h3>
              {selectedEvents.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6">
                  Bu güne ait etkinlik yok.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e) => {
                    const color = e.group_name ? groupColor(e.group_name) : "#818cf8";
                    const dt = new Date(e.date);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          onEventClick?.(e);
                          setSelectedDay(null);
                        }}
                        data-testid={`calendar-day-event-${e.id}`}
                        className="w-full text-left card-dark p-2 hover:bg-white/5"
                        style={{ borderLeft: `3px solid ${color}` }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">{e.name}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                              <span className="mono">{dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                              {e.group_name && (
                                <>
                                  <span>·</span>
                                  <span style={{ color }}>{e.group_name}</span>
                                </>
                              )}
                              <span>·</span>
                              <span>Çarpan <span className="gold-text mono">{e.multiplier}x</span></span>
                              {dt.getTime() > Date.now() && <EventCountdown target={e.date} />}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  );
}
