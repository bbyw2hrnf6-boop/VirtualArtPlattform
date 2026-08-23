import { useEffect, useState } from "react";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { Logo } from "../../components/Logo";
import { firebaseAuth } from "../../services/firebase";
import "./authActionPage.css";

type ActionState =
  | { status: "working" }
  | { status: "verified" }
  | { status: "reset-ready"; email: string }
  | { status: "reset-complete" }
  | { status: "error"; message: string };

function actionParameters() {
  const parameters = new URLSearchParams(window.location.search);
  return {
    mode: parameters.get("mode"),
    code: parameters.get("oobCode"),
    continueUrl: parameters.get("continueUrl"),
  };
}

function safeContinueUrl(value: string | null) {
  const fallback = `${window.location.origin}${window.location.pathname}#/create`;
  if (!value) return fallback;
  try {
    const target = new URL(value);
    return target.origin === window.location.origin ? target.href : fallback;
  } catch {
    return fallback;
  }
}

function readableActionError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
  if (code.includes("expired-action-code"))
    return "This link has expired. Return to Account and request a new email.";
  if (code.includes("invalid-action-code"))
    return "This link is invalid or was already used.";
  if (code.includes("weak-password"))
    return "Choose a password with at least six characters.";
  return "LIEUVA could not complete this account action. Request a fresh email and retry.";
}

export default function AuthActionPage() {
  const [{ mode, code, continueUrl }] = useState(actionParameters);
  const [state, setState] = useState<ActionState>({ status: "working" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string>();
  const returnUrl = safeContinueUrl(continueUrl);

  useEffect(() => {
    if (!code || !mode) {
      queueMicrotask(() => setState({
        status: "error",
        message: "This account link is incomplete.",
      }));
      return;
    }
    let active = true;
    if (mode === "verifyEmail") {
      void applyActionCode(firebaseAuth, code).then(() => {
        if (active) setState({ status: "verified" });
      }).catch((error) => {
        if (active) setState({ status: "error", message: readableActionError(error) });
      });
    } else if (mode === "resetPassword") {
      void verifyPasswordResetCode(firebaseAuth, code).then((email) => {
        if (active) setState({ status: "reset-ready", email });
      }).catch((error) => {
        if (active) setState({ status: "error", message: readableActionError(error) });
      });
    } else {
      queueMicrotask(() => setState({
        status: "error",
        message: "This account action is not supported by the LIEUVA preview yet.",
      }));
    }
    return () => {
      active = false;
    };
  }, [code, mode]);

  return (
    <main className="auth-action-page">
      <div className="auth-action-brand"><Logo /><span>LIEUVA Light Preview</span></div>
      <section aria-live="polite">
        <p className="eyebrow">LIEUVA account</p>
        {state.status === "working" && <><h1>One moment.<br /><em>Securing your space.</em></h1><p>Checking the account link…</p></>}
        {state.status === "verified" && <><h1>Email verified.<br /><em>Now create a Space.</em></h1><p>Your LIEUVA identity is ready. Account preview access can now keep public, unlisted, and private Spaces together.</p><a className="button button--dark" href={returnUrl}>Enter LIEUVA <span>↗</span></a></>}
        {state.status === "reset-ready" && (
          <>
            <h1>Choose a new<br /><em>password.</em></h1>
            <p>Reset access for {state.email}.</p>
            <form onSubmit={(event) => {
              event.preventDefault();
              if (!code || password !== confirmPassword) {
                setResetError("The passwords do not match.");
                return;
              }
              setResetBusy(true);
              setResetError(undefined);
              void confirmPasswordReset(firebaseAuth, code, password).then(() => {
                setState({ status: "reset-complete" });
              }).catch((error) => {
                setResetError(readableActionError(error));
              }).finally(() => setResetBusy(false));
            }}>
              <label>New password<input type="password" minLength={6} required autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setResetError(undefined); }} /></label>
              <label>Repeat password<input type="password" minLength={6} required autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setResetError(undefined); }} /></label>
              {resetError && <p className="auth-action-form-error" role="alert">{resetError}</p>}
              <button className="button button--dark" disabled={resetBusy}>{resetBusy ? "Saving…" : "Save password"}</button>
            </form>
          </>
        )}
        {state.status === "reset-complete" && <><h1>Password saved.<br /><em>Welcome back.</em></h1><p>Your Projects and local drafts stay unchanged.</p><a className="button button--dark" href={returnUrl}>Return to LIEUVA <span>↗</span></a></>}
        {state.status === "error" && <><h1>Link not complete.<br /><em>Your work is safe.</em></h1><p role="alert">{state.message}</p><a className="button button--dark" href={`${window.location.origin}${window.location.pathname}`}>Return to LIEUVA</a></>}
      </section>
      <footer><span>© 2026 LIEUVA</span><a href={`${window.location.origin}${window.location.pathname}#/data`}>Data &amp; rights</a></footer>
    </main>
  );
}
