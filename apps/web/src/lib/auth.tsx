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
import type { LoginResponse, Role, SignupResponse } from "../types";

type Permissions = Record<string, Record<string, boolean>> | null;

interface JwtPayload {
  userId: string;
  hotelId: string;
  role: Role;
  exp?: number;
}

interface AuthState {
  userId: string;
  hotelId: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthState | null;
  permissions: Permissions;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
}

export interface SignupInput {
  hotelName: string;
  hotelSlug: string;
  email: string;
  password: string;
}

const PERMISSIONS_KEY = "hrs.permissions";

const AuthContext = createContext<AuthContextValue | null>(null);

// Decode a JWT payload without verifying the signature — the server is the
// authority; we only read it client-side for role/expiry display.
function decodeToken(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function userFromToken(token: string | null): AuthState | null {
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return {
    userId: payload.userId,
    hotelId: payload.hotelId,
    role: payload.role,
  };
}

function loadPermissions(): Permissions {
  try {
    const raw = localStorage.getItem(PERMISSIONS_KEY);
    return raw ? (JSON.parse(raw) as Permissions) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState | null>(() =>
    userFromToken(getToken()),
  );
  const [permissions, setPermissions] = useState<Permissions>(loadPermissions);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(PERMISSIONS_KEY);
    setUser(null);
    setPermissions(null);
  }, []);

  // When the API client sees a 401, drop back to a logged-out state.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem(PERMISSIONS_KEY);
      setUser(null);
      setPermissions(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const applyToken = useCallback((token: string, perms: Permissions) => {
    setToken(token);
    if (perms) localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(perms));
    else localStorage.removeItem(PERMISSIONS_KEY);
    setUser(userFromToken(token));
    setPermissions(perms);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<LoginResponse>(
        "/auth/login",
        { email, password },
        { skipAuthRedirect: true },
      );
      applyToken(res.token, res.permissions);
    },
    [applyToken],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const res = await api.post<SignupResponse>("/auth/signup", input, {
        skipAuthRedirect: true,
      });
      // Signup returns no permissions; the first user is always admin.
      applyToken(res.token, null);
    },
    [applyToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isAuthenticated: user != null,
      login,
      signup,
      logout,
    }),
    [user, permissions, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
