import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { LoginChallenge, PlatformToken } from "../types";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginChallenge>;
  verifyCode: (email: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());

  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setTok(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(
    (email: string, password: string) =>
      api.post<LoginChallenge>(
        "/platform/auth/login",
        { email, password },
        { skipAuthRedirect: true },
      ),
    [],
  );

  const verifyCode = useCallback(async (email: string, code: string) => {
    const res = await api.post<PlatformToken>(
      "/platform/auth/verify-code",
      { email, code },
      { skipAuthRedirect: true },
    );
    setToken(res.token);
    setTok(res.token);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated: !!token, login, verifyCode, logout }),
    [token, login, verifyCode, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
