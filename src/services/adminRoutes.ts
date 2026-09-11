export const ADMIN_VIEWS = ["overview", "diagnostics", "tests", "spaces", "creators", "usage", "access"] as const;
export type AdminView = (typeof ADMIN_VIEWS)[number];

/** Routing is presentation only. Every admin request is authorized by the server. */
export function matchAdminRoute(pathname: string): { view: AdminView } | { malformed: true } | null {
  if (pathname === "/admin" || pathname === "/admin/") return { view: "overview" };
  if (!pathname.startsWith("/admin/")) return null;
  const match = /^\/admin\/([a-z]+)\/?$/.exec(pathname);
  return match && ADMIN_VIEWS.includes(match[1] as AdminView)
    ? { view: match[1] as AdminView }
    : { malformed: true };
}

export function adminNavigationPath(targetHref: string, currentHref: string): string | null {
  const current = new URL(currentHref);
  const target = new URL(targetHref, current);
  const route = matchAdminRoute(target.pathname);
  return target.origin === current.origin && route && "view" in route
    ? `${target.pathname}${target.search}`
    : null;
}
