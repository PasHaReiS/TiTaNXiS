import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { toast } from "sonner";
import { LogIn, User, Lock, Shield } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { toast.error("Kullanıcı adı ve şifre gerekli"); return; }
    setLoading(true);
    try {
      const u = await login(username.trim().toLowerCase(), password);
      toast.success(`Hoş geldin, ${u.username}!`);
      if (u.must_change_password) {
        toast.warning("İlk girişte şifrenizi değiştirmeniz önerilir", { duration: 6000 });
        nav("/profil", { replace: true });
      } else {
        nav("/", { replace: true });
      }
    } catch (err) {
      toast.error(apiErr(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" data-testid="login-page">
      <div className="w-full max-w-sm fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl red-gold-gradient flex items-center justify-center mb-3 shadow-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <div className="tr-flag" />
            <h1 className="text-2xl font-bold uppercase tracking-widest">
              <span className="red-text">OYUN</span> <span className="gold-text">LONCASI</span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">Yönetim Paneli Girişi</p>
        </div>

        <form onSubmit={submit} className="card-red-gold p-5 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Kullanıcı Adı</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Şifre</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <button
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="btn-gold w-full flex items-center justify-center gap-2 py-3"
          >
            <LogIn className="w-4 h-4" />
            {loading ? "GİRİŞ YAPILIYOR..." : "GİRİŞ YAP"}
          </button>

          <p className="text-[10px] text-center text-muted-foreground pt-2">
            Hesabınız yoksa <span className="red-text font-semibold">yönetici</span> ile iletişime geçin
          </p>
        </form>

        <button
          data-testid="login-back-btn"
          onClick={() => nav("/")}
          className="w-full text-xs text-muted-foreground hover:gold-text mt-4 uppercase tracking-wider"
        >
          ← Ziyaretçi olarak devam et
        </button>
      </div>
    </div>
  );
}
