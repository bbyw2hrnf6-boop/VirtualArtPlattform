import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountSession } from "../../services/accountTypes";
import { galleryRepository, type GalleryRecord } from "../../services/galleryRepository";
import { galleryShareUrl } from "../../services/galleryShareUrl";
import { hashApplicationUrl } from "../../services/spaceRoutes";
import { visibilityLabel } from "../../services/galleryAccess";
import type { GalleryInvite } from "../../services/galleryAccess";
import {
  createGalleryProjectId,
  listGalleryDrafts,
  loadGalleryDraft,
  publishedGalleryProjectId,
  saveGalleryDraft,
  type StoredGalleryDraft,
} from "../../services/draftStorage";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { GalleryAccessManager } from "./GalleryAccessManager";
import { firebaseActionErrorMessage } from "../../services/firebaseActionError";
import { CreatorProfileSettings } from "./CreatorProfileSettings";
import {
  galleryDraftSignature,
  publishedProjectState,
} from "./projectWorkspace";
import "./accountDialog.css";

type AccountModule = typeof import("../../services/accountService");

function AccountRooms({ session }: { session: AccountSession }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [rooms, setRooms] = useState<GalleryRecord[]>([]);
  const [drafts, setDrafts] = useState<StoredGalleryDraft[]>([]);
  const [linkedDrafts, setLinkedDrafts] = useState<StoredGalleryDraft[]>([]);
  const [invites, setInvites] = useState<GalleryInvite[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [accessRoom, setAccessRoom] = useState<GalleryRecord>();
  const [manageRoomId, setManageRoomId] = useState<string>();
  const [editConflict, setEditConflict] = useState<{
    room: GalleryRecord;
    editable: Awaited<ReturnType<typeof galleryRepository.editableDraft>>;
    stored: StoredGalleryDraft;
  }>();
  const loadRooms = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const [next, pending, localDrafts] = await Promise.all([
        galleryRepository.mine(),
        galleryRepository.listInvites(),
        listGalleryDrafts(),
      ]);
      setRooms(next);
      setInvites(pending);
      setDrafts(localDrafts.filter((draft) => !draft.publication));
      setLinkedDrafts(localDrafts.filter((draft) => Boolean(draft.publication)));
      setStatus("ready");
    } catch (caught) {
      console.error("Account Spaces unavailable", caught);
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
      const workspace = publishedProjectState(room, stored ?? undefined);
      if (stored && workspace.state === "conflict") {
        setEditConflict({ room, editable, stored });
        return;
      }
      if (!stored || stored.publication?.revision !== editable.target.revision) {
        await saveGalleryDraft(
          projectId,
          editable.draft,
          (stored?.revision ?? 0) + 1,
          editable.target,
          galleryDraftSignature(editable.draft),
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
        hashApplicationUrl(`/create/${editable.draft.templateId}/${projectId}`, window.location.href),
      );
    } catch (caught) {
      console.error("Published Space could not be opened for editing", caught);
      setError(firebaseActionErrorMessage(
        caught,
        "This Space could not be opened for editing. Check your access and retry.",
      ));
    } finally {
      setEditingId(undefined);
    }
  };
  const resolveEditConflict = async (choice: "local" | "live") => {
    if (!editConflict) return;
    setEditingId(editConflict.room.id);
    setError(undefined);
    try {
      const { stored, editable } = editConflict;
      await saveGalleryDraft(
        createGalleryProjectId(stored.templateId),
        stored.draft,
        1,
      );
      const selectedDraft = choice === "local" ? stored.draft : editable.draft;
      await saveGalleryDraft(
        publishedGalleryProjectId(editConflict.room.id),
        selectedDraft,
        stored.revision + 1,
        editable.target,
        galleryDraftSignature(editable.draft),
      );
      setEditConflict(undefined);
      window.location.assign(
        hashApplicationUrl(
          `/create/${selectedDraft.templateId}/${publishedGalleryProjectId(editConflict.room.id)}`,
          window.location.href,
        ),
      );
    } catch (caught) {
      setError(firebaseActionErrorMessage(caught, "The edit conflict could not be resolved."));
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
      console.error("Space lifecycle update failed", caught);
      setError(firebaseActionErrorMessage(
        caught,
        "The Space setting could not be saved.",
      ));
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
      setError(caught instanceof Error ? caught.message : "The Space export could not be prepared.");
    } finally {
      setLifecycleBusyId(undefined);
    }
  };
  const activeRooms = rooms.filter(
    (room) => room.lifecycleStatus === "active" && new Date(room.expiresAt).getTime() > currentTime,
  );
  const publicRooms = activeRooms.filter((room) => room.visibility === "public");
  const sharedRooms = activeRooms.filter((room) => room.ownerId !== session.uid);
  return (
    <section className="account-rooms" aria-labelledby="account-rooms-title">
      <div className="account-rooms__heading">
        <div>
          <p className="eyebrow">Space control</p>
          <h3 id="account-rooms-title">Your Spaces</h3>
        </div>
        <span>{rooms.length}</span>
      </div>
      <div className="account-room-stats" aria-label="Space overview">
        <article><span>Drafts here</span><strong>{drafts.length}</strong></article>
        <article><span>Live</span><strong>{activeRooms.length}</strong></article>
        <article><span>In Discover</span><strong>{publicRooms.length}</strong></article>
        <article><span>Shared with you</span><strong>{sharedRooms.length}</strong></article>
      </div>
      {drafts.length > 0 && (
        <section className="account-local-drafts" aria-labelledby="account-local-drafts-title">
          <div><strong id="account-local-drafts-title">Drafts on this device</strong><span>Private browser storage · not live</span></div>
          <ul>
            {drafts.map((draft) => (
              <li key={draft.projectId}>
                <div><small>{draft.templateId.replaceAll("-", " ")} · saved {new Date(draft.savedAt).toLocaleDateString()}</small><strong>{draft.draft.title || "Untitled Space"}</strong></div>
                <a href={hashApplicationUrl(`/create/${draft.templateId}/${draft.projectId}`, window.location.href)}>Continue draft</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invites.length > 0 && (
        <div className="account-invites" aria-label="Pending Space invitations">
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
      {editConflict && (
        <section className="account-edit-conflict" role="alertdialog" aria-labelledby="edit-conflict-title">
          <p className="eyebrow">Newer live revision found</p>
          <h4 id="edit-conflict-title">Choose what opens in Studio.</h4>
          <p>Your browser has local work based on revision {editConflict.stored.publication?.revision}; the live Space is revision {editConflict.editable.target.revision}. A recovery copy is kept either way.</p>
          <div>
            <button type="button" onClick={() => void resolveEditConflict("local")}>Keep local work</button>
            <button type="button" onClick={() => void resolveEditConflict("live")}>Open latest live</button>
            <button type="button" onClick={() => setEditConflict(undefined)}>Cancel</button>
          </div>
        </section>
      )}
      {status === "loading" ? (
        <p>Loading Spaces…</p>
      ) : status === "error" ? (
        <div className="account-rooms__empty">
          <p>Spaces could not be loaded. Your publications remain stored.</p>
          <button type="button" onClick={() => void loadRooms()}>Retry</button>
        </div>
      ) : rooms.length ? (
        <ul>
          {rooms.map((room) => {
            const role = room.effectiveRole ?? (room.ownerId === session.uid ? "owner" : "viewer");
            const expired = new Date(room.expiresAt).getTime() <= currentTime;
            const available = room.lifecycleStatus === "active" && !expired;
            const workspace = publishedProjectState(
              room,
              linkedDrafts.find((draft) => draft.publication?.id === room.id),
            );
            return <li key={room.id} data-role={role}>
              {available ? <a href={galleryShareUrl(room.id, window.location.href)}>
                <span className="account-room-cover">{room.coverSrc && <img src={room.coverSrc} alt="" />}</span>
                <span className="account-room-copy">
                  <span className="account-room-badges"><i>{visibilityLabel[room.visibility]}</i><i>{role}</i><i data-state={workspace.state}>{workspace.label}</i></span>
                  <strong>{room.title}</strong>
                  <small>{workspace.detail} · Live until {new Date(room.expiresAt).toLocaleDateString()}</small>
                </span>
                <b aria-hidden="true">↗</b>
              </a> : <div className="account-room-summary">
                {room.coverSrc && <img src={room.coverSrc} alt="" />}
                <span><strong>{room.title}</strong>{room.lifecycleStatus === "trashed" ? "Trash" : room.lifecycleStatus === "archived" ? "Archived" : "Expired"}</span>
              </div>}
              {available && (role === "owner" || role === "editor") && <button
                type="button"
                disabled={editingId === room.id}
                aria-label={`Edit ${room.title}`}
                title="Updates this Space under the same live link after review."
                onClick={() => void editRoom(room)}
              >{editingId === room.id ? "…" : "Edit"}</button>}
              {role === "owner" && <button
                type="button"
                aria-expanded={manageRoomId === room.id}
                aria-label={`Space settings for ${room.title}`}
                onClick={() => setManageRoomId((current) => current === room.id ? undefined : room.id)}
              >Settings</button>}
              {role === "owner" && manageRoomId === room.id && (
                <div className="account-room-manage">
                  <div className="account-room-manage__summary">
                    <strong>Space settings</strong>
                    <span>Revision {room.revision} · updated {new Date(room.updatedAt).toLocaleDateString()}</span>
                  </div>
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
                  {available && <button type="button" onClick={() => {
                    const shareUrl = galleryShareUrl(room.id, window.location.href);
                    void navigator.clipboard.writeText(shareUrl).catch(() => {
                      window.prompt("Copy this Space link", shareUrl);
                    });
                  }}>Copy link</button>}
                  {available && <button type="button" onClick={() => setAccessRoom((current) => current?.id === room.id ? undefined : room)}>Access</button>}
                  {available && <button type="button" onClick={() => void exportRoom(room)}>Export</button>}
                  {room.retention === "account-preview" && room.lifecycleStatus !== "trashed" && <button type="button" onClick={() => void updateRoom(room, "renew")}>Renew</button>}
                  {room.lifecycleStatus !== "trashed" && <button type="button" onClick={() => void updateRoom(room, "archive")}>{room.lifecycleStatus === "archived" ? "Unarchive" : "Archive"}</button>}
                  {room.lifecycleStatus === "trashed"
                    ? <button type="button" onClick={() => void updateRoom(room, "restore")}>Restore</button>
                    : <button type="button" className="is-danger" onClick={() => void updateRoom(room, "trash")}>Move to Trash</button>}
                  <span>{lifecycleBusyId === room.id ? "Saving…" : room.lifecycleStatus === "trashed" && room.purgeAt ? `Deletes ${new Date(room.purgeAt).toLocaleDateString()}` : "Changes keep the same public URL"}</span>
                </div>
              )}
            </li>;
          })}
        </ul>
      ) : (
        <div className="account-project-empty">
          <strong>Your first Space starts as a private draft.</strong>
          <p>Choose a template, arrange your work, preview it, then publish when it is ready.</p>
          <a href={hashApplicationUrl("/create", window.location.href)}>Create a Space</a>
        </div>
      )}
      {rooms.length > 0 && (
        <p className="account-rooms__hint">Edit updates the same live URL. Archive hides a Space; Trash keeps a seven-day recovery window.</p>
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
      <div className="account-profile__heading">
        <div><p className="eyebrow">Profile</p><h3>How you appear.</h3></div>
        <span>Visible to collaborators</span>
      </div>
      <fieldset>
        <legend>Identity</legend>
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
        <label>Nickname<input maxLength={32} autoComplete="nickname" placeholder="creator-name" value={nickname} onChange={(event) => setNickname(event.target.value)} /><small>Letters, numbers, dots, dashes, or underscores.</small></label>
        <button className="account-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </fieldset>
      <fieldset>
        <legend>Communication &amp; security</legend>
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
          <span><strong>LIEUVA Preview Letter</strong>Occasional product and roadmap notes. Unsubscribe here or from any email.</span>
        </label>
        {account.email && (
          <button type="button" className="account-reset" disabled={busy} onClick={onResetPassword}>Send password reset email</button>
        )}
      </fieldset>
    </form>
  );
}

function AccountDataRights({
  account,
  busy,
  onExport,
  onDelete,
}: {
  account: AccountSession;
  busy: boolean;
  onExport: () => void;
  onDelete: (password?: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const usesGoogle = account.providers.includes("google.com");
  const needsPassword = account.providers.includes("password") && !usesGoogle;
  return (
    <section className="account-data-rights" aria-labelledby="account-data-rights-title">
      <div className="account-profile__heading">
        <div><p className="eyebrow">Data &amp; rights</p><h3 id="account-data-rights-title">Your data. Your decision.</h3></div>
        <span>Account-wide controls</span>
      </div>
      <article className="account-data-card">
        <div>
          <strong>Download account data</strong>
          <p>Exports your profile, newsletter preference, owned Space manifests, revision/media references, roles, invitations, and account-linked drafts stored in this browser.</p>
        </div>
        <button type="button" disabled={busy} onClick={onExport}>{busy ? "Preparing…" : "Download JSON"}</button>
        <small>This is separate from the existing single-Space .aura.json export. Media files remain in Storage and are represented by paths and metadata.</small>
      </article>
      <article className="account-data-card account-data-card--danger">
        <div>
          <strong>Delete account permanently</strong>
          <p>Deletes Spaces you own, all published revisions and media, profile/avatar, invitations, newsletter state, and your sign-in. Roles in Spaces owned by others are removed; those Spaces are not deleted.</p>
        </div>
        {!confirming ? (
          <button type="button" className="is-danger" disabled={busy} onClick={() => setConfirming(true)}>Start deletion</button>
        ) : (
          <div className="account-delete-confirmation">
            <p><strong>Irreversible.</strong> There is no account-level recovery window in this preview. Export first if you need a record.</p>
            {needsPassword && <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
            {usesGoogle && <p>Google will ask you to confirm your account again.</p>}
            <label>Type DELETE<input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <div>
              <button type="button" onClick={() => {
                setConfirming(false);
                setConfirmation("");
                setPassword("");
              }} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="is-danger"
                disabled={busy || confirmation !== "DELETE" || (needsPassword && !password)}
                onClick={() => void onDelete(password || undefined)}
              >{busy ? "Deleting…" : "Delete account"}</button>
            </div>
          </div>
        )}
        <small>If a server step fails, the UI reports an incomplete operation and keeps authentication until the deletion can be retried.</small>
      </article>
      <p className="account-data-rights__policy">This preview does not yet state a legal backup-retention period or production controller/contact. Those owner decisions remain open. <a href="#/data">Read the current factual data notice.</a></p>
    </section>
  );
}

export function AccountDialog({
  open,
  onClose,
  onSessionChange,
  presentation = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  onSessionChange?: (session: AccountSession | null) => void;
  presentation?: "dialog" | "page";
}) {
  const dialog = useRef<HTMLElement>(null);
  const [service, setService] = useState<AccountModule>();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [mode, setMode] = useState<"signin" | "create">("create");
  const [section, setSection] = useState<"rooms" | "creator" | "account" | "data">("rooms");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  useDialogFocus(dialog, onClose, undefined, open && presentation === "dialog");

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
    <div className={`account-backdrop ${presentation === "page" ? "account-backdrop--page" : ""}`} onMouseDown={(event) => {
      if (presentation === "dialog" && event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialog}
        className={`account-dialog ${presentation === "page" ? "account-dialog--page" : ""}`}
        role={presentation === "dialog" ? "dialog" : undefined}
        aria-modal={presentation === "dialog" ? "true" : undefined}
        aria-labelledby="account-dialog-title"
        tabIndex={-1}
      >
        <button className="account-dialog__close" onClick={onClose} aria-label={presentation === "page" ? "Back to LIEUVA" : "Close account"}>
          {presentation === "page" ? "←" : "×"}
        </button>
        <p className="eyebrow">LIEUVA account</p>
        {account ? (
          <>
            <h2 id="account-dialog-title">Your work.<br /><em>One place.</em></h2>
            <div className="account-overview-card">
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
              <div className="account-plan-card">
                <span>Current access</span>
                <strong>Light Preview</strong>
                <p>{account.emailVerified ? "Publishing and collaboration enabled." : "Verify email to publish."}</p>
                <i>Free now</i>
              </div>
            </div>
            <div className="account-tabs account-tabs--settings" role="tablist" aria-label="Account settings">
              <button role="tab" aria-selected={section === "rooms"} onClick={() => setSection("rooms")}>Projects &amp; Spaces</button>
              <button role="tab" aria-selected={section === "creator"} onClick={() => setSection("creator")}>Public profile</button>
              <button role="tab" aria-selected={section === "account"} onClick={() => setSection("account")}>Account &amp; security</button>
              <button role="tab" aria-selected={section === "data"} onClick={() => setSection("data")}>Data &amp; rights</button>
            </div>
            <a className="account-creator-space-link" href="/creators">
              Open Creator Space <span aria-hidden="true">→</span>
            </a>
            {account.emailVerified && section === "rooms" && <AccountRooms session={account} />}
            {account.emailVerified && section === "creator" && <CreatorProfileSettings account={account} />}
            {account.emailVerified && section === "account" && (
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
                        ? "Subscribed. Your first LIEUVA letter is queued."
                        : "LIEUVA letters enabled."
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
            {section === "data" && (
              <AccountDataRights
                account={account}
                busy={busy}
                onExport={() => void run(async () => {
                  const result = await service?.downloadAccountExport();
                  setMessage(`Account export downloaded${result ? ` with ${result.localDrafts} local linked draft${result.localDrafts === 1 ? "" : "s"}` : ""}.`);
                })}
                onDelete={async (currentPassword) => {
                  if (!service || busy) return;
                  setBusy(true);
                  setError(undefined);
                  setMessage(undefined);
                  try {
                    await service.deleteCurrentAccount(currentPassword);
                    setSession(null);
                    onSessionChange?.(null);
                    onClose();
                    window.location.assign(hashApplicationUrl("/", window.location.href));
                    window.scrollTo(0, 0);
                  } catch (caught) {
                    setError(service.accountErrorMessage(caught));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            {!account.emailVerified && (
              <div className="account-verification">
                <p>Verify your email before publishing or joining a team.</p>
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
            <p className="account-note">LIEUVA Early Access is available now. Public Spaces appear in Discover; unlisted and private Spaces stay in Your Spaces. Professional plans and additional tools are in development—billing is not active.</p>
            <button className="account-secondary" onClick={() => void run(async () => {
              await service?.signOutAccount();
              setSession(null);
              onSessionChange?.(null);
              setMessage("Signed out. Local drafts remain on this device.");
            })} disabled={busy}>Sign out</button>
          </>
        ) : (
          <>
            <h2 id="account-dialog-title">Keep control<br /><em>of your Spaces.</em></h2>
            <p className="account-lead">Build and Walk Preview freely. Sign in with Google or create and verify an account only when you are ready to publish.</p>
            <div className="account-tabs" role="tablist" aria-label="Account action">
              <button role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")}>Create account</button>
              <button role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
            </div>
            <label className="account-newsletter-consent">
              <input type="checkbox" checked={newsletterOptIn} onChange={(event) => setNewsletterOptIn(event.target.checked)} />
              <span><strong>Send me the LIEUVA Preview Letter.</strong>One welcome edition now, plus occasional honest product and roadmap updates. Optional. Unsubscribe anytime. <a href="#/data">Data notice</a>.</span>
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
                    ? "Google account ready. Your LIEUVA letter is queued."
                    : "Google account ready. LIEUVA letters enabled.");
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
                        ? "Account created. Verification and LIEUVA letter queued."
                        : "Account created. Check your email to verify it."
                      : "Signed in. LIEUVA letters enabled.");
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
            <p className="account-note">Your local Project stays on this device while you sign in. A verified account is required to publish and manage live Spaces. <a href="#/data">Read the preview data &amp; rights notice.</a></p>
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
        onClick={() => {
          if (signedIn && controlledOpen === undefined) {
            window.location.assign(hashApplicationUrl("/account", window.location.href));
            window.scrollTo(0, 0);
            return;
          }
          setOpen(true);
        }}
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

export function AccountPage() {
  return (
    <main className="account-page" aria-label="LIEUVA account and Space management">
      <AccountDialog
        open
        presentation="page"
        onClose={() => {
          window.location.assign(hashApplicationUrl("/", window.location.href));
          window.scrollTo(0, 0);
        }}
      />
    </main>
  );
}
