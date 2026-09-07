"""CSV rapor endpointleri — Arşiv puan dökümü + tüm loncanın flat CSV export'u.
Sadece `db` + `require_edit` dep'ine ihtiyacı vardır.
"""
import io
import csv
from fastapi import APIRouter, Depends, Response


def make_reports_csv_router(db, require_edit):
    router = APIRouter()

    @router.get("/reports/archive-points-export.csv")
    async def archive_points_export_csv(_: dict = Depends(require_edit)):
        """Full member × event points dump for every archived event."""
        events = await db.events.find({"archived": True}, {"_id": 0}).to_list(2000)
        ev_by_id = {e["id"]: e for e in events}
        if not events:
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["member_name", "member_id", "alliance", "event_name", "event_date", "group_name", "multiplier", "base_points", "final_points"])
            return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="archive_points.csv"'})
        points = await db.points.find({"event_id": {"$in": list(ev_by_id.keys())}}, {"_id": 0}).to_list(20000)
        member_ids = list({p.get("member_id") for p in points if p.get("member_id")})
        members = await db.members.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "member_id": 1, "alliance_name": 1}).to_list(5000) if member_ids else []
        m_by_id = {m["id"]: m for m in members}
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["member_name", "member_id", "alliance", "event_name", "event_date", "group_name", "multiplier", "base_points", "final_points"])
        for p in points:
            m = m_by_id.get(p.get("member_id"), {})
            e = ev_by_id.get(p.get("event_id"), {})
            base = int(p.get("points") or 0)
            mult = float(p.get("multiplier") or 1.0)
            _tr = lambda n: f"{int(n):,}".replace(",", ".")
            w.writerow([
                p.get("member_name") or m.get("name") or "",
                m.get("member_id") or "",
                m.get("alliance_name") or "",
                p.get("event_name") or e.get("name") or "",
                str(e.get("date") or "")[:10],
                e.get("group_name") or "",
                mult,
                _tr(base),
                _tr(int(round(base * mult))),
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="archive_points.csv"'},
        )

    @router.get("/reports/guild-data.csv")
    async def reports_guild_data_csv(_: dict = Depends(require_edit)):
        """Guild-wide member + point summary. Streams a single flat CSV row per member."""
        members = await db.members.find({}, {"_id": 0}).to_list(5000)
        events = await db.events.find({}, {"_id": 0}).to_list(4000)
        ev_by_id = {e["id"]: e for e in events}
        points = await db.points.find({}, {"_id": 0}).to_list(50000)
        tally = {}
        for p in points:
            mid = p.get("member_id")
            if not mid:
                continue
            ev = ev_by_id.get(p.get("event_id"), {})
            base = int(p.get("points") or 0)
            mult = float(p.get("multiplier") or 1.0)
            final_ = int(round(base * mult))
            row = tally.setdefault(mid, {"total": 0, "active": 0, "archived": 0, "events": 0})
            row["total"] += final_
            row["events"] += 1
            if ev.get("archived"):
                row["archived"] += final_
            else:
                row["active"] += final_
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([
            "member_id", "name", "alliance_name", "country", "power",
            "castle_level", "total_points", "active_points", "archived_points",
            "event_count",
        ])
        members_sorted = sorted(members, key=lambda m: -int(m.get("power") or 0))
        for m in members_sorted:
            t = tally.get(m.get("id"), {"total": 0, "active": 0, "archived": 0, "events": 0})
            def _tr(n):
                return f"{int(n):,}".replace(",", ".")
            w.writerow([
                m.get("member_id") or "",
                m.get("name") or "",
                m.get("alliance_name") or "",
                m.get("country") or "",
                m.get("power") or 0,
                m.get("castle_level") or "",
                _tr(t["total"]), _tr(t["active"]), _tr(t["archived"]), t["events"],
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="guild_data.csv"'},
        )

    return router
