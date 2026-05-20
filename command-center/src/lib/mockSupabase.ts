// Mock Supabase client — local-only data backend for the Product view.
// See docs/PRD-product-view.md §13.
//
// Implements just the surface area used by the Product pages + App.tsx auth
// gate. Backed by in-memory arrays seeded from seeds.ts, persisted to
// localStorage on every write. Safe by construction: no network calls.

import { INITIAL_DB, SEEDED_USER_ID, SEEDED_USER_EMAIL } from "./seeds";

type Row = Record<string, unknown>;
type Table = Row[];
type DB = Record<string, Table>;

const STORAGE_KEY = "cleo_mock_db_v1";

function cloneSeeds(): DB {
  return JSON.parse(JSON.stringify(INITIAL_DB)) as DB;
}

function loadDB(): DB {
  if (typeof localStorage === "undefined") return cloneSeeds();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch { /* fall through */ }
  const fresh = cloneSeeds();
  saveDB(fresh);
  return fresh;
}

function saveDB(db: DB) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch { /* quota etc. */ }
}

let DB: DB = loadDB();

export function resetMockDB() {
  DB = cloneSeeds();
  saveDB(DB);
}

function uuid() {
  // RFC-4122-ish; good enough for mock ids.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Computed views ──────────────────────────────────────────────────
function computeAccountHealth(): Row[] {
  const out: Row[] = [];
  const flagsByCompany = new Map<string, Row[]>();
  for (const f of DB.customer_flags || []) {
    const id = String(f.company_id);
    if (!flagsByCompany.has(id)) flagsByCompany.set(id, []);
    flagsByCompany.get(id)!.push(f);
  }
  const issuesByCompany = new Map<string, Row[]>();
  for (const t of DB.tech_issues || []) {
    if (!t.company_id) continue;
    const id = String(t.company_id);
    if (!issuesByCompany.has(id)) issuesByCompany.set(id, []);
    issuesByCompany.get(id)!.push(t);
  }
  for (const c of DB.companies || []) {
    const cid = String(c.id);
    const flags = flagsByCompany.get(cid) ?? [];
    const issues = issuesByCompany.get(cid) ?? [];
    let status: "green" | "yellow" | "red" = "green";
    const criticalFlag = flags.some((f) => f.severity === "critical" && f.status === "open");
    const highFlag = flags.some((f) => f.severity === "high" && f.status === "open");
    const mediumOpen = flags.filter((f) => f.severity === "medium" && f.status === "open").length;
    const highIssue = issues.some((i) =>
      ["high", "critical"].includes(String(i.severity)) &&
      !["done", "wontfix"].includes(String(i.status)),
    );
    if (criticalFlag) status = "red";
    else if (highFlag || mediumOpen >= 2 || highIssue) status = "yellow";
    out.push({
      company_id: cid,
      company_name: c.name,
      niche: c.niche,
      status,
      is_override: false,
      override_expires_at: null,
    });
  }
  return out;
}

function computeFinancialSummary(): Row[] {
  const byNiche = new Map<string, { live: number; in_flight: number; churned: number; mrr: number; count: number }>();
  const stageByCompany = new Map<string, string>();
  for (const s of DB.project_lifecycle_stage_runs || []) {
    stageByCompany.set(String(s.project_id), String(s.stage_slug));
  }
  for (const c of DB.companies || []) {
    const niche = String(c.niche ?? "unknown");
    const stage = stageByCompany.get(String(c.id)) ?? "intake";
    if (!byNiche.has(niche)) byNiche.set(niche, { live: 0, in_flight: 0, churned: 0, mrr: 0, count: 0 });
    const bucket = byNiche.get(niche)!;
    if (stage === "live") bucket.live++;
    else if (stage === "paused") bucket.churned++;
    else bucket.in_flight++;
    if (stage === "live" || stage === "sanya-audit") {
      const mu = Number(c.monthly_usd ?? 0);
      bucket.mrr += mu;
    }
    bucket.count++;
  }
  return Array.from(byNiche.entries()).map(([niche, b]) => ({
    niche,
    live_count: b.live,
    in_flight_count: b.in_flight,
    churned_count: b.churned,
    mrr_usd: b.mrr,
    avg_acv_usd: b.live > 0 ? Math.round(b.mrr / b.live) : 0,
  }));
}

function computeIssuesWithFlagStats(): Row[] {
  // Per tech_issue, count linked open flags + distinct customers.
  const flagsByIssue = new Map<string, { count: number; companies: Set<string> }>();
  for (const f of DB.customer_flags || []) {
    const link = f.linked_issue_id as string | null | undefined;
    if (!link || f.status === "resolved") continue;
    if (!flagsByIssue.has(link)) flagsByIssue.set(link, { count: 0, companies: new Set() });
    const b = flagsByIssue.get(link)!;
    b.count += 1;
    if (f.company_id) b.companies.add(String(f.company_id));
  }
  return (DB.tech_issues || []).map((ti) => {
    const stats = flagsByIssue.get(String(ti.id));
    const flag_count = stats?.count ?? 0;
    const customer_count = stats?.companies.size ?? 0;
    return {
      ...ti,
      flag_count,
      customer_count,
      priority_score: flag_count + customer_count * 2,
    };
  });
}

function getTableRows(table: string): Row[] {
  if (table === "v_account_health") return computeAccountHealth();
  if (table === "v_financial_summary") return computeFinancialSummary();
  if (table === "v_issues_with_flag_stats") return computeIssuesWithFlagStats();
  return DB[table] ?? (DB[table] = []);
}

// ─── Builder ─────────────────────────────────────────────────────────
interface Filter { type: "eq" | "in"; col: string; val: unknown; vals?: unknown[] }

class QB {
  private table: string;
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private columnsArg: string = "*";
  private orderBy?: { col: string; ascending: boolean };
  private limitN?: number;
  private payload?: Row | Row[];

  constructor(table: string) { this.table = table; }

  select(cols: string = "*"): this {
    this.columnsArg = cols;
    return this;
  }
  eq(col: string, val: unknown): this { this.filters.push({ type: "eq", col, val }); return this; }
  in(col: string, vals: unknown[]): this { this.filters.push({ type: "in", col, val: vals, vals }); return this; }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  insert(row: Row | Row[]): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  upsert(row: Row | Row[], _opts?: { onConflict?: string }): this {
    this.op = "insert"; // simplification: treat upsert as insert in mock
    this.payload = row;
    return this;
  }
  delete(): this { this.op = "delete"; return this; }

  // Terminal: single row
  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> {
    return this._exec().then((rows) => {
      if (rows.length === 0) return { data: null, error: null };
      if (rows.length > 1) return { data: null, error: { message: "more than one row returned" } };
      return { data: rows[0], error: null };
    });
  }
  single(): Promise<{ data: Row; error: { message: string } | null }> {
    return this._exec().then((rows) => {
      if (rows.length !== 1) {
        return { data: rows[0] ?? ({} as Row), error: { message: `expected 1 row, got ${rows.length}` } };
      }
      return { data: rows[0], error: null };
    });
  }

  // Thenable: lets `await sb.from(x).select(y).eq(...)` resolve to {data, error}
  then<R1 = unknown, R2 = never>(
    resolve: (value: { data: Row[]; error: { message: string } | null; count?: number | null }) => R1 | PromiseLike<R1>,
    reject?: (reason: unknown) => R2 | PromiseLike<R2>,
  ): Promise<R1 | R2> {
    return this._exec()
      .then((rows) => resolve({ data: rows, error: null, count: rows.length }))
      .catch((e) => (reject ? reject(e) : (Promise.reject(e) as Promise<R2>)));
  }

  private async _exec(): Promise<Row[]> {
    const isView = this.table.startsWith("v_");
    if (this.op === "select") {
      let rows = getTableRows(this.table).slice();
      for (const f of this.filters) {
        if (f.type === "eq") rows = rows.filter((r) => r[f.col] === f.val);
        if (f.type === "in") {
          const set = new Set(f.vals);
          rows = rows.filter((r) => set.has(r[f.col]));
        }
      }
      if (this.orderBy) {
        const col = this.orderBy.col;
        const asc = this.orderBy.ascending;
        rows.sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return asc ? -1 : 1;
          if (bv == null) return asc ? 1 : -1;
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return rows;
    }
    if (isView) return []; // can't write to views
    const table = (DB[this.table] = DB[this.table] || []);
    if (this.op === "insert") {
      const payload = this.payload;
      const rows = Array.isArray(payload) ? payload : [payload as Row];
      const inserted: Row[] = [];
      for (const r0 of rows) {
        const r = { ...r0 } as Row;
        if (r.id == null) r.id = uuid();
        if (r.created_at == null) r.created_at = new Date().toISOString();
        table.push(r);
        inserted.push(r);
      }
      saveDB(DB);
      return inserted;
    }
    if (this.op === "update") {
      const patch = (this.payload ?? {}) as Row;
      const updated: Row[] = [];
      for (const row of table) {
        if (this._matches(row)) {
          Object.assign(row, patch);
          if (!("updated_at" in patch)) row.updated_at = new Date().toISOString();
          updated.push(row);
        }
      }
      saveDB(DB);
      return updated;
    }
    if (this.op === "delete") {
      const kept: Row[] = [];
      const removed: Row[] = [];
      for (const row of table) (this._matches(row) ? removed : kept).push(row);
      DB[this.table] = kept;
      saveDB(DB);
      return removed;
    }
    return [];
  }

  private _matches(row: Row): boolean {
    for (const f of this.filters) {
      if (f.type === "eq" && row[f.col] !== f.val) return false;
      if (f.type === "in") {
        const set = new Set(f.vals);
        if (!set.has(row[f.col])) return false;
      }
    }
    return true;
  }
}

// ─── Auth stub ───────────────────────────────────────────────────────
const MOCK_SESSION = {
  user: {
    id: SEEDED_USER_ID,
    email: SEEDED_USER_EMAIL,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
  },
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
};

const auth = {
  async getSession() { return { data: { session: MOCK_SESSION }, error: null }; },
  async getUser() { return { data: { user: MOCK_SESSION.user }, error: null }; },
  async signInWithPassword(_args: { email: string; password: string }) {
    return { data: { session: MOCK_SESSION, user: MOCK_SESSION.user }, error: null };
  },
  async signOut() { return { error: null }; },
  onAuthStateChange(_cb: (event: string, session: unknown) => void) {
    return { data: { subscription: { unsubscribe() { /* no-op */ } } } };
  },
};

const storage = {
  from(_bucket: string) {
    return {
      async upload() { return { data: null, error: { message: "storage not supported in mock mode" } }; },
      async download() { return { data: null, error: { message: "storage not supported in mock mode" } }; },
    };
  },
};

const channel = (_name: string) => ({
  on(_evt: string, _filter: unknown, _cb: unknown) { return this; },
  subscribe(_cb?: unknown) { return this; },
  unsubscribe() { return Promise.resolve("ok"); },
});

const removeChannel = (_ch: unknown) => Promise.resolve("ok");

export function createMockClient() {
  return {
    from(table: string) { return new QB(table); },
    auth,
    storage,
    channel,
    removeChannel,
  };
}

export type MockClient = ReturnType<typeof createMockClient>;
