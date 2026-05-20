// One-shot script: create a Supabase auth user + ops_users row using the
// VITE_DEV_ADMIN_EMAIL / VITE_DEV_ADMIN_PASSWORD already in command-center/.env
// and the service role key from c:\Users\sanya\Test\.env. Does not log secrets.

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function readEnv(filePath) {
  const txt = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

const ccEnv = readEnv(path.resolve(__dirname, "..", ".env"));
const rootEnv = readEnv(path.resolve(__dirname, "..", "..", "..", ".env"));

const url = rootEnv.SUPABASE_URL;
const serviceKey = rootEnv.SUPABASE_SERVICE_ROLE_KEY;
const email = ccEnv.VITE_DEV_ADMIN_EMAIL;
const password = ccEnv.VITE_DEV_ADMIN_PASSWORD;
const role = process.env.DEV_USER_ROLE || "admin";

if (!url || !serviceKey) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in root .env");
  process.exit(1);
}
if (!email || !password) {
  console.error("missing VITE_DEV_ADMIN_EMAIL or VITE_DEV_ADMIN_PASSWORD in command-center/.env");
  process.exit(1);
}

(async () => {
  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`creating user (email length=${email.length}, pw length=${password.length})...`);
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    if (/already.*registered|exists/i.test(createErr.message)) {
      console.log("user already exists — looking it up...");
      const { data: listed, error: listErr } = await sb.auth.admin.listUsers();
      if (listErr) throw listErr;
      const found = listed.users.find((u) => u.email === email);
      if (!found) throw new Error("user not found after duplicate-create");
      console.log("found existing user id:", found.id);
      await upsertOpsUser(sb, found.id, role);
      return;
    }
    throw createErr;
  }
  console.log("created auth user id:", created.user.id);
  await upsertOpsUser(sb, created.user.id, role);
})().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});

async function upsertOpsUser(sb, userId, role) {
  const { error: upErr } = await sb
    .from("ops_users")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });
  if (upErr) throw new Error("ops_users upsert: " + upErr.message);
  console.log(`ops_users row upserted (role=${role}) — done.`);
}
