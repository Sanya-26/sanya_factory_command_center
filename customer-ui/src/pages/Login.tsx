// Login — unified form. Same screen for admin (you) and customer (signups).
// After auth, decidePostAuthRoute() checks ops_users:
//   - admin    → cross-port handoff to the factory app at FACTORY_URL,
//                passing the active session via URL hash
//                (factory's main.tsx reads it, calls supabase.auth.setSession)
//   - customer → /onboarding (or /dashboard once provisioned), in-app navigate

import { useEffect, useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase";
import { decidePostAuthRoute } from "@/lib/postAuthRoute";
import { emailSchema } from "@/lib/authValidation";

const FACTORY_URL =
  (import.meta.env.VITE_FACTORY_URL as string | undefined) ?? "http://localhost:5173";

/** Build the factory handoff URL — embeds the live session in the hash so
 *  the factory app (different origin) can call setSession() without us
 *  needing a server-side OIDC handshake. */
async function routeAfterAuth(navigate: (to: string) => void): Promise<void> {
  console.log("[login] decidePostAuthRoute start");
  const dest = await decidePostAuthRoute();
  console.log("[login] decidePostAuthRoute →", dest);
  if (dest === "/admin") {
    const { data: { session } } = await supabase.auth.getSession();
    console.log("[login] admin handoff, session?", !!session?.access_token);
    if (session?.access_token && session?.refresh_token) {
      const handoff = `${FACTORY_URL}/#aubos-handoff:${session.access_token}:${session.refresh_token}`;
      console.log("[login] redirecting to", FACTORY_URL);
      window.location.href = handoff;
      return;
    }
  }
  console.log("[login] in-app navigate to", dest);
  navigate(dest);
}

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, route on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let { data: { session } } = await supabase.auth.getSession();

      // Dev-only auto-signin. Gated by THREE conditions:
      //   1. import.meta.env.DEV — Vite dev server only.
      //   2. VITE_ENABLE_DEV_BYPASS === "1" — opt-in env var (never set in prod).
      //   3. Runtime guard throws if somehow MODE === "production".
      // Production builds set neither (1) nor (2) → this block is dead code.
      if (
        !session?.user &&
        import.meta.env.DEV &&
        import.meta.env.VITE_ENABLE_DEV_BYPASS === "1"
      ) {
        if (import.meta.env.MODE === "production") {
          throw new Error("dev bypass invoked in production build — refusing");
        }
        const devEmail = import.meta.env.VITE_DEV_CLIENT_EMAIL as string | undefined;
        const devPw = import.meta.env.VITE_DEV_CLIENT_PASSWORD as string | undefined;
        if (devEmail && devPw) {
          console.log("[login] dev auto-signin as", devEmail);
          const { error } = await supabase.auth.signInWithPassword({
            email: devEmail, password: devPw,
          });
          if (cancelled) return;
          if (error) {
            console.warn("[login] dev auto-signin failed:", error.message);
          } else {
            ({ data: { session } } = await supabase.auth.getSession());
          }
        }
      }

      if (!session?.user || cancelled) return;
      await routeAfterAuth(navigate);
    })();
    // Auth listener removed: handleSubmit calls routeAfterAuth manually, and
    // a duplicate call from a SIGNED_IN listener competes for Supabase's
    // navigator.locks lock and deadlocks getSession(). The mount-time
    // getSession check above is enough for already-authed users.
    const { data } = supabase.auth.onAuthStateChange(() => { /* no-op */ });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailCheck = emailSchema.safeParse(email);
    if (!emailCheck.success) {
      setError(emailCheck.error.errors[0].message);
      return;
    }
    if (!password) {
      setError("Password required");
      return;
    }
    setSubmitting(true);
    console.log("[login] submit start");
    try {
      console.log("[login] calling signInWithPassword");
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      console.log("[login] signInWithPassword returned", { hasError: !!signInErr });
      if (signInErr) {
        setError(
          signInErr.message.toLowerCase().includes("invalid")
            ? "Invalid email or password"
            : signInErr.message,
        );
        return;
      }
      console.log("[login] about to routeAfterAuth");
      await routeAfterAuth(navigate);
      console.log("[login] routeAfterAuth returned");
    } catch (e) {
      console.error("[login] error", e);
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-black relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-white/[0.04] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-light tracking-[0.18em] text-white uppercase">
            AUBOS Factory
          </h1>
          <p className="mt-2 text-sm text-white/50 font-mono">Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-xs uppercase tracking-wider text-white/60">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              disabled={submitting}
              className="mt-1.5 w-full bg-white/[0.03] border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs uppercase tracking-wider text-white/60">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={submitting}
              className="mt-1.5 w-full bg-white/[0.03] border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
            />
          </div>

          {error ? (
            <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black font-medium rounded-md px-4 py-2.5 text-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Signing in…" : "Login →"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-white/40 font-mono">
          New customer? <Link to="/signup" className="text-white/70 hover:text-white underline-offset-2 hover:underline">Sign up with referral code</Link>
        </p>
      </div>
    </div>
  );
}
