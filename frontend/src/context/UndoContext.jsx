import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, X } from "lucide-react";

// v141 — Global Undo Snackbar sistemi.
// Kullanım:
//   const { showUndo } = useUndo();
//   const deleted = await api.delete(`/members/${id}`);
//   showUndo({
//     message: `${name} silindi`,
//     onUndo: async () => await api.post('/members', { ...backup }),
//   });
const UndoCtx = createContext(null);

export function useUndo() {
  const ctx = useContext(UndoCtx);
  if (!ctx) throw new Error("useUndo must be inside <UndoProvider>");
  return ctx;
}

export function UndoProvider({ children }) {
  const [snack, setSnack] = useState(null);
  const timerRef = useRef(null);
  const { t } = useTranslation();

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSnack(null);
  }, []);

  const showUndo = useCallback(({ message, onUndo, duration = 5000 }) => {
    dismiss();
    setSnack({ message, onUndo, duration });
    timerRef.current = setTimeout(() => setSnack(null), duration);
  }, [dismiss]);

  const performUndo = useCallback(async () => {
    if (!snack) return;
    const { onUndo } = snack;
    dismiss();
    try {
      await onUndo();
    } catch (e) {
      console.error("undo failed", e);
    }
  }, [snack, dismiss]);

  return (
    <UndoCtx.Provider value={{ showUndo, dismiss }}>
      {children}
      {snack && (
        <div
          className="fixed left-1/2 bottom-6 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-bottom-2"
          data-testid="undo-snackbar"
          style={{
            zIndex: 99999,
            background: "linear-gradient(135deg,#1a0f0a 0%,#0e0805 100%)",
            border: "1px solid rgba(245,158,11,0.4)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(245,158,11,0.15)",
            minWidth: 300,
          }}
        >
          <span className="text-sm flex-1" style={{ color: "#F5F0E8" }}>{snack.message}</span>
          <button
            onClick={performUndo}
            data-testid="undo-snackbar-btn"
            className="h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1 uppercase tracking-widest"
            style={{
              background: "linear-gradient(135deg,#F59E0B,#EF4444)",
              color: "#fff",
              fontFamily: "Cinzel, serif",
              boxShadow: "0 4px 12px rgba(239,68,68,0.35)",
            }}
          >
            <Undo2 className="w-3 h-3" />
            {t("undo_btn", { defaultValue: "Geri Al" })}
          </button>
          <button onClick={dismiss} className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </UndoCtx.Provider>
  );
}
