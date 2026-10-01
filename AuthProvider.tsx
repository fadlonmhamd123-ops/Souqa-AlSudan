"use client";
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  getMockUser,
  clearMockUser,
  type MockUser,
  canAccessAdmin,
  canAccessMerchant,
} from "@/lib/mock-auth";

interface RealUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
}

interface AuthState {
  mockUser: MockUser | null;
  realUser: RealUser | null;
  /** المستخدم الفعّال: Mock له الأولوية (للتجربة الفورية)، ثم الحقيقي */
  user: { name: string; role: string; phone: string | null; email: string | null; isMock: boolean } | null;
  role: string | null;
  isLoggedIn: boolean;
  isMock: boolean;
  loading: boolean;
  isAdmin: boolean;
  isMerchant: boolean;
  refresh: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  mockUser: null,
  realUser: null,
  user: null,
  role: null,
  isLoggedIn: false,
  isMock: false,
  loading: true,
  isAdmin: false,
  isMerchant: false,
  refresh: () => {},
  logout: async () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [mockUser, setMockUser] = useState<MockUser | null>(null);
  const [realUser, setRealUser] = useState<RealUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    // 1) Mock من LocalStorage (فوري) — مؤجّل لتفادي setState المتزامن داخل effect
    queueMicrotask(() => setMockUser(getMockUser()));
    // 2) الحقيقي من الخادم (أفضل جهد)
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.id) {
          setRealUser({
            id: d.user.id,
            name: d.user.name,
            phone: d.user.phone,
            email: d.user.email,
            role: d.user.role,
          });
        } else {
          setRealUser(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onMock = (e: Event) => {
      const detail = (e as CustomEvent).detail as MockUser | null;
      setMockUser(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "matjarak_mock_user") setMockUser(getMockUser());
    };
    window.addEventListener("matjarak:mock-auth", onMock);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("matjarak:mock-auth", onMock);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    clearMockUser();
    setMockUser(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setRealUser(null);
    window.location.href = "/";
  }, []);

  const effective = mockUser
    ? { name: mockUser.name, role: mockUser.role, phone: mockUser.phone, email: mockUser.email, isMock: true }
    : realUser
      ? { name: realUser.name, role: realUser.role, phone: realUser.phone, email: realUser.email, isMock: false }
      : null;

  const role = effective?.role || null;

  return (
    <AuthContext.Provider
      value={{
        mockUser,
        realUser,
        user: effective,
        role,
        isLoggedIn: !!effective,
        isMock: !!mockUser,
        loading,
        isAdmin: canAccessAdmin(role),
        isMerchant: canAccessMerchant(role),
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
