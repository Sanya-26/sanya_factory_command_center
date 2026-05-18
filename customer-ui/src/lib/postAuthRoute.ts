// postAuthRoute — decides where to send a user after login.
//
// Rules:
//   1. If user has a row in ops_users → admin → /admin
//   2. If user has a companies row + clawdbot_instances (provisioned tenant)
//      → returning customer → /dashboard (TODO: implement; for now /onboarding)
//   3. If user has a companies row but no VPS yet → /onboarding (Cleo stage)
//   4. If user has NO companies row → /signup (shouldn't reach here normally,
//      but defensive: it means the redeem step didn't complete)
//
// The check happens server-side via supabase queries; RLS on each table
// enforces that we only see the rows we're allowed to.

import { supabase } from "@/integrations/supabase";

export type PostAuthDestination =
  | "/admin"
  | "/onboarding"
  | "/dashboard"
  | "/signup";

export async function decidePostAuthRoute(): Promise<PostAuthDestination> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return "/signup"; // not authed → land on signup

  const userId = session.user.id;

  // 1. Admin?
  const { data: opsRow } = await supabase
    .from("ops_users")
    .select("user_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (opsRow) return "/admin";

  // 2. Customer — has a companies row?
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!company) {
    // Authed but no company yet — they're mid-signup somehow (e.g. Stage C
    // never completed). Send them back to signup to finish redeeming the code.
    return "/signup";
  }

  // 3. Provisioned tenant (has clawdbot_instances)?
  // For now the factory doesn't have clawdbot_instances table — that's on
  // the OLD AUBOS production project. Until we wire the post-onboarding
  // dashboard, every customer with a companies row goes to /onboarding.
  return "/onboarding";
}
