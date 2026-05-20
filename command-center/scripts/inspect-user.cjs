// Inspect what we know about the existing user 171b0964-0273-4b74-8f71-0ca5c947f88a
// without echoing its email/password.
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function readEnv(p) {
  const out = {};
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const rootEnv = readEnv(path.resolve(__dirname, "..", "..", "..", ".env"));
const ccEnv = readEnv(path.resolve(__dirname, "..", ".env"));

const sb = createClient(rootEnv.SUPABASE_URL, rootEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const { data, error } = await sb.auth.admin.getUserById(
    "171b0964-0273-4b74-8f71-0ca5c947f88a",
  );
  if (error) throw error;
  const u = data.user;
  console.log("---existing user details---");
  console.log("email_in_db matches .env value:", u.email === ccEnv.VITE_DEV_ADMIN_EMAIL);
  console.log("email domain:", u.email ? u.email.split("@")[1] : "(none)");
  console.log("local-part length:", u.email ? u.email.split("@")[0].length : 0);
  console.log("created_at:", u.created_at);
  console.log("confirmed_at:", u.confirmed_at || u.email_confirmed_at);
  console.log("last_sign_in_at:", u.last_sign_in_at);
  console.log("provider(s):", u.app_metadata?.providers?.join(", ") || u.app_metadata?.provider);
  console.log("identities count:", (u.identities || []).length);
  console.log("---ops_users count for project---");
  const { count } = await sb.from("ops_users").select("*", { count: "exact", head: true });
  console.log("ops_users rows total:", count);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
