// Reset the existing user's password to whatever's in command-center/.env's
// VITE_DEV_ADMIN_PASSWORD. Does not echo the password.
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

const password = ccEnv.VITE_DEV_ADMIN_PASSWORD;
if (!password) {
  console.error("VITE_DEV_ADMIN_PASSWORD is empty");
  process.exit(1);
}

const sb = createClient(rootEnv.SUPABASE_URL, rootEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = "171b0964-0273-4b74-8f71-0ca5c947f88a";

(async () => {
  const { data, error } = await sb.auth.admin.updateUserById(userId, {
    password,
  });
  if (error) throw error;
  console.log(`password reset for user ${data.user.id} (new pw length=${password.length})`);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
