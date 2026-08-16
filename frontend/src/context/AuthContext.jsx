import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import axios from "axios";
import { identifyUser, trackEvent } from "@/firebase";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TOKEN_KEY = "ol_token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = guest / not-loaded, object = logged in
  const [loading, setLoading] = useState(true);

  const setAxiosToken = useCallback((token) => {
    if (token) axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    else delete axios.defaults.headers.common["Authorization"];
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    setAxiosToken(token);
    axios
      .get(`${API}/auth/me`)
      .then((r) => { setUser(r.data); identifyUser(r.data); })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAxiosToken(null);
      })
      .finally(() => setLoading(false));
  }, [setAxiosToken]);

  const login = useCallback(async (username, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setAxiosToken(data.token);
    setUser(data.user);
    identifyUser(data.user);
    trackEvent("user_login", { method: "password", role: data.user?.role || "member" });
    return data.user;
  }, [setAxiosToken]);

  // Adopt an already-issued token + user (used by the invite-signup flow so
  // /kayit/:token can auto-login without a second /auth/login round-trip).
  const adoptSession = useCallback((token, u) => {
    localStorage.setItem(TOKEN_KEY, token);
    setAxiosToken(token);
    setUser(u);
    identifyUser(u);
    trackEvent("user_login", { method: "invite", role: u?.role || "member" });
    return u;
  }, [setAxiosToken]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAxiosToken(null);
    setUser(null);
  }, [setAxiosToken]);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`);
      setUser(data);
      return data;
    } catch { return null; }
  }, []);

  const isAdmin = user?.role === "admin";
  const canEdit = !!user && (isAdmin || !!user.can_edit);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, canEdit, login, logout, refreshMe, setUser, adoptSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
