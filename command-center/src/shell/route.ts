// Hash routing for the admin shell.
//
// Format:
//   #<dept>/<section>                          → top-level page
//   #<dept>/<section>/<id>/<sub>               → drilled-in page (e.g. customer detail)
//
// Examples:
//   #cleo/customers                            → Cleo · customer list
//   #cleo/customers/<companyId>/overview       → Cleo · customer detail · overview tab
//   #factory/overview                          → AI Factory · home
//
// Default landing: #cleo/customers.

export type Department = "cleo" | "factory";

export interface Route {
  dept: Department;
  section: string;
  id?: string;
  sub?: string;
}

export const DEFAULT_ROUTE: Route = { dept: "cleo", section: "command-center" };

export function parseHash(hash: string): Route {
  const stripped = hash.replace(/^#/, "");
  if (!stripped) return DEFAULT_ROUTE;
  const parts = stripped.split("/").filter(Boolean);
  const dept = (parts[0] as Department) || "cleo";
  if (dept !== "cleo" && dept !== "factory") return DEFAULT_ROUTE;
  return {
    dept,
    section: parts[1] || (dept === "cleo" ? "customers" : "overview"),
    id: parts[2],
    sub: parts[3],
  };
}

export function toHash(r: Route): string {
  let s = `#${r.dept}/${r.section}`;
  if (r.id) s += `/${r.id}`;
  if (r.sub) s += `/${r.sub}`;
  return s;
}

export function navigate(r: Route): void {
  const h = toHash(r);
  if (window.location.hash !== h) {
    window.location.hash = h;
  }
}
