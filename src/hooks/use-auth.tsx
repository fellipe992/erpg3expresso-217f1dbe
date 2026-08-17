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
  const manualSignOutRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Queda de rede: o Supabase emite SIGNED_OUT quando falha ao renovar o
      // token. Se o usuário não pediu para sair e o aparelho está offline,
      // mantemos a sessão local e tentamos renovar quando a rede voltar.
      if (event === "SIGNED_OUT" && !manualSignOutRef.current) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (offline && sessionRef.current) {
          setLoading(false);
          return;
        }
      }
      if (event === "SIGNED_OUT") manualSignOutRef.current = false;
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
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) return;
        // Sessão local perdida por falha de renovação: tenta reerguer.
        void supabase.auth.refreshSession().catch(() => {});
      });
    };
    const onOnline = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void supabase.auth.refreshSession().catch(() => {});
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", revalidate);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", revalidate);
    };
  }, []);

  // Enforce deactivation on live sessions: poll profiles.ativo and sign out.
  // Exige DUAS confirmações consecutivas do backend para nunca derrubar a
  // sessão por leitura inconsistente/rede instável.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    let strikes = 0;
    const check = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("ativo")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) return;
      if (data.ativo === false) {
        strikes += 1;
        if (strikes >= 2) {
          manualSignOutRef.current = true;
          await supabase.auth.signOut({ scope: "local" });
        }
        return;
      }
      strikes = 0;
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

  // "Sair" encerra apenas ESTA sessão (scope local) — o mesmo usuário continua
  // logado no celular e no computador ao mesmo tempo.
  const signOut = async () => {
    manualSignOutRef.current = true;
    await supabase.auth.signOut({ scope: "local" });
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
