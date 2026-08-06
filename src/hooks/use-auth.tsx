import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "administrador" | "financeiro" | "gestor" | "motorista" | "monitor";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  roleLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Revalida/renova o token ao voltar para o app ou reconectar à internet.
  // Evita "sessão expirada" após o celular ficar horas em segundo plano.
  useEffect(() => {
    const revalidate = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void supabase.auth.getSession();
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("online", revalidate);
    window.addEventListener("focus", revalidate);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("online", revalidate);
      window.removeEventListener("focus", revalidate);
    };
  }, []);

  // Enforce deactivation on live sessions: poll profiles.ativo and sign out immediately if false.
  // Só encerra a sessão quando o backend confirma ativo=false (nunca em erro de rede).
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    const check = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("ativo")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data && data.ativo === false) {
        await supabase.auth.signOut();
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session?.user.id]);



  const userId = session?.user.id;
  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["primary-role", userId],
    enabled: !!userId,
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .order("role");
      if (error) return null;
      if (!data || data.length === 0) return null;
      const order: AppRole[] = ["administrador", "financeiro", "gestor", "motorista", "monitor"];
      const roles = data.map((r) => r.role as AppRole);
      for (const r of order) if (roles.includes(r)) return r;
      return roles[0] ?? null;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        role: role ?? null,
        roleLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
