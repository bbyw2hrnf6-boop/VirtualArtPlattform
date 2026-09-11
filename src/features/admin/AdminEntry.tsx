import { useEffect, useState } from "react";
import { getAdminSession, subscribeAdminAuth } from "../../services/adminConsoleService";

/** Hidden by default: neither a local profile nor a client custom claim grants access. */
export default function AdminEntry() {
  const [authorizedUid, setAuthorizedUid] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const check = () => {
      const version = ++generation;
      void getAdminSession().then((session) => {
        if (active && version === generation) setAuthorizedUid(session?.principal.uid ?? null);
      }).catch(() => {
        if (active && version === generation) setAuthorizedUid(null);
      });
    };
    const unsubscribe = subscribeAdminAuth(() => {
      setAuthorizedUid(null);
      check();
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = window.setInterval(onVisibility, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      generation++;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  if (!authorizedUid) return null;
  return <a className="account-admin-entry" href="/admin/overview">
    <span><strong>Admin Console</strong><small>Diagnostics, releases, checks and access management.</small></span>
    <b>Open Admin Console <span aria-hidden="true">→</span></b>
  </a>;
}
