import React, { useState, useRef, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Send, X, User } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);
const fmtTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

/**
 * v124 — Event chat drawer. Slides in from the right; polls for new
 * messages every 5s so the UX feels near-realtime without websockets.
 * Backend endpoints: GET/POST /api/events/{id}/messages.
 */
export default function EventChatDrawer({ event, currentUser, onClose }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const url = event ? `/events/${event.id}/messages` : null;
  const { data: messages = [] } = useSWR(url, fetcher, { refreshInterval: 5000 });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  if (!event) return null;
  const canPost = !!currentUser;

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      await api.post(`/events/${event.id}/messages`, { text: t });
      setText("");
      mutate(url);
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex justify-end"
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)" }}
      data-testid={`event-chat-backdrop-${event.id}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md flex flex-col"
        style={{
          background: "linear-gradient(180deg, #120806 0%, #1E1410 100%)",
          borderLeft: "1px solid rgba(245,166,35,0.4)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.8)",
        }}
        data-testid={`event-chat-panel-${event.id}`}
      >
        <div
          className="flex items-center gap-2 p-3"
          style={{ borderBottom: "1px solid rgba(245,166,35,0.28)" }}
        >
          <MessageCircle className="w-4 h-4" style={{ color: "#F5A623" }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.06em" }}>
              {event.name}
            </div>
            <div className="text-[10px]" style={{ color: "#EAD8B0" }}>Etkinlik Sohbeti · {messages.length} mesaj</div>
          </div>
          <button type="button" onClick={onClose} data-testid={`event-chat-close-${event.id}`} className="text-muted-foreground hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2" data-testid={`event-chat-messages-${event.id}`}>
          {messages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8" data-testid={`event-chat-empty-${event.id}`}>
              Henüz mesaj yok. İlk yorumu sen yaz!
            </div>
          ) : messages.map((m) => (
            <div
              key={m.id}
              data-testid={`event-chat-msg-${m.id}`}
              className="flex items-start gap-2"
              style={{ opacity: m.user_id === currentUser?.id ? 1 : 0.95 }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{
                  background: m.user_id === currentUser?.id
                    ? "linear-gradient(135deg, #F5A623, #E74C1A)"
                    : "rgba(148,163,184,0.25)",
                }}
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-3.5 h-3.5" style={{ color: m.user_id === currentUser?.id ? "#0B0704" : "#CBD5E1" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold" style={{ color: "#F5A623" }}>{m.username || "Anon"}</span>
                  <span className="text-[9px] mono" style={{ color: "rgba(245,240,232,0.4)" }}>{fmtTime(m.ts)}</span>
                </div>
                <div className="text-xs leading-snug break-words" style={{ color: "#F5F0E8" }}>{m.text}</div>
              </div>
            </div>
          ))}
        </div>

        {canPost ? (
          <form onSubmit={send} className="p-3 flex gap-2" style={{ borderTop: "1px solid rgba(245,166,35,0.28)" }} data-testid={`event-chat-form-${event.id}`}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Mesajını yaz…"
              maxLength={500}
              disabled={sending}
              data-testid={`event-chat-input-${event.id}`}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              data-testid={`event-chat-send-${event.id}`}
              className="px-3 py-2 rounded-md flex items-center gap-1 text-xs font-bold uppercase"
              style={{
                background: (sending || !text.trim()) ? "rgba(245,166,35,0.25)" : "linear-gradient(135deg, #F5A623, #B45309)",
                color: "#0B0704",
                opacity: (sending || !text.trim()) ? 0.5 : 1,
              }}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <div className="p-3 text-center text-[11px] text-muted-foreground" style={{ borderTop: "1px solid rgba(245,166,35,0.28)" }}>
            Mesaj yazmak için giriş yap
          </div>
        )}
      </div>
    </div>
  );
}
