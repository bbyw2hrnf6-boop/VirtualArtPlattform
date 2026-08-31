import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  announceCreatorProfileUpdated,
  checkCreatorHandle,
  creatorActionErrorMessage,
  creatorHandleBase,
  creatorImageUrl,
  creatorProfileUrl,
  loadMyCreatorProfile,
  saveCreatorProfile,
  saveCreatorProfileImage,
  type CreatorLink,
  type CreatorProfile,
} from "../../services/creatorProfile";
import { isValidCreatorHandle } from "../../services/spaceRoutes";
import type { AccountSession } from "../../services/accountTypes";
import { trackTelemetry } from "../../services/telemetry";
import {
  discoverCoverSource,
  galleryRepository,
  type GalleryRecord,
} from "../../services/galleryRepository";
import { galleryShareUrl } from "../../services/galleryShareUrl";
import { accountSectionUrl, isPublicProfileSpace } from "./accountPresentation";
import "./creatorProfileSettings.css";

type SaveState = "loading" | "idle" | "checking" | "saving" | "saved" | "error";

function errorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code.includes("already-exists")) return "That handle is already taken. Try another.";
  if (code.includes("failed-precondition")) return "Handle changes are limited to once every seven days.";
  if (code.includes("invalid-argument")) return "Check the handle, bio, and public links.";
  if (code.includes("unauthenticated")) return "Sign in again to save your public profile.";
  return creatorActionErrorMessage(
    error,
    "The Creator profile service is temporarily unavailable. Your existing profile is unchanged; retry shortly.",
  );
}

const emptyLink = (): CreatorLink => ({ label: "", url: "" });

function profileSaveLabel(published: boolean, nextPublic: boolean, saving: boolean): string {
  if (saving) return "Saving…";
  if (published && nextPublic) return "Save profile changes";
  if (nextPublic) return "Save and publish profile";
  return published ? "Save and make private" : "Save private draft";
}

export function CreatorProfileSettings({ account }: { account: AccountSession }) {
  const { uid, displayName, nickname, email } = account;
  const [profile, setProfile] = useState<CreatorProfile>({
    handle: "",
    displayName: displayName ?? "",
    bio: "",
    links: [],
    profilePublic: false,
    imagePresent: false,
  });
  const [links, setLinks] = useState<CreatorLink[]>([emptyLink()]);
  const [originalHandle, setOriginalHandle] = useState("");
  const [published, setPublished] = useState(false);
  const [state, setState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("Loading public profile…");
  const [image, setImage] = useState<File>();
  const [removeImage, setRemoveImage] = useState(false);
  const [spaces, setSpaces] = useState<GalleryRecord[]>([]);
  const handleValid = isValidCreatorHandle(profile.handle);
  const publicUrl = handleValid ? creatorProfileUrl(profile.handle) : "";
  const completeLinks = useMemo(() => links.filter((link) => link.label.trim() || link.url.trim()), [links]);
  const imagePreview = useMemo(() => image ? URL.createObjectURL(image) : "", [image]);
  const profileSpaces = useMemo(
    () => spaces.filter((space) => space.creatorProfileListed),
    [spaces],
  );

  useEffect(() => {
    let active = true;
    void galleryRepository.mine().then((records) => {
      if (!active) return;
      setSpaces(records.filter((record) => isPublicProfileSpace(record, uid)));
    }).catch(() => {
      if (active) setSpaces([]);
    });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    let active = true;
    void loadMyCreatorProfile()
      .then((existing) => {
        if (!active) return;
        if (existing) {
          setProfile(existing);
          setPublished(existing.profilePublic);
          setLinks(existing.links.length ? existing.links : [emptyLink()]);
          setOriginalHandle(existing.handle);
        } else {
          setProfile((current) => ({
            ...current,
            handle: creatorHandleBase({ nickname, displayName, email }),
            displayName: current.displayName || nickname || email?.split("@")[0] || "LIEUVA Creator",
          }));
        }
        setState("idle");
        setMessage(existing ? "Public profile settings loaded." : "Review your suggested identity, then publish your public profile when ready.");
      })
      .catch((error) => {
        if (!active) return;
        setState("error");
        setMessage(errorMessage(error));
      });
    return () => { active = false; };
  }, [uid, displayName, nickname, email]);

  const checkHandle = async () => {
    if (!handleValid) {
      setState("error");
      setMessage("Use 3–30 lowercase letters, numbers, or single hyphens.");
      return;
    }
    if (profile.handle === originalHandle) {
      setState("idle");
      setMessage("This is your current handle.");
      return;
    }
    setState("checking");
    setMessage("Checking handle…");
    try {
      const result = await checkCreatorHandle(profile.handle);
      setState(result.available ? "idle" : "error");
      setMessage(result.available ? `@${result.handle} is available.` : `@${result.handle} is already taken.`);
    } catch (error) {
      setState("error");
      setMessage(errorMessage(error));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!handleValid) {
      setState("error");
      setMessage("Choose a valid handle before saving.");
      return;
    }
    if (completeLinks.some((link) => !link.label.trim() || !/^https:\/\//i.test(link.url.trim()))) {
      setState("error");
      setMessage("Each public link needs a label and a full HTTPS URL.");
      return;
    }
    setState("saving");
    setMessage("Saving public profile…");
    try {
      const result = await saveCreatorProfile({
        ...profile,
        displayName: profile.displayName.trim(),
        bio: profile.bio.trim(),
        links: completeLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      });
      let imagePresent = result.profile.imagePresent;
      setPublished(result.profile.profilePublic);
      announceCreatorProfileUpdated(result.profile);
      if (image || removeImage) {
        try {
          imagePresent = await saveCreatorProfileImage(image, removeImage);
        } catch {
          setProfile(result.profile);
          setLinks(result.profile.links.length ? result.profile.links : [emptyLink()]);
          setOriginalHandle(result.profile.handle);
          setState("error");
          setMessage("Profile saved. The image update failed, so the previous public image is unchanged. Retry when ready.");
          trackTelemetry("creator_profile_saved", {
            mode: result.profile.profilePublic ? "public" : "private",
            outcome: "image_failed",
          });
          return;
        }
      }
      setProfile({ ...result.profile, imagePresent });
      announceCreatorProfileUpdated({ ...result.profile, imagePresent });
      setImage(undefined);
      setRemoveImage(false);
      setLinks(result.profile.links.length ? result.profile.links : [emptyLink()]);
      setOriginalHandle(result.profile.handle);
      setState("saved");
      setMessage(result.profile.profilePublic ? "Public profile saved and live." : "Profile saved privately.");
      trackTelemetry("creator_profile_saved", {
        mode: result.profile.profilePublic ? "public" : "private",
        outcome: originalHandle ? "updated" : "created",
      });
    } catch (error) {
      setState("error");
      setMessage(errorMessage(error));
    }
  };

  const portraitSource = imagePreview
    || (!removeImage && profile.imagePresent && handleValid ? creatorImageUrl(profile.handle) : "");
  const previewLinks = completeLinks.filter((link) => link.label.trim() && /^https:\/\//i.test(link.url.trim()));
  return (
    <form className="creator-settings" onSubmit={(event) => void submit(event)}>
      <div className="creator-settings__intro">
        <p>This is how others see you on LIEUVA. Your public profile keeps your identity, Spaces and studio notes together.</p>
        <span className={published ? "is-live" : ""}>{published ? "✓ Public profile live" : "Private draft"}</span>
      </div>
      <div className="creator-settings__layout">
        <div className="creator-settings__editor">
          <section className="creator-settings__visibility">
            <div>
              <strong>Profile visibility</strong>
              <p>One profile powers your Hub identity, search, follows and studio notes. Space placement stays with each Space in Your Spaces.</p>
            </div>
            <label className="creator-settings__switch">
              <b>Publish profile</b>
              <input type="checkbox" checked={profile.profilePublic} onChange={(event) => setProfile((current) => ({ ...current, profilePublic: event.target.checked }))} />
              <span aria-hidden="true" />
            </label>
          </section>
          <fieldset disabled={state === "loading" || state === "saving"}>
            <legend>Identity</legend>
            <section className="creator-settings__media">
              <div className="creator-settings__portrait" aria-hidden="true">
                {portraitSource
                  ? <img src={portraitSource} alt="" />
                  : <span>{(profile.displayName || "L").slice(0, 1).toUpperCase()}</span>}
              </div>
              <div>
                <strong>Public profile image</strong>
                <p>Separate from your private account image. Cropped and served only while this profile is public.</p>
                <label className="account-profile__upload">Choose image<input type="file" accept="image/avif,image/jpeg,image/png,image/webp" onChange={(event) => { const next = event.target.files?.[0]; setImage(next); if (next) setRemoveImage(false); }} /></label>
                {image && <small>{image.name}</small>}
                {(profile.imagePresent || image) && <button type="button" className="account-profile__remove" onClick={() => { setImage(undefined); setRemoveImage(true); }}>Remove image</button>}
              </div>
            </section>
            <label>Display name<input required maxLength={60} value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label>Handle<div className="creator-settings__handle"><span>lieuva.com/creators/</span><input required minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={profile.handle} onChange={(event) => setProfile((current) => ({ ...current, handle: event.target.value }))} /></div><small>Lowercase letters, numbers and single hyphens. Handle changes are limited to once every seven days.</small></label>
            <button type="button" className="account-reset" disabled={!handleValid || state === "checking"} onClick={() => void checkHandle()}>{state === "checking" ? "Checking…" : "Check availability"}</button>
            <label>Short bio<textarea maxLength={320} rows={5} value={profile.bio} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} /><small>{profile.bio.length}/320 characters</small></label>
          </fieldset>
          <fieldset disabled={state === "loading" || state === "saving"}>
            <legend>Public links</legend>
            <p className="creator-settings__help">Add up to four deliberate links. HTTPS only.</p>
            {links.map((link, index) => (
              <div className="creator-settings__link" key={index}>
                <label>Label<input maxLength={24} placeholder="Website" value={link.label} onChange={(event) => setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
                <label>HTTPS URL<input type="url" placeholder="https://example.com" value={link.url} onChange={(event) => setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /></label>
                {links.length > 1 && <button type="button" aria-label={`Remove link ${index + 1}`} onClick={() => setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
              </div>
            ))}
            {links.length < 4 && <button type="button" className="account-reset" onClick={() => setLinks((current) => [...current, emptyLink()])}>Add link</button>}
          </fieldset>
          <section className="creator-settings__space-placement" aria-labelledby="hub-space-placement-title">
            <div>
              <p className="eyebrow">Hub Space placement</p>
              <h3 id="hub-space-placement-title">Choose Spaces where their settings live.</h3>
              <p>Hub placement is controlled once per Space in Your Spaces. This avoids duplicate switches and keeps visibility, Explore Spaces and Hub placement together.</p>
            </div>
            <dl>
              <div><dt>{profileSpaces.length}</dt><dd>In Hub</dd></div>
              <div><dt>{spaces.length}</dt><dd>Eligible public Spaces</dd></div>
            </dl>
            <a href={accountSectionUrl("rooms", window.location.href)}>Manage Hub placement in Your Spaces <span aria-hidden="true">→</span></a>
          </section>
          <div className="creator-settings__actions">
            <button className="account-primary" disabled={state === "loading" || state === "saving"}>{profileSaveLabel(published, profile.profilePublic, state === "saving")}</button>
            {published && <a href="/creator-hub#creator-profile">Open profile in Creator Hub →</a>}
            {published && publicUrl && <a href={publicUrl}>View public profile ↗</a>}
          </div>
          <p className={`creator-settings__status ${state === "error" ? "is-error" : ""}`} role={state === "error" ? "alert" : "status"}>{message}</p>
        </div>
        <aside className="creator-settings__preview" aria-label="Live public profile preview">
          <div className="creator-settings__preview-label"><span>Live preview</span></div>
          <div className="creator-settings__preview-cover" aria-label="Space preview image">
            {profileSpaces[0] && discoverCoverSource(profileSpaces[0])
              ? <img src={discoverCoverSource(profileSpaces[0])} alt={`${profileSpaces[0].title} Space preview image`} />
              : <span />}
          </div>
          <div className="creator-settings__preview-identity">
            <div className="creator-settings__preview-avatar" aria-hidden="true">
              {portraitSource ? <img src={portraitSource} alt="" /> : (profile.displayName || "L").slice(0, 1).toUpperCase()}
            </div>
            <h4>{profile.displayName.trim() || "Your public name"}</h4>
            <small>@{profile.handle || "your-handle"}</small>
            <p>{profile.bio.trim() || "Your concise public bio will appear here."}</p>
            {previewLinks.length > 0 && <div>{previewLinks.map((link) => <a key={`${link.label}:${link.url}`} href={link.url}>{link.label} ↗</a>)}</div>}
          </div>
          <dl className="creator-settings__preview-stats">
            <div><dt>{profileSpaces.length}</dt><dd>Public Spaces</dd></div>
            <div><dt>{previewLinks.length}</dt><dd>Public links</dd></div>
          </dl>
          <section className="creator-settings__preview-spaces">
            <header><strong>Spaces shown in Creator Hub</strong><span>{profileSpaces.length ? `${profileSpaces.length} shown` : "None selected"}</span></header>
            {profileSpaces.length ? <div>{profileSpaces.slice(0, 3).map((space) => {
              const cover = discoverCoverSource(space);
              return <a href={galleryShareUrl(space.id, window.location.href)} key={space.id}><span>{cover ? <img src={cover} alt={`${space.title} Space preview image`} /> : "Space"}</span><strong>{space.title}</strong><small>Published</small></a>;
            })}</div> : <p>Choose Hub placement in Your Spaces to show a Space here.</p>}
          </section>
        </aside>
      </div>
    </form>
  );
}
