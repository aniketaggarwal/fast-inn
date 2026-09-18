import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

function loadStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser);

  const persist = (nextUser, tokens) => {
    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem("accessToken", tokens.accessToken);
    if (tokens.refreshToken) localStorage.setItem("refreshToken", tokens.refreshToken);
    setUser(nextUser);
  };

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    persist(data.user, data);
    return data.user;
  }, []);

  const register = useCallback(async (email, password) => {
    const data = await api.register(email, password);
    persist(data.user, data);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
  }, []);

  // api.js can't reach this component's state directly when a refresh
  // token turns out to be expired/invalid too — it clears localStorage
  // and dispatches this event instead, so the UI actually drops back to
  // logged-out rather than localStorage going stale under a still-shown
  // "logged in" screen.
  useEffect(() => {
    const onAuthLogout = () => setUser(null);
    window.addEventListener("auth:logout", onAuthLogout);
    return () => window.removeEventListener("auth:logout", onAuthLogout);
  }, []);

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
