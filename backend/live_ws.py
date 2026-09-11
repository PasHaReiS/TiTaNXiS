"""v143.3 — Lightweight WebSocket broadcast bus for live UI updates.

Kept as a small standalone module so that both `server.py` and route files
(`routes/points.py`, etc.) can import the singleton `live_ws` and publish
change notifications without pulling in the full server tree.

Payload format (always dict-serializable JSON):
    {"type": "leaderboard.updated", "member_id": "<uuid>"}
    {"type": "points.updated", "member_id": "<uuid>", "event_id": "<uuid>"}
    {"type": "rsvp.updated", "event_id": "<uuid>"}

Clients simply revalidate their SWR cache when a matching event arrives —
no data is embedded, so this is safe to fan-out to every connected socket
without leaking authorization-scoped fields.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List

from fastapi import WebSocket

log = logging.getLogger("live_ws")


class LiveWSManager:
    def __init__(self) -> None:
        self._conns: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._conns.append(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            try:
                self._conns.remove(ws)
            except ValueError:
                pass

    async def broadcast(self, message: Dict[str, Any]) -> None:
        # Snapshot to avoid holding the lock while sending.
        async with self._lock:
            conns = list(self._conns)
        dead: List[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for d in dead:
                    try:
                        self._conns.remove(d)
                    except ValueError:
                        pass

    @property
    def size(self) -> int:
        return len(self._conns)


live_ws = LiveWSManager()


def broadcast_soon(message: Dict[str, Any]) -> None:
    """Fire-and-forget broadcast helper for synchronous or non-awaiting
    callers. Schedules the coroutine on the running event loop when one
    exists, silently drops otherwise (e.g. cron pre-startup)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(live_ws.broadcast(message))
