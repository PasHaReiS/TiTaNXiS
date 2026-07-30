import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import { KeyRound, Shield, User, LogOut, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, logout, refreshMe } = useAuth();
  const nav = useNavigate();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (newPwd !== confirm) { toast.error("Yeni şifreler eşleşmiyor"); return; }
    if (newPwd.length < 6) { toast.error("Şifre en az 6 karakter olmalı"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { old_password: oldPwd, new_password: newPwd });
      toast.success("Şifre değiştirildi");
      setOldPwd(""); setNewPwd(""); setConfirm("");
      await refreshMe();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="profile-page">
      <Header subtitle="Profilim" />
      <div className="px-4">
        <div className="card-red-gold p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`rank-badge ${user.role === "admin" ? "rank-GOW" : user.can_edit ? "rank-R3" : "rank-R2"}`}>
              {user.role === "admin" ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-lg truncate">{user.username}</div>
              {user.email && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
              <div className="flex flex-wrap gap-1 mt-1">
                {user.role === "admin" ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">ADMIN</span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-white font-bold">KULLANICI</span>
                )}
                {user.role !== "admin" && user.can_edit && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">DÜZENLEYEBİLİR</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {user.must_change_password && (
          <div className="card-dark p-3 mb-4 border-yellow-500/40 flex items-start gap-2" style={{ borderColor: "rgba(245,166,35,0.4)", background: "rgba(245,166,35,0.05)" }}>
            <AlertTriangle className="w-4 h-4 gold-text mt-0.5 flex-shrink-0" />
            <p className="text-xs text-white">İlk girişte varsayılan şifrenizi değiştirmeniz önerilir.</p>
          </div>
        )}

        <div className="section-title flex items-center gap-2"><KeyRound className="w-3 h-3" /> Şifre Değiştir</div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Mevcut Şifre</label>
            <input data-testid="profile-old-pwd" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Yeni Şifre</label>
            <input data-testid="profile-new-pwd" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={6}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Yeni Şifre Tekrar</label>
            <input data-testid="profile-confirm-pwd" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </div>
          <button data-testid="profile-change-pwd-submit" type="submit" disabled={saving} className="btn-gold w-full">
            {saving ? "Kaydediliyor..." : "Şifreyi Güncelle"}
          </button>
        </form>

        <button
          data-testid="profile-logout"
          onClick={() => { logout(); nav("/"); toast.success("Çıkış yapıldı"); }}
          className="btn-red w-full mt-6 flex items-center justify-center gap-2 py-2.5"
        >
          <LogOut className="w-4 h-4" />
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}
