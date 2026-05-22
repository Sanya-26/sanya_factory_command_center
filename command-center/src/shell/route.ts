// Hash routing for the admin shell.
//
// Format:
//   #<dept>/<section>                          → top-level page
//   #<dept>/<section>/<id>/<sub>               → drilled-in page (e.g. customer detail)
//
// Departments:
//   cleo / factory — original Tech-role view
//   product        — Product-Manager view (see docs/PRD-product-view.md)
//
// Examples:
//   #cleo/customers                            → Cleo · customer list
//   #cleo/customers/<companyId>/overview       → Cleo · customer detail · overview tab
//   #factory/overview                          → AI Factory · home
//   #product                                   → Product · main dashboard
//   #product/cleo-for-pools                    → Product · variation table
//   #product/cleo-for-pools/customer/<id>      → Product · customer detail
//   #product/issues                            → Product · issue tracker
//   #product/settings                          → Product · settings (CTO-only role mgmt)
//
// Default landings depend on role:
//   product_manager → #product
//   everyone else   → #cleo/customers

export type Department = "cleo" | "factory" | "product" | "ceo" | "calendar";

export interface Route {
  dept: Department;
  section: string;
  id?: string;
  sub?: string;
}

export const DEFAULT_ROUTE_TECH: Route = { dept: "cleo", section: "command-center" };
export const DEFAULT_ROUTE_PRODUCT: Route = { dept: "product", section: "home" };
export const DEFAULT_ROUTE_CEO: Route = { dept: "ceo", section: "home" };

export function defaultRouteFor(role: string | null): Route {
  if (role === "product_manager") return DEFAULT_ROUTE_PRODUCT;
  if (role === "ceo") return DEFAULT_ROUTE_CEO;
  return DEFAULT_ROUTE_TECH;
}

export function parseHash(hash: string): Route | null {
  const stripped = hash.replace(/^#/, "");
  if (!stripped) return null;
  const parts = stripped.split("/").filter(Boolean);
  const dept = parts[0] as Department;
  if (dept !== "cleo" && dept !== "factory" && dept !== "product" && dept !== "ceo" && dept !== "calendar") return null;
  return {
    dept,
    section:
      parts[1] ||
      (dept === "cleo" ? "customers" : dept === "factory" ? "overview" : dept === "calendar" ? "availability" : "home"),
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
