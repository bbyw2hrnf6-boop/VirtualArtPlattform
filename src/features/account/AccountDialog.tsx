import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountSession } from "../../services/accountTypes";
import { galleryRepository, type GalleryRecord } from "../../services/galleryRepository";
import { galleryShareUrl } from "../../services/galleryShareUrl";
import { visibilityLabel } from "../../services/galleryAccess";
import type { GalleryInvite } from "../../services/galleryAccess";
import {
  createGalleryProjectId,
  loadGalleryDraft,
  publishedGalleryProjectId,
  saveGalleryDraft,
} from "../../services/draftStorage";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { GalleryAccessManager } from "./GalleryAccessManager";
import "./accountDialog.css";

type AccountModule = typeof import("../../services/accountService");

function AccountRooms({ session }: { session: AccountSession }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [rooms, setRooms] = useState<GalleryRecord[]>([]);
  const [invites, setInvites] = useState<GalleryInvite[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [accessRoom, setAccessRoom] = useState<GalleryRecord>();
  const [manageRoomId, setManageRoomId] = useState<string>();
  const loadRooms = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const [next, pending] = await Promise.all([
        galleryRepository.mine(),
        galleryRepository.listInvites(),
      ]);
      setRooms(next);
      setInvites(pending);
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
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const editRoom = async (room: GalleryRecord) => {
    setEditingId(room.id);
    setError(undefined);
    try {
      const editable = await galleryRepository.editableDraft(room.id);
      const projectId = publishedGalleryProjectId(room.id);
      const stored = await loadGalleryDraft(projectId);
      if (!stored || stored.publication?.revision !== editable.target.revision) {
        if (stored) {
          await saveGalleryDraft(
            createGalleryProjectId(stored.templateId),
            stored.draft,
            1,
          );
        }
        await saveGalleryDraft(
          projectId,
          editable.draft,
          (stored?.revision ?? 0) + 1,
          editable.target,
        );
      } else if (stored.publication.role !== editable.target.role) {
        await saveGalleryDraft(
          projectId,
          stored.draft,
          stored.revision + 1,
          editable.target,
        );
      }
      window.location.assign(
        `#/create/${editable.draft.templateId}/${projectId}`,
      );
    } catch (caught) {
      console.error("Published room could not be opened for editing", caught);
      setError("This room could not be opened for editing. Check your access and retry.");
    } finally {
      setEditingId(undefined);
    }
  };
  const updateRoom = async (
    room: GalleryRecord,
    action: "archive" | "restore" | "renew" | "trash" | "visibility",
    visibility?: GalleryRecord["visibility"],
  ) => {
    if (action === "trash" && !window.confirm(`Move “${room.title}” to Trash? You can restore it for seven days.`)) return;
    setLifecycleBusyId(room.id);
    setError(undefined);
    try {
      await galleryRepository.updateLifecycle(room.id, action, visibility);
      await loadRooms();
    } catch (caught) {
      console.error("Room lifecycle update failed", caught);
      setError(caught instanceof Error ? caught.message : "The room setting could not be saved.");
    } finally {
      setLifecycleBusyId(undefined);
    }
  };
  const exportRoom = async (room: GalleryRecord) => {
    setLifecycleBusyId(room.id);
    setError(undefined);
    try {
      const editable = await galleryRepository.editableDraft(room.id);
      const blob = new Blob([JSON.stringify({
        format: "aura-gallery-export",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        galleryId: room.id,
        revision: room.revision,
        visibility: room.visibility,
        draft: editable.draft,
      }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${room.id}-r${room.revision}.aura.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room export could not be prepared.");
    } finally {
      setLifecycleBusyId(undefined);
    }
  };
  return (
    <section className="account-rooms" aria-labelledby="account-rooms-title">
      <div><h3 id="account-rooms-title">My &amp; shared rooms</h3><span>{rooms.length}</span></div>
      {invites.length > 0 && (
        <div className="account-invites" aria-label="Pending room invitations">
          <strong>Invitations</strong>
          {invites.map((invite) => (
            <div key={invite.id}>
              <span>{invite.galleryTitle}<small>{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</small></span>
              <button type="button" disabled={lifecycleBusyId === invite.id} onClick={() => {
                setLifecycleBusyId(invite.id);
                setError(undefined);
                void galleryRepository.acceptInvite(invite.id)
                  .then(loadRooms)
                  .catch((caught) => setError(caught instanceof Error ? caught.message : "The invitation could not be accepted."))
                  .finally(() => setLifecycleBusyId(undefined));
              }}>{lifecycleBusyId === invite.id ? "…" : "Accept"}</button>
            </div>
          ))}
        </div>
      )}
      {status === "loading" ? (
        <p>Loading rooms…</p>
      ) : status === "error" ? (
        <div className="account-rooms__empty">
          <p>Rooms could not be loaded. Your publications remain stored.</p>
          <button type="button" onClick={() => void loadRooms()}>Retry</button>
        </div>
      ) : rooms.length ? (
        <ul>
          {rooms.map((room) => {
            const role = room.effectiveRole ?? (room.ownerId === session.uid ? "owner" : "viewer");
            const expired = new Date(room.expiresAt).getTime() <= currentTime;
            const available = room.lifecycleStatus === "active" && !expired;
            return <li key={room.id} data-role={role}>
              {available ? <a href={galleryShareUrl(room.id, window.location.href)}>
                {room.coverSrc && <img src={room.coverSrc} alt="" />}
                <span><strong>{room.title}</strong>{visibilityLabel[room.visibility]} · {role} · until {new Date(room.expiresAt).toLocaleDateString()}</span>
                <b aria-hidden="true">↗</b>
              </a> : <div className="account-room-summary">
                {room.coverSrc && <img src={room.coverSrc} alt="" />}
                <span><strong>{room.title}</strong>{room.lifecycleStatus === "trashed" ? "Trash" : room.lifecycleStatus === "archived" ? "Archived" : "Expired"}</span>
              </div>}
              {available && (role === "owner" || role === "editor") && <button
                type="button"
                disabled={editingId === room.id}
                aria-label={`Edit ${room.title}`}
                title="Updates this room under the same live link after review."
                onClick={() => void editRoom(room)}
              >{editingId === room.id ? "…" : "Edit"}</button>}
              {role === "owner" && <button
                type="button"
                aria-expanded={manageRoomId === room.id}
                aria-label={`Manage ${room.title}`}
                onClick={() => setManageRoomId((current) => current === room.id ? undefined : room.id)}
              >Manage</button>}
              {role === "owner" && manageRoomId === room.id && (
                <div className="account-room-manage">
                  <label>Visibility
                    <select
                      value={room.visibility}
                      disabled={lifecycleBusyId === room.id || room.lifecycleStatus === "trashed"}
                      onChange={(event) => void updateRoom(room, "visibility", event.target.value as GalleryRecord["visibility"])}
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  {available && <button type="button" onClick={() => setAccessRoom((current) => current?.id === room.id ? undefined : room)}>Access</button>}
                  {available && <button type="button" onClick={() => void exportRoom(room)}>Export</button>}
                  {room.retention === "account-preview" && room.lifecycleStatus !== "trashed" && <button type="button" onClick={() => void updateRoom(room, "renew")}>Renew</button>}
                  {room.lifecycleStatus !== "trashed" && <button type="button" onClick={() => void updateRoom(room, "archive")}>{room.lifecycleStatus === "archived" ? "Unarchive" : "Archive"}</button>}
                  {room.lifecycleStatus === "trashed"
                    ? <button type="button" onClick={() => void updateRoom(room, "restore")}>Restore</button>
                    : <button type="button" className="is-danger" onClick={() => void updateRoom(room, "trash")}>Move to Trash</button>}
                  <span>{lifecycleBusyId === room.id ? "Saving…" : room.lifecycleStatus === "trashed" && room.purgeAt ? `Deletes ${new Date(room.purgeAt).toLocaleDateString()}` : `Revision ${room.revision}`}</span>
                </div>
              )}
            </li>;
          })}
        </ul>
      ) : (
        <p>Rooms published with this account will appear here.</p>
      )}
      {rooms.length > 0 && (
        <p className="account-rooms__hint">Edit updates the same live URL. Archive hides a room; Trash keeps a seven-day recovery window.</p>
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
  onNewsletterChange,
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
  onNewsletterChange: (subscribed: boolean) => Promise<boolean>;
}) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [nickname, setNickname] = useState(account.nickname ?? "");
  const [avatar, setAvatar] = useState<File>();
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(
    Boolean(account.newsletterSubscribed),
  );
  const [newsletterBusy, setNewsletterBusy] = useState(false);
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
      <label className="account-newsletter-setting">
        <input
          type="checkbox"
          checked={newsletterSubscribed}
          disabled={busy || newsletterBusy}
          onChange={(event) => {
            const next = event.target.checked;
            setNewsletterBusy(true);
            void onNewsletterChange(next).then((saved) => {
              if (saved) setNewsletterSubscribed(next);
            }).finally(() => setNewsletterBusy(false));
          }}
        />
        <span><strong>AURA Preview Letter</strong>Occasional product and roadmap notes. Unsubscribe here or from any email.</span>
      </label>
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
  const [displayName, setDisplayName] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
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
                onNewsletterChange={async (subscribed) => {
                  if (!service || busy) return false;
                  setBusy(true);
                  setError(undefined);
                  setMessage(undefined);
                  try {
                    const result = await service.setNewsletterPreference(
                      subscribed,
                      "account-settings",
                    );
                    const next = { ...account, newsletterSubscribed: subscribed };
                    setSession(next);
                    onSessionChange?.(next);
                    setMessage(subscribed
                      ? result.welcomeQueued
                        ? "Subscribed. Your first AURA letter is queued."
                        : "AURA letters enabled."
                      : "Newsletter unsubscribed. Your account stays active.");
                    return true;
                  } catch (caught) {
                    setError(service.accountErrorMessage(caught));
                    return false;
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            {!account.emailVerified && (
              <div className="account-verification">
                <p>Verify your email before publishing private rooms or joining a team.</p>
                <button onClick={() => void run(async () => {
                  await service?.resendAccountVerification();
                  setMessage("Verification email queued. Check your inbox shortly.");
                })} disabled={busy}>Resend email</button>
                <button onClick={() => void run(async () => {
                  const next = await service?.refreshAccount();
                  setMessage(next?.emailVerified ? "Email verified." : "Verification is not complete yet.");
                  return next;
                })} disabled={busy}>I verified</button>
              </div>
            )}
            <p className="account-note">AURA Light Preview is free now. Public rooms appear in Discover; unlisted and private rooms stay in My rooms. Paid plans and additional professional tools are coming later—billing is not active.</p>
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
            <label className="account-newsletter-consent">
              <input type="checkbox" checked={newsletterOptIn} onChange={(event) => setNewsletterOptIn(event.target.checked)} />
              <span><strong>Send me the AURA Preview Letter.</strong>One welcome edition now, plus occasional honest product and roadmap updates. Optional. Unsubscribe anytime. <a href="#/data">Data notice</a>.</span>
            </label>
            <button className="account-google" disabled={!service || busy} onClick={() => void run(async () => {
              const next = mode === "create"
                ? await service?.createOrUpgradeGoogleAccount()
                : await service?.signInGoogleAccount();
              if (newsletterOptIn && next) {
                try {
                  const result = await service?.setNewsletterPreference(
                    true,
                    mode === "create" ? "google-create" : "google-signin",
                  );
                  setMessage(result?.welcomeQueued
                    ? "Google account ready. Your AURA letter is queued."
                    : "Google account ready. AURA letters enabled.");
                } catch {
                  setMessage("Google account ready. Newsletter signup needs a retry in Profile & settings.");
                }
              } else setMessage("Google account ready.");
              return next;
            })}>Continue with Google</button>
            <div className="account-divider"><span>or use email</span></div>
            <form onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const next = mode === "create"
                  ? await service?.createOrUpgradeEmailAccount(email, password, displayName)
                  : await service?.signInEmailAccount(email, password);
                if (newsletterOptIn && next) {
                  try {
                    const result = await service?.setNewsletterPreference(
                      true,
                      mode === "create" ? "email-create" : "email-signin",
                    );
                    setMessage(mode === "create"
                      ? result?.welcomeQueued
                        ? "Account created. Verification and AURA letter queued."
                        : "Account created. Check your email to verify it."
                      : "Signed in. AURA letters enabled.");
                  } catch {
                    setMessage(mode === "create"
                      ? "Account created. Check your email to verify it. Newsletter signup needs a retry in Profile & settings."
                      : "Signed in. Newsletter signup needs a retry in Profile & settings.");
                  }
                } else setMessage(mode === "create" ? "Account created. Check your email to verify it." : "Signed in.");
                return next;
              });
            }}>
              {mode === "create" && <label>Your name<input type="text" autoComplete="name" maxLength={60} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}
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
