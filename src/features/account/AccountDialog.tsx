import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountSession } from "../../services/accountTypes";
import { galleryRepository, type GalleryRecord } from "../../services/galleryRepository";
import { galleryShareUrl } from "../../services/galleryShareUrl";
import { visibilityLabel } from "../../services/galleryAccess";
import {
  createGalleryProjectId,
  saveGalleryDraft,
} from "../../services/draftStorage";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { GalleryAccessManager } from "./GalleryAccessManager";
import "./accountDialog.css";

type AccountModule = typeof import("../../services/accountService");

function AccountRooms({ session }: { session: AccountSession }) {
  const [rooms, setRooms] = useState<GalleryRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [removingId, setRemovingId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [accessRoom, setAccessRoom] = useState<GalleryRecord>();
  const loadRooms = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const next = await galleryRepository
      .mine()
      setRooms(next);
      setStatus("ready");
    } catch (caught) {
      console.error("Account rooms unavailable", caught);
      setStatus("error");
    }
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadRooms());
    return () => cancelAnimationFrame(frame);
  }, [loadRooms, session.uid]);
  const editRoom = async (room: GalleryRecord) => {
    setEditingId(room.id);
    setError(undefined);
    try {
      const draft = await galleryRepository.editableDraft(room.id);
      const projectId = createGalleryProjectId(draft.templateId);
      await saveGalleryDraft(projectId, draft, 1);
      window.location.assign(`#/create/${draft.templateId}/${projectId}`);
    } catch (caught) {
      console.error("Published room could not be copied to a draft", caught);
      setError("This room could not be prepared for editing. Check its image access and retry.");
    } finally {
      setEditingId(undefined);
    }
  };
  return (
    <section className="account-rooms" aria-labelledby="account-rooms-title">
      <div><h3 id="account-rooms-title">My live rooms</h3><span>{rooms.length}</span></div>
      {status === "loading" ? (
        <p>Loading rooms…</p>
      ) : status === "error" ? (
        <div className="account-rooms__empty">
          <p>Rooms could not be loaded. Your publications remain stored.</p>
          <button type="button" onClick={() => void loadRooms()}>Retry</button>
        </div>
      ) : rooms.length ? (
        <ul>
          {rooms.map((room) => (
            <li key={room.id}>
              <a href={galleryShareUrl(room.id, window.location.href)}>
                {room.coverSrc && <img src={room.coverSrc} alt="" />}
                <span><strong>{room.title}</strong>{visibilityLabel[room.visibility]} · until {new Date(room.expiresAt).toLocaleDateString()}</span>
                <b aria-hidden="true">↗</b>
              </a>
              <button
                type="button"
                disabled={editingId === room.id}
                aria-label={`Edit a copy of ${room.title}`}
                title="Creates a private local draft. The current live link stays unchanged."
                onClick={() => void editRoom(room)}
              >{editingId === room.id ? "…" : "Edit copy"}</button>
              <button
                type="button"
                aria-label={`Manage access for ${room.title}`}
                onClick={() => setAccessRoom((current) => current?.id === room.id ? undefined : room)}
              >Access</button>
              <button
                type="button"
                disabled={removingId === room.id}
                aria-label={`Delete ${room.title}`}
                onClick={() => {
                  if (!window.confirm(`Delete “${room.title}” and its published images?`)) return;
                  setRemovingId(room.id);
                  setError(undefined);
                  void galleryRepository
                    .delete(room.id)
                    .then(() => {
                      setRooms((current) => current.filter((item) => item.id !== room.id));
                      setAccessRoom((current) => current?.id === room.id ? undefined : current);
                    })
                    .catch(() => setError("The room could not be deleted. Retry after checking your connection."))
                    .finally(() => setRemovingId(undefined));
                }}
              >{removingId === room.id ? "…" : "Delete"}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Rooms published with this account will appear here.</p>
      )}
      {rooms.length > 0 && (
        <p className="account-rooms__hint">Edit copy keeps the current live room safe and opens a new versioned local draft.</p>
      )}
      {accessRoom && (
        <GalleryAccessManager
          key={accessRoom.id}
          galleryId={accessRoom.id}
          ownerEmail={session.email}
          initiallyOpen
        />
      )}
      {error && <p className="account-rooms__error" role="alert">{error}</p>}
    </section>
  );
}

function AccountProfileSettings({
  account,
  busy,
  onSave,
  onResetPassword,
}: {
  account: AccountSession;
  busy: boolean;
  onSave: (input: {
    displayName: string;
    nickname: string;
    avatar?: File;
    removeAvatar?: boolean;
  }) => void;
  onResetPassword: () => void;
}) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [nickname, setNickname] = useState(account.nickname ?? "");
  const [avatar, setAvatar] = useState<File>();
  const [removeAvatar, setRemoveAvatar] = useState(false);
  return (
    <form className="account-profile" onSubmit={(event) => {
      event.preventDefault();
      onSave({
        displayName,
        nickname,
        ...(avatar ? { avatar } : {}),
        removeAvatar,
      });
    }}>
      <div className="account-profile__avatar">
        <div className="account-avatar account-avatar--large" aria-hidden="true">
          {account.avatarSrc && !removeAvatar
            ? <img src={account.avatarSrc} alt="" />
            : <span>{(nickname || displayName || account.email || "A").slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <label className="account-profile__upload">Choose image
            <input type="file" accept="image/avif,image/jpeg,image/png,image/webp" onChange={(event) => {
              const next = event.target.files?.[0];
              setAvatar(next);
              if (next) setRemoveAvatar(false);
            }} />
          </label>
          {avatar && <small>{avatar.name}</small>}
          {(account.avatarSrc || avatar) && (
            <button type="button" className="account-profile__remove" onClick={() => {
              setAvatar(undefined);
              setRemoveAvatar(true);
            }}>Remove image</button>
          )}
        </div>
      </div>
      <label>Full name<input maxLength={60} required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>Nickname<input maxLength={32} autoComplete="nickname" placeholder="artist-name" value={nickname} onChange={(event) => setNickname(event.target.value)} /><small>Letters, numbers, dots, dashes, or underscores.</small></label>
      <button className="account-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      {account.email && (
        <button type="button" className="account-reset" disabled={busy} onClick={onResetPassword}>Send password reset email</button>
      )}
    </form>
  );
}

export function AccountDialog({
  open,
  onClose,
  onSessionChange,
}: {
  open: boolean;
  onClose: () => void;
  onSessionChange?: (session: AccountSession | null) => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [service, setService] = useState<AccountModule>();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [mode, setMode] = useState<"signin" | "create">("create");
  const [section, setSection] = useState<"rooms" | "profile">("rooms");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  useDialogFocus(dialog, onClose, undefined, open);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import("../../services/accountService").then((module) => {
      if (!active) return;
      setService(module);
      unsubscribe = module.subscribeAccount((next) => {
        if (!active) return;
        setSession(next);
        onSessionChange?.(next);
        if (next && !next.isAnonymous) {
          void module.hydrateAccountSession(next).then((hydrated) => {
            if (!active || !hydrated) return;
            setSession(hydrated);
            onSessionChange?.(hydrated);
          }).catch((caught) => console.warn("Account profile unavailable.", caught));
        }
      });
      void module.currentAccountSession().then((next) => {
        if (!active) return;
        setSession(next);
        onSessionChange?.(next);
        if (next && !next.isAnonymous) {
          void module.hydrateAccountSession(next).then((hydrated) => {
            if (!active || !hydrated) return;
            setSession(hydrated);
            onSessionChange?.(hydrated);
          }).catch((caught) => console.warn("Account profile unavailable.", caught));
        }
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [onClose, onSessionChange, open]);

  if (!open) return null;
  const account = session && !session.isAnonymous ? session : null;
  const run = async (action: () => Promise<AccountSession | null | void>) => {
    if (!service || busy) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await action();
      if (next) {
        setSession(next);
        onSessionChange?.(next);
      }
    } catch (caught) {
      setError(service.accountErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialog}
        className="account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        tabIndex={-1}
      >
        <button className="account-dialog__close" onClick={onClose} aria-label="Close account">
          ×
        </button>
        <p className="eyebrow">AURA account</p>
        {account ? (
          <>
            <h2 id="account-dialog-title">Your rooms.<br /><em>One identity.</em></h2>
            <div className="account-identity">
              <div className="account-avatar" aria-hidden="true">
                {account.avatarSrc
                  ? <img src={account.avatarSrc} alt="" />
                  : <span>{(account.nickname || account.displayName || account.email || "A").slice(0, 1).toUpperCase()}</span>}
              </div>
              <div>
                <strong>{account.displayName || account.email}</strong>
                {account.nickname && <small>@{account.nickname}</small>}
                <span>{account.email}</span>
                <i className={account.emailVerified ? "is-verified" : ""}>
                  {account.emailVerified ? "Verified account" : "Email verification required"}
                </i>
              </div>
            </div>
            <div className="account-tabs account-tabs--settings" role="tablist" aria-label="Account settings">
              <button role="tab" aria-selected={section === "rooms"} onClick={() => setSection("rooms")}>Rooms</button>
              <button role="tab" aria-selected={section === "profile"} onClick={() => setSection("profile")}>Profile &amp; settings</button>
            </div>
            {account.emailVerified && section === "rooms" && <AccountRooms session={account} />}
            {account.emailVerified && section === "profile" && (
              <AccountProfileSettings
                key={`${account.uid}:${account.displayName ?? ""}:${account.nickname ?? ""}:${account.avatarSrc ?? ""}`}
                account={account}
                busy={busy}
                onSave={(input) => void run(async () => {
                  const next = await service?.saveAccountProfile({
                    ...input,
                  });
                  setMessage("Profile saved.");
                  return next;
                })}
                onResetPassword={() => void run(async () => {
                    await service?.requestPasswordReset(account.email!);
                    setMessage("Password reset email sent.");
                  })}
              />
            )}
            {!account.emailVerified && (
              <div className="account-verification">
                <p>Verify your email before publishing private rooms or joining a team.</p>
                <button onClick={() => void run(async () => {
                  await service?.resendAccountVerification();
                  setMessage("Verification email sent.");
                })} disabled={busy}>Resend email</button>
                <button onClick={() => void run(async () => {
                  const next = await service?.refreshAccount();
                  setMessage(next?.emailVerified ? "Email verified." : "Verification is not complete yet.");
                  return next;
                })} disabled={busy}>I verified</button>
              </div>
            )}
            <p className="account-note">Public rooms appear in Discover. Unlisted and private rooms stay in My rooms. Billing is not active.</p>
            <button className="account-secondary" onClick={() => void run(async () => {
              await service?.signOutAccount();
              setSession(null);
              onSessionChange?.(null);
              setMessage("Signed out. Local drafts remain on this device.");
            })} disabled={busy}>Sign out</button>
          </>
        ) : (
          <>
            <h2 id="account-dialog-title">Keep control<br /><em>of your rooms.</em></h2>
            <p className="account-lead">Guests can publish one public ten-day link. A verified account unlocks private, unlisted, and team access.</p>
            <div className="account-tabs" role="tablist" aria-label="Account action">
              <button role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")}>Create account</button>
              <button role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
            </div>
            <button className="account-google" disabled={!service || busy} onClick={() => void run(async () => {
              const next = mode === "create"
                ? await service?.createOrUpgradeGoogleAccount()
                : await service?.signInGoogleAccount();
              setMessage("Google account ready.");
              return next;
            })}>Continue with Google</button>
            <div className="account-divider"><span>or use email</span></div>
            <form onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const next = mode === "create"
                  ? await service?.createOrUpgradeEmailAccount(email, password)
                  : await service?.signInEmailAccount(email, password);
                setMessage(mode === "create" ? "Account created. Check your email to verify it." : "Signed in.");
                return next;
              });
            }}>
              <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <button className="account-primary" disabled={!service || busy}>{busy ? "Working…" : mode === "create" ? "Create account" : "Sign in"}</button>
            </form>
            {mode === "signin" && (
              <button className="account-reset" disabled={!email || busy} onClick={() => void run(async () => {
                await service?.requestPasswordReset(email);
                setMessage("Password reset email sent.");
              })}>Forgot password?</button>
            )}
            <p className="account-note">Creating an account upgrades the current guest identity, so its rooms stay under the same owner. Signing into an existing account does not transfer older guest publications. <a href="#/data">Read the preview data &amp; rights notice.</a></p>
          </>
        )}
        {(message || error) && <p className={error ? "account-message is-error" : "account-message"} role={error ? "alert" : "status"}>{error || message}</p>}
      </section>
    </div>
  );
}

export function AccountButton({
  light = false,
  onSessionChange,
  open: controlledOpen,
  onOpenChange,
}: {
  light?: boolean;
  onSessionChange?: (session: AccountSession | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [session, setSession] = useState<AccountSession | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  const handleSessionChange = useCallback(
    (next: AccountSession | null) => {
      setSession(next);
      onSessionChange?.(next);
    },
    [onSessionChange],
  );
  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import("../../services/accountService").then((service) => {
      if (!active) return;
      const sync = (next: AccountSession | null) => {
        if (!active) return;
        handleSessionChange(next);
        if (next && !next.isAnonymous) {
          void service.hydrateAccountSession(next).then((hydrated) => {
            if (active) handleSessionChange(hydrated);
          }).catch((caught) => console.warn("Account profile unavailable.", caught));
        }
      };
      unsubscribe = service.subscribeAccount(sync);
      void service.currentAccountSession().then(sync);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [handleSessionChange]);
  const signedIn = Boolean(session && !session.isAnonymous);
  const accountLabel = signedIn
    ? session?.nickname || session?.displayName?.split(" ")[0] || "Account"
    : "Account";
  return (
    <>
      <button
        type="button"
        className={`account-entry ${light ? "account-entry--light" : ""} ${signedIn ? "is-signed-in" : ""}`}
        onClick={() => setOpen(true)}
        title={signedIn ? `Signed in as ${session?.email || accountLabel}` : "Open account"}
      >
        {signedIn && (
          <span className="account-entry__avatar" aria-hidden="true">
            {session?.avatarSrc
              ? <img src={session.avatarSrc} alt="" />
              : (accountLabel.slice(0, 1).toUpperCase())}
          </span>
        )}
        <span>{accountLabel}</span>
      </button>
      <AccountDialog
        open={open}
        onClose={close}
        onSessionChange={handleSessionChange}
      />
    </>
  );
}
