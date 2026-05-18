// RouteGuards — protects /onboarding (any signed-in customer) and /admin
// (must have a row in ops_users). On unauth or wrong role, redirects.

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase";

type GateState =
  | { status: "loading" }
  | { status: "deny"; redirectTo: string }
  | { status: "allow" };

function GateView({
  children,
  state,
}: {
  children: React.ReactNode;
  state: GateState;
}): JSX.Element {
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white/50 font-mono text-xs">
        checking access…
      </div>
    );
  }
  if (state.status === "deny") {
    return <Navigate to={state.redirectTo} replace />;
  }
  return <>{children}</>;
}

/** Customer gate — must be signed in. Used for /onboarding, /dashboard. */
export function RequireCustomer({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<GateState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let { data: { session } } = await supabase.auth.getSession();

      // Dev-only auto-signin so localhost dev never has to type creds.
      if (!session?.user && import.meta.env.DEV) {
        const devEmail = import.meta.env.VITE_DEV_CLIENT_EMAIL as string | undefined;
        const devPw = import.meta.env.VITE_DEV_CLIENT_PASSWORD as string | undefined;
        if (devEmail && devPw) {
          const { error } = await supabase.auth.signInWithPassword({
            email: devEmail, password: devPw,
          });
          if (cancelled) return;
          if (!error) {
            ({ data: { session } } = await supabase.auth.getSession());
          }
        }
      }

      if (cancelled) return;
      if (!session?.user) {
        setState({ status: "deny", redirectTo: "/login" });
        return;
      }
      setState({ status: "allow" });
    })();
    return () => { cancelled = true; };
  }, []);
  return <GateView state={state}>{children}</GateView>;
}

/** Admin gate — must be signed in AND have a row in ops_users. On success
 *  we redirect to the factory desktop with a session-handoff hash, since
 *  the admin UI lives in the factory app, not in this repo. */
export function RequireAdmin({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<GateState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        setState({ status: "deny", redirectTo: "/login" });
        return;
      }
      const { data: ops } = await supabase
        .from("ops_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!ops) {
        setState({ status: "deny", redirectTo: "/onboarding" });
        return;
      }
      // Admin confirmed — handoff session to the factory desktop.
      const factory =
        (import.meta.env.VITE_FACTORY_URL as string | undefined) ?? "http://localhost:5173";
      if (session.access_token && session.refresh_token) {
        window.location.href = `${factory}/#aubos-handoff:${session.access_token}:${session.refresh_token}`;
        return;
      }
      setState({ status: "allow" });
    })();
    return () => { cancelled = true; };
  }, []);
  return <GateView state={state}>{children}</GateView>;
}
