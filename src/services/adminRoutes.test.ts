import { describe, expect, it } from "vitest";
import { ADMIN_VIEWS, adminNavigationPath, matchAdminRoute } from "./adminRoutes";

describe("admin route boundary", () => {
  it("supports only the explicit clean admin routes", () => {
    expect(matchAdminRoute("/admin")).toEqual({ view: "overview" });
    for (const view of ADMIN_VIEWS) {
      expect(matchAdminRoute(`/admin/${view}`)).toEqual({ view });
      expect(matchAdminRoute(`/admin/${view}/`)).toEqual({ view });
    }
    for (const path of ["/admin/unknown", "/admin/overview/more", "/admin/%61ccess"]) {
      expect(matchAdminRoute(path)).toEqual({ malformed: true });
    }
    for (const path of ["/", "/administrator", "/creators", "/spaces/admin"]) {
      expect(matchAdminRoute(path)).toBeNull();
    }
  });
  it("keeps filters and rejects external navigation targets", () => {
    expect(adminNavigationPath("/admin/diagnostics?room=white-cube&days=7", "https://lieuva.com/"))
      .toBe("/admin/diagnostics?room=white-cube&days=7");
    expect(adminNavigationPath("https://attacker.example/admin/access", "https://lieuva.com/")).toBeNull();
    expect(adminNavigationPath("//attacker.example/admin/access", "https://lieuva.com/")).toBeNull();
    expect(adminNavigationPath("/admin/unknown", "https://lieuva.com/")).toBeNull();
  });
});
