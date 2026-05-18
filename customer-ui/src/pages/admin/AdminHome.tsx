// AdminHome — landing page for AUBOS team members.
//
// Shown to anyone with a row in ops_users. Real Cleo Command Center +
// Tenant Command Center pages will be ported in next; for now this is a
// minimal launcher so the admin login path is testable end-to-end.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase";

export default function AdminHome(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      setEmail(session.user.email ?? "");
      const { data: ops } = await supabase
        .from("ops_users")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!cancelled && ops) setRole((ops as { role: string }).role);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-light tracking-[0.18em] uppercase">AUBOS Factory</h1>
          <p className="text-[0.65rem] text-white/40 font-mono mt-0.5">Admin console</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-white/50 font-mono">{email}</span>
          {role ? (
            <span className="px-2 py-0.5 border border-white/15 rounded text-[0.6rem] uppercase tracking-wider text-white/70">
              {role}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-white/50 hover:text-white/80 transition-colors"
          >
            sign out
          </button>
        </div>
      </header>

      <main className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="text-3xl font-light tracking-tight mb-2">Welcome back.</h2>
        <p className="text-sm text-white/50 font-mono mb-12">
          Pick a console.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AdminCard
            href="/admin/cleo"
            title="Cleo Command Center"
            sub="Onboarding queue · planner · build packages"
          />
          <AdminCard
            href="/admin/tenants"
            title="Tenant Command Center"
            sub="Live tenants · costs · audited controls"
          />
          <AdminCard
            href="/admin/codes"
            title="Signup codes"
            sub="Issue + revoke referral codes"
          />
          <AdminCard
            href="/admin/runtime"
            title="Runtime ops"
            sub="VPS fleet · queues · logs"
          />
        </div>

        <p className="mt-12 text-xs text-white/30 font-mono">
          These consoles are placeholders — they'll be wired up next.
        </p>
      </main>
    </div>
  );
}

function AdminCard({
  href,
  title,
  sub,
}: {
  href: string;
  title: string;
  sub: string;
}): JSX.Element {
  return (
    <Link
      to={href}
      className="block border border-white/10 rounded-md p-5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-colors"
    >
      <div className="text-sm font-medium text-white/90">{title}</div>
      <div className="text-xs text-white/40 mt-1 font-mono">{sub}</div>
    </Link>
  );
}
