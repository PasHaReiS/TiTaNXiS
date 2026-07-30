import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { Plus, Trash2, KeyRound, Shield, User, X, ShieldCheck, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function UserManagement() {
  const { user: me } = useAuth();
  const { data: users = [] } = useSWR("/users", fetcher);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);

  return (
    <div data-testid="user-management-page">
      <Header subtitle="Kullanıcı Yönetimi" />
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold uppercase red-text tracking-wider">Kullanıcılar</h2>
            <p className="text-xs text-muted-foreground">Toplam <span className="gold-text font-bold mono">{users.length}</span> kullanıcı</p>
          </div>
          <button
            data-testid="user-add-btn"
            onClick={() => setShowForm(true)}
            className="btn-gold flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-4 h-4" /> Yeni
          </button>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} data-testid={`user-row-${u.id}`} className="card-dark p-3">
              <div className="flex items-center gap-3">
                <div className={`rank-badge ${u.role === "admin" ? "rank-GOW" : u.can_edit ? "rank-R3" : "rank-R2"}`}>
                  {u.role === "admin" ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate flex items-center gap-2">
                    {u.username}
                    {u.role === "admin" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">ADMIN</span>
                    )}
                    {u.role !== "admin" && u.can_edit && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">DÜZENLEYEBİLİR</span>
                    )}
                  </div>
                  {u.email && <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>}
                </div>
              </div>

              {u.role !== "admin" && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                    <PencilLine className="w-3 h-3" />
                    Değişiklik Yapabilir
                  </label>
                  <Switch
                    data-testid={`user-toggle-edit-${u.id}`}
                    checked={u.can_edit}
                    onCheckedChange={async (checked) => {
                      try {
                        await api.patch(`/users/${u.id}`, { can_edit: checked });
                        mutate("/users");
                        toast.success(checked ? "Yetki verildi" : "Yetki kaldırıldı");
                      } catch (e) { toast.error(apiErr(e)); }
                    }}
                  />
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  data-testid={`user-reset-pwd-${u.id}`}
                  onClick={() => setResetTarget(u)}
                  className="chip flex-1 justify-center text-[10px]"
                >
                  <KeyRound className="w-3 h-3" /> Şifre Sıfırla
                </button>
                {u.id !== me.id && u.username !== "admin" && (
                  <button
                    data-testid={`user-delete-${u.id}`}
                    onClick={async () => {
                      if (!window.confirm(`${u.username} silinsin mi?`)) return;
                      try {
                        await api.delete(`/users/${u.id}`);
                        mutate("/users");
                        toast.success("Kullanıcı silindi");
                      } catch (e) { toast.error(apiErr(e)); }
                    }}
                    className="w-8 h-8 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && <UserForm onClose={() => setShowForm(false)} />}
      {resetTarget && <ResetPwdForm user={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  );
}

function UserForm({ onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users", { username, password, email: email || null, role, can_edit: canEdit });
      mutate("/users");
      toast.success("Kullanıcı oluşturuldu");
      onClose();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">Yeni Kullanıcı</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Kullanıcı Adı</label>
        <input data-testid="user-form-username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Şifre</label>
        <input data-testid="user-form-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">E-posta (ops.)</label>
        <input data-testid="user-form-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Rol</label>
        <div data-testid="user-form-role" className="flex gap-2">
          <button type="button" onClick={() => setRole("user")} className={`chip ${role === "user" ? "active" : ""}`}>Kullanıcı</button>
          <button type="button" onClick={() => setRole("admin")} className={`chip ${role === "admin" ? "active" : ""}`}>
            <Shield className="w-3 h-3" /> Admin
          </button>
        </div>

        {role === "user" && (
          <label className="flex items-center gap-2 mt-3 text-xs">
            <input data-testid="user-form-canedit" type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} className="w-4 h-4 accent-red-500" />
            <span className="text-white">Değişiklik yapabilir</span>
          </label>
        )}

        <button data-testid="user-form-submit" type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : "Oluştur"}
        </button>
      </form>
    </div>
  );
}

function ResetPwdForm({ user, onClose }) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: pwd });
      toast.success(`${user.username} için şifre sıfırlandı`);
      onClose();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">Şifre Sıfırla — {user.username}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Yeni Şifre</label>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={6}
          data-testid="reset-pwd-input"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button type="submit" disabled={saving} data-testid="reset-pwd-submit" className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : "Sıfırla"}
        </button>
      </form>
    </div>
  );
}
