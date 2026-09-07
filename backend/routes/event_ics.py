"""Google Calendar / iCal export for a single event.
Standards-compliant .ics file — no auth (public share).
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Response


def make_event_ics_router(db):
    router = APIRouter()

    @router.get("/events/{event_id}/ics")
    async def event_ics(event_id: str):
        ev = await db.events.find_one({"id": event_id}, {"_id": 0})
        if not ev:
            raise HTTPException(404, "event not found")
        try:
            start = datetime.fromisoformat((ev.get("date") or "").replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(400, "bad event date")
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = start + timedelta(hours=2)

        def fmt(d: datetime) -> str:
            return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

        name = (ev.get("name") or "TiTaNXiS Event").replace("\n", " ").replace(",", "\\,")
        subtitle = (ev.get("subtitle") or "").replace("\n", " ").replace(",", "\\,")
        uid = f"{event_id}@titanxis"
        ics = "\r\n".join([
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TiTaNXiS//EN",
            "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{fmt(datetime.now(timezone.utc))}",
            f"DTSTART:{fmt(start)}",
            f"DTEND:{fmt(end)}",
            f"SUMMARY:{name}",
            f"DESCRIPTION:{subtitle}" if subtitle else "DESCRIPTION:",
            "END:VEVENT", "END:VCALENDAR", "",
        ])
        return Response(
            content=ics,
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="titanxis-{event_id[:8]}.ics"'},
        )

    return router
