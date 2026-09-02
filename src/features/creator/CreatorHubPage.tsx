import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Logo } from "../../components/Logo";
import { AccountButton } from "../account/AccountDialog";
import { accountSectionUrl } from "../account/accountPresentation";
import type { AccountSession } from "../../services/accountTypes";
import { discoverCoverSource, galleryRepository, type GalleryRecord } from "../../services/galleryRepository";
import {
  announceCreatorProfileUpdated,
  checkCreatorHandle,
  CREATOR_PROFILE_UPDATED_EVENT,
  creatorActionErrorMessage,
  createCreatorPost,
  creatorHandleBase,
  creatorImageUrl,
  creatorNotificationPostAnchor,
  loadCreatorHome,
  mergeCreatorHomeViewerState,
  loadMyCreatorProfile,
  interactCreatorPost,
  manageCreatorBlock,
  markCreatorNotificationsRead,
  saveCreatorProfile,
  type CreatorComment,
  type CreatorHomePayload,
  type CreatorNotification,
  type CreatorPost,
  type CreatorProfile,
  type PublicCreatorDirectoryEntry,
  unreadCreatorNotificationCount,
} from "../../services/creatorProfile";
import { creatorCanonicalUrl, creatorExperienceNavigationPath, spaceCanonicalUrl } from "../../services/spaceRoutes";
import {
  CREATOR_HUB_TARGETS,
  creatorHubSectionAtViewportAnchor,
  creatorHubSectionFromHash,
  creatorHubTargetFromHash,
  type CreatorHubSection,
} from "./creatorHubNavigation";
import CreatorDirectoryPage from "./CreatorDirectoryPage";
import CreatorProfilePage from "./CreatorProfilePage";
import { CreatorReportDialog, type CreatorReportReason } from "./CreatorReportDialog";
import "./creatorHub.css";
import "./creatorHubMobile.css";

function relativeDate(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(elapsed / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function CreatorMark({ creator, allowImage = true }: { creator: Pick<PublicCreatorDirectoryEntry, "displayName" | "handle" | "imagePresent">; allowImage?: boolean }) {
  return allowImage && creator.imagePresent
    ? <img src={creatorImageUrl(creator.handle)} alt="" loading="lazy" />
    : <>{creator.displayName.slice(0, 1).toUpperCase()}</>;
}

type HubIconName = "home" | "feed" | "creators" | "spaces" | "account" | "bell" | "search" | "heart" | "comment";

function HubIcon({ name }: { name: HubIconName }) {
  const paths: Record<HubIconName, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
    feed: <><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    creators: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.4-4.4 2.1-6.5 5.5-6.5s5.1 2.1 5.5 6.5M14 14.5c3.8-.7 6.1 1.2 6.5 5.5"/></>,
    spaces: <><path d="m12 2 8.5 5v10L12 22l-8.5-5V7z"/><path d="m3.5 7 8.5 5 8.5-5M12 12v10"/></>,
    account: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.5-5.2 2.8-7.7 7.5-7.7s7 2.5 7.5 7.7"/></>,
    bell: <><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 6.5 2.5 6.5H4S6.5 15 6.5 9Z"/><path d="M9.5 19a3 3 0 0 0 5 0"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
    heart: <path d="M20.7 5.8c-1.8-2.1-5.1-1.8-6.8.3L12 8.4l-1.9-2.3C8.4 4 5.1 3.7 3.3 5.8 1.4 8 1.7 11.3 3.8 13.3L12 21l8.2-7.7c2.1-2 2.4-5.3.5-7.5Z"/>,
    comment: <><path d="M20.5 11.5a8.5 8.5 0 0 1-9 8.5 9.2 9.2 0 0 1-3.7-.9L3 20.5l1.5-4.4A8.4 8.4 0 1 1 20.5 11.5Z"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function SpaceCover({ src, fallback = "Space preview preparing" }: { src?: string | null; fallback?: string }) {
  return <>
    <span className="creator-hub__cover-fallback" aria-hidden="true">{fallback}</span>
    {src ? <img
      src={src}
      alt=""
      loading="lazy"
      onError={(event) => { event.currentTarget.style.display = "none"; }}
    /> : null}
  </>;
}

export type CreatorHubView =
  | { kind: "home" }
  | { kind: "directory" }
  | { kind: "settings" }
  | { kind: "profile"; handle: string };

type CreatorHubPageProps = {
  view?: CreatorHubView;
  onNavigate?: (path: string) => void;
};

export default function CreatorHubPage({
  view = { kind: "home" },
  onNavigate,
}: CreatorHubPageProps) {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [spaces, setSpaces] = useState<GalleryRecord[]>([]);
  const [mySpaces, setMySpaces] = useState<GalleryRecord[]>([]);
  const [home, setHome] = useState<CreatorHomePayload>();
  const [myProfile, setMyProfile] = useState<CreatorProfile | null>();
  const [homeStatus, setHomeStatus] = useState<"loading" | "error">();
  const [mySpacesStatus, setMySpacesStatus] = useState<"loading" | "error">();
  const [profileStatus, setProfileStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [profileRefresh, setProfileRefresh] = useState(0);
  const [postBody, setPostBody] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [postNotice, setPostNotice] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [activePost, setActivePost] = useState<string>();
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postActions, setPostActions] = useState<Record<string, string>>({});
  const [reportPost, setReportPost] = useState<CreatorPost>();
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");
  const [newComments, setNewComments] = useState<Record<string, CreatorComment[]>>({});
  const [notificationNotice, setNotificationNotice] = useState("");
  const [activeSection, setActiveSection] = useState<CreatorHubSection>(() => creatorHubSectionFromHash(window.location.hash));
  const dashboardView = view.kind === "home";
  const settingsView = view.kind === "settings";
  const creatorsView = view.kind === "directory" || view.kind === "profile";
  const sessionUid = session && !session.isAnonymous ? session.uid : "";
  const profileSettingsUrl = accountSectionUrl("creator", window.location.href);

  useEffect(() => {
    if (!settingsView) return;
    window.location.replace(profileSettingsUrl);
  }, [profileSettingsUrl, settingsView]);

  useEffect(() => {
    if (!dashboardView) return;
    let hashFrame = 0;
    let mountFrame = 0;
    let settleFrame = 0;
    let scrollFrame = 0;
    let hashNavigationPending = false;

    const cancelHashFrames = () => {
      window.cancelAnimationFrame(hashFrame);
      window.cancelAnimationFrame(mountFrame);
      window.cancelAnimationFrame(settleFrame);
    };
    const syncSectionFromScroll = () => {
      scrollFrame = 0;
      const root = document.querySelector<HTMLElement>(".creator-hub");
      const scrollOffset = Number.parseFloat(root ? getComputedStyle(root).getPropertyValue("--hub-scroll-offset") : "") || 84;
      const targets = CREATOR_HUB_TARGETS.flatMap(({ id, section }) => {
        const element = document.getElementById(id);
        return element ? [{ section, top: element.getBoundingClientRect().top }] : [];
      });
      const nextSection = creatorHubSectionAtViewportAnchor(targets, scrollOffset);
      setActiveSection((current) => current === nextSection ? current : nextSection);
    };
    const scheduleScrollSync = () => {
      if (hashNavigationPending || scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(syncSectionFromScroll);
    };
    const scrollToHashTarget = () => {
      const target = creatorHubTargetFromHash(window.location.hash);
      if (!target) {
        hashNavigationPending = false;
        scheduleScrollSync();
        return;
      }

      cancelHashFrames();
      hashNavigationPending = true;
      setActiveSection(creatorHubSectionFromHash(window.location.hash));
      hashFrame = window.requestAnimationFrame(() => {
        mountFrame = window.requestAnimationFrame(() => {
          document.getElementById(target)?.scrollIntoView({ block: "start" });
          settleFrame = window.requestAnimationFrame(() => {
            hashNavigationPending = false;
            scheduleScrollSync();
          });
        });
      });
    };

    window.addEventListener("hashchange", scrollToHashTarget);
    window.addEventListener("scroll", scheduleScrollSync, { passive: true });
    window.addEventListener("resize", scheduleScrollSync);
    scrollToHashTarget();
    return () => {
      cancelHashFrames();
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("hashchange", scrollToHashTarget);
      window.removeEventListener("scroll", scheduleScrollSync);
      window.removeEventListener("resize", scheduleScrollSync);
    };
  }, [dashboardView]);

  useEffect(() => {
    if (!dashboardView) return;
    void galleryRepository.discover().then(setSpaces).catch(() => setSpaces([]));
  }, [dashboardView]);

  useEffect(() => {
    if (!sessionUid) {
      setHome(undefined);
      setMySpaces([]);
      setHomeStatus(undefined);
      setMySpacesStatus(undefined);
      return;
    }
    let active = true;
    setProfileStatus("loading");
    setMyProfile(undefined);
    if (dashboardView) {
      setMySpacesStatus("loading");
      void galleryRepository.mine()
        .then((records) => {
          if (active) {
            setMySpaces(records.filter((record) => (
              record.lifecycleStatus !== "trashed"
              && (record.ownerId === sessionUid || record.effectiveRole === "owner")
            )));
            setMySpacesStatus(undefined);
          }
        })
        .catch(() => { if (active) { setMySpaces([]); setMySpacesStatus("error"); } });
    }
    void loadMyCreatorProfile()
      .then((profile) => {
        if (!active) return;
        setMyProfile(profile);
        setProfileStatus("ready");
        setProfileNotice("");
      })
      .catch((error) => {
        if (!active) return;
        setMyProfile(undefined);
        setProfileStatus("error");
        setProfileNotice(creatorActionErrorMessage(error, "Profile refresh failed. Retry."));
      });
    return () => { active = false; };
  }, [dashboardView, profileRefresh, sessionUid]);

  useEffect(() => {
    if (!sessionUid) return;
    let active = true;
    let inFlight = false;
    const refreshHome = async (initial = false) => {
      if (inFlight) return;
      inFlight = true;
      if (initial) setHomeStatus("loading");
      try {
        const nextHome = await loadCreatorHome(initial);
        if (active) {
          setHome((current) => mergeCreatorHomeViewerState(current, nextHome));
          setHomeStatus(undefined);
        }
      } catch {
        if (active && initial) setHomeStatus("error");
      } finally {
        inFlight = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshHome();
    };
    void refreshHome(true);
    const poll = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [profileRefresh, sessionUid]);

  useEffect(() => {
    const syncProfile = (event: Event) => {
      const profile = (event as CustomEvent<CreatorProfile>).detail;
      if (profile) {
        setMyProfile(profile);
        setProfileStatus("ready");
        void loadCreatorHome().then((nextHome) => setHome((current) => mergeCreatorHomeViewerState(current, nextHome))).catch(() => undefined);
      }
    };
    window.addEventListener(CREATOR_PROFILE_UPDATED_EVENT, syncProfile);
    return () => window.removeEventListener(CREATOR_PROFILE_UPDATED_EVENT, syncProfile);
  }, []);

  const signedIn = Boolean(session && !session.isAnonymous);
  const profileApproved = myProfile?.profilePublic === true && myProfile.discoverEligible === true;
  const posts: CreatorPost[] = home?.posts ?? [];
  const notifications = useMemo(() => (home?.notifications ?? []).filter((notification) => (
    notification.kind === "follow"
    || notification.kind === "comment"
    || notification.kind === "reaction"
  )), [home?.notifications]);
  const notificationCount = unreadCreatorNotificationCount(notifications);
  const featuredSpaces = useMemo(() => {
    if (home?.updates?.length) return home.updates.map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.creator,
      handle: space.handle,
      coverUrl: space.coverUrl,
      updatedAt: space.updatedAt,
    }));
    return spaces.slice(0, 6).map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.artist,
      handle: "",
      coverUrl: discoverCoverSource(space) ?? "",
      updatedAt: space.updatedAt,
    }));
  }, [home?.updates, spaces]);
  const heroCover = mySpaces.map(discoverCoverSource).find(Boolean)
    ?? featuredSpaces.map((space) => space.coverUrl).find(Boolean)
    ?? "";
  const visibleMySpaces = mySpaces.slice(0, 4);
  const accountOverviewUrl = accountSectionUrl("rooms", window.location.href);
  const creatorHref = (handle: string) => creatorCanonicalUrl(handle, window.location.href);
  const dashboardHref = (target: string) => dashboardView ? `#${target}` : `/creator-hub#${target}`;

  const handleHubNavigation = (event: MouseEvent<HTMLElement>) => {
    if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.pathname === window.location.pathname && target.search === window.location.search && target.hash) return;
    const creatorPath = creatorExperienceNavigationPath(target.href, window.location.href);
    if (!creatorPath) return;
    event.preventDefault();
    onNavigate(creatorPath);
  };

  const activateCreatorHub = async () => {
    if (!session || session.isAnonymous || profileBusy) return;
    setProfileBusy(true);
    setProfileNotice("Preparing Creator profile…");
    try {
      const currentProfile = await loadMyCreatorProfile();
      if (currentProfile?.profilePublic) {
        setMyProfile(currentProfile);
        setProfileStatus("ready");
        setProfileNotice(currentProfile.discoverEligible === true
          ? `Creator Hub already active as @${currentProfile.handle}.`
          : `Public profile @${currentProfile.handle} is waiting for review.`);
        return;
      }
      let handle = currentProfile?.handle;
      if (!handle) {
        const base = creatorHandleBase(session);
        const suffix = Date.now().toString(36).slice(-4);
        const candidates = [
          base,
          `${base.slice(0, 23).replace(/-+$/g, "")}-studio`,
          `${base.slice(0, 25).replace(/-+$/g, "")}-${suffix}`,
        ];
        for (const candidate of candidates) {
          if ((await checkCreatorHandle(candidate)).available) {
            handle = candidate;
            break;
          }
        }
      }
      if (!handle) throw new Error("Choose a custom handle in Account.");
      const displayName = currentProfile?.displayName
        || session.displayName
        || session.nickname
        || session.email?.split("@")[0]
        || "LIEUVA Creator";
      const saved = await saveCreatorProfile({
        handle,
        displayName,
        bio: currentProfile?.bio ?? "",
        links: currentProfile?.links ?? [],
        profilePublic: true,
        imagePresent: currentProfile?.imagePresent ?? false,
        coverPresent: currentProfile?.coverPresent ?? false,
        bioFont: currentProfile?.bioFont ?? "sans",
        profileTone: currentProfile?.profileTone ?? "paper",
      });
      setMyProfile(saved.profile);
      setProfileStatus("ready");
      announceCreatorProfileUpdated(saved.profile);
      setProfileNotice(`Public profile @${saved.profile.handle} submitted for review.`);
      void loadCreatorHome().then((nextHome) => setHome((current) => mergeCreatorHomeViewerState(current, nextHome))).catch(() => undefined);
    } catch (error) {
      setProfileNotice(creatorActionErrorMessage(
        error,
        "Activation timed out. Retry or finish the profile in Account.",
      ));
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSessionChange = useCallback((next: AccountSession | null) => {
    setSession(next);
    if (!next || next.isAnonymous) {
      setHome(undefined);
      setMyProfile(undefined);
      setMySpaces([]);
      setProfileStatus("idle");
    }
  }, []);

  const publishPost = () => {
    const body = postBody.trim();
    if (!body || postBusy) return;
    setPostBusy(true);
    setPostNotice("");
    void createCreatorPost(body)
      .then((post) => {
        setHome((current) => ({
          schemaVersion: 1,
          following: current?.following ?? [],
          updates: current?.updates ?? [],
          posts: [post, ...(current?.posts ?? [])],
          notifications: current?.notifications ?? [],
        }));
        setPostBody("");
        setPostNotice("Posted to your Creator feed.");
      })
      .catch((error: unknown) => {
        setPostNotice(error instanceof Error ? error.message.replace(/^Firebase:\s*/i, "") : "The post could not be published.");
      })
      .finally(() => setPostBusy(false));
  };

  const updatePost = (postId: string, update: Partial<CreatorPost>) => setHome((current) => current ? ({
    ...current,
    posts: current.posts.map((post) => post.id === postId ? { ...post, ...update } : post),
  }) : current);

  const markNotificationsRead = async (selection: readonly string[] | "all") => {
    const ids = selection === "all"
      ? notifications.filter((notification) => !notification.read).map((notification) => notification.id)
      : selection.filter((id) => notifications.some((notification) => notification.id === id && !notification.read));
    if (!ids.length) return;
    setNotificationNotice("");
    setHome((current) => current ? ({
      ...current,
      notifications: current.notifications.map((notification) => ids.includes(notification.id)
        ? { ...notification, read: true }
        : notification),
    }) : current);
    try {
      await markCreatorNotificationsRead(selection === "all" ? "all" : ids);
    } catch {
      setNotificationNotice("Alert state could not sync. It will retry when the Hub refreshes.");
      void loadCreatorHome(false).then((nextHome) => setHome((current) => mergeCreatorHomeViewerState(current, nextHome))).catch(() => undefined);
    }
  };

  const openPostNotification = (notification: CreatorNotification) => {
    void markNotificationsRead([notification.id]);
    const anchor = creatorNotificationPostAnchor(notification);
    if (!anchor) return;
    if (notification.kind === "comment") setActivePost(notification.postId);
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      const post = document.getElementById(anchor);
      if (!post) {
        setNotificationNotice("That studio note is no longer in your current feed.");
        document.getElementById("creator-feed")?.scrollIntoView({ block: "start", behavior });
        return;
      }
      post.scrollIntoView({ block: "center", behavior });
      post.focus({ preventScroll: true });
    });
  };

  const openFollowNotification = (notification: CreatorNotification) => {
    void markNotificationsRead([notification.id]);
    const href = creatorHref(notification.actorHandle);
    const path = creatorExperienceNavigationPath(href, window.location.href);
    if (onNavigate && path) onNavigate(path);
    else window.location.assign(href);
  };

  const engage = async (post: CreatorPost, action: "reaction" | "comment" | "block") => {
    if (!signedIn) { setPostActions((value) => ({ ...value, [post.id]: "Sign in to join the conversation." })); return; }
    if (post.demo) { setPostActions((value) => ({ ...value, [post.id]: "Demo profiles are read-only." })); return; }
    setPostActions((value) => ({ ...value, [post.id]: "Working…" }));
    try {
      if (action === "reaction") {
        const result = await interactCreatorPost(post.handle, post.id, { action: post.viewerReacted ? "unreact" : "react" });
        updatePost(post.id, { viewerReacted: result.reacted, reactionCount: result.reactionCount ?? post.reactionCount });
        setPostActions((value) => ({ ...value, [post.id]: result.reacted ? "Appreciated." : "Appreciation removed." }));
        if (result.reacted && post.handle === myProfile?.handle) {
          void loadCreatorHome(false).then((nextHome) => setHome((current) => mergeCreatorHomeViewerState(current, nextHome))).catch(() => undefined);
        }
      } else if (action === "comment") {
        const body = (commentDrafts[post.id] ?? "").trim();
        if (!body) return;
        const result = await interactCreatorPost(post.handle, post.id, { action: "comment", body });
        if (result.comment) setNewComments((value) => ({ ...value, [post.id]: [...(value[post.id] ?? []), result.comment!] }));
        updatePost(post.id, { commentCount: post.commentCount + 1 });
        setCommentDrafts((value) => ({ ...value, [post.id]: "" }));
        setPostActions((value) => ({ ...value, [post.id]: "Comment posted." }));
        if (post.handle === myProfile?.handle) {
          void loadCreatorHome(false).then((nextHome) => setHome((current) => mergeCreatorHomeViewerState(current, nextHome))).catch(() => undefined);
        }
      } else {
        await manageCreatorBlock(post.handle, "block");
        setHome((current) => current ? ({
          ...current,
          posts: current.posts.filter((item) => item.handle !== post.handle),
          following: current.following.filter((creator) => creator.handle !== post.handle),
        }) : current);
      }
    } catch (error) {
      setPostActions((value) => ({ ...value, [post.id]: error instanceof Error ? error.message.replace(/^Firebase:\s*/i, "") : "Action failed." }));
    }
  };

  const closeReport = useCallback(() => {
    if (!reportBusy) {
      setReportPost(undefined);
      setReportError("");
    }
  }, [reportBusy]);

  const openReport = (post: CreatorPost) => {
    if (!signedIn) {
      setPostActions((value) => ({ ...value, [post.id]: "Sign in to report this post." }));
      return;
    }
    if (post.demo) {
      setPostActions((value) => ({ ...value, [post.id]: "Editorial previews are not member posts." }));
      return;
    }
    setReportError("");
    setReportPost(post);
  };

  const submitReport = async (reason: CreatorReportReason) => {
    const post = reportPost;
    if (!post || reportBusy) return;
    setReportBusy(true);
    try {
      const result = await interactCreatorPost(post.handle, post.id, { action: "report", reason });
      const receipt = result.receiptId ? ` Receipt ${result.receiptId}.` : "";
      setPostActions((value) => ({ ...value, [post.id]: `Report received for operator review.${receipt}` }));
      setReportPost(undefined);
      setReportError("");
    } catch (error) {
      setReportError(error instanceof Error
        ? error.message.replace(/^Firebase:\s*/i, "")
        : "Report could not be sent. Please retry.");
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <main className={`creator-hub creator-hub--${view.kind}`} onClickCapture={handleHubNavigation}>
      <header className="creator-hub__global-header">
        <Logo dark />
        <nav className="creator-hub__global-context" aria-label="LIEUVA and Creator Hub">
          <a href="/">LIEUVA home <span aria-hidden="true">↗</span></a>
          <a href="/creators"><HubIcon name="search" /> Find Creators</a>
        </nav>
        <nav className="creator-hub__global-actions" aria-label="Creator actions">
          <a className="creator-hub__create" href="/#/create">Create a Space</a>
          <AccountButton light open={accountOpen} onOpenChange={setAccountOpen} onSessionChange={handleSessionChange} />
        </nav>
      </header>

      <div className="creator-hub__shell">
        <aside className="creator-hub__sidebar" aria-label="Creator Hub local navigation">
          <nav>
            <a className={dashboardView && activeSection === "home" ? "is-active" : ""} aria-current={dashboardView && activeSection === "home" ? "page" : undefined} href={dashboardHref("creator-home")}><HubIcon name="home" /> Hub Home</a>
            <a className={`creator-hub__feed-link ${dashboardView && activeSection === "feed" ? "is-active" : ""}`} aria-current={dashboardView && activeSection === "feed" ? "location" : undefined} href={dashboardHref("creator-feed")}><HubIcon name="feed" /> Feed</a>
            <a className={creatorsView ? "is-active" : ""} aria-current={creatorsView ? "page" : undefined} href="/creators"><HubIcon name="creators" /> Creators</a>
            <a className={`creator-hub__mobile-notifications ${dashboardView && activeSection === "notifications" ? "is-active" : ""}`} aria-current={dashboardView && activeSection === "notifications" ? "location" : undefined} href={dashboardHref("creator-activity")} aria-label={notificationCount ? `Alerts (${notificationCount} unread)` : "Alerts"}><HubIcon name="bell" /> Alerts {notificationCount ? <b className="creator-hub__notification-badge">{notificationCount}</b> : null}</a>
            <a className={dashboardView && activeSection === "spaces" ? "is-active" : ""} aria-current={dashboardView && activeSection === "spaces" ? "location" : undefined} href={dashboardHref("creator-spaces")}><HubIcon name="spaces" /> My Spaces</a>
            <a className={`creator-hub__mobile-account ${settingsView ? "is-active" : ""}`} aria-current={settingsView ? "page" : undefined} href={profileSettingsUrl}><HubIcon name="account" /> Profile</a>
          </nav>
          <nav className="creator-hub__sidebar-utility">
            <a className={dashboardView && activeSection === "notifications" ? "is-active" : ""} aria-current={dashboardView && activeSection === "notifications" ? "location" : undefined} href={dashboardHref("creator-activity")}><HubIcon name="bell" /> Alerts {notificationCount ? <b>{notificationCount}</b> : null}</a>
          </nav>
          <a className="creator-hub__sidebar-identity" href={signedIn ? profileSettingsUrl : "/#/account"}>
            <span>{myProfile ? <CreatorMark creator={myProfile} allowImage={profileApproved} /> : (session?.displayName || session?.nickname || "L").slice(0, 1).toUpperCase()}</span>
            <div><strong>{myProfile?.displayName || session?.displayName || session?.nickname || "Your profile"}</strong><small>{myProfile ? `@${myProfile.handle}` : signedIn ? "Complete your profile" : "Sign in"}</small></div>
            <b>···</b>
          </a>
        </aside>

        <div className="creator-hub__content">
          {view.kind === "directory" ? (
            <CreatorDirectoryPage embedded />
          ) : view.kind === "profile" ? (
            <CreatorProfilePage
              key={view.handle}
              embedded
              handle={view.handle}
              hubSession={session}
              onRequireAccount={() => setAccountOpen(true)}
            />
          ) : view.kind === "settings" ? (
            <section className="creator-hub__profile-settings" aria-labelledby="creator-profile-settings-title">
              <header>
                <p className="eyebrow">Account settings</p>
                <h1 id="creator-profile-settings-title">Profile settings moved.</h1>
                <p>Public profile editing now lives in one central Account section. Your identity, profile lifecycle and Space placement remain unchanged.</p>
              </header>
              <div className="creator-hub__profile-settings-gate" role="status">
                <h2>Opening Public profile…</h2>
                <p>If the Account page does not open automatically, continue below.</p>
                <a href={profileSettingsUrl}>Continue to Account settings →</a>
              </div>
            </section>
          ) : <>
          <section className="creator-hub__hero" id="creator-home">
            <div className="creator-hub__hero-visual" style={{
              backgroundImage: `url(${JSON.stringify(heroCover || "/assets/demo/aura-hero-gallery.webp")})`,
            }}>
              <div>
                <p className="eyebrow">Creator Hub</p>
                <h1>Make a place.<br/><em>Share the process.</em></h1>
                <p>Your Spaces lead. Studio notes, people and conversation gather around the work.</p>
                <nav><a href="/#/create">Create a Space</a><a href="#creator-feed">Explore the feed</a></nav>
              </div>
            </div>
            <form className="creator-hub__composer" onSubmit={(event) => { event.preventDefault(); publishPost(); }}>
              <div><p className="eyebrow">Share a studio note</p><span>{postBody.length}/600</span></div>
              <textarea
                aria-label="Studio note"
                value={postBody}
                onChange={(event) => setPostBody(event.target.value.slice(0, 600))}
                placeholder={signedIn ? profileApproved ? "What are you working on?" : "Write a note. Reviewed profiles can publish." : "Sign in to write a studio note."}
                disabled={!signedIn || postBusy}
                rows={5}
              />
              <div className="creator-hub__composer-actions">
                <small aria-live="polite">{postNotice || (profileApproved ? "Public to the Creator community" : myProfile?.profilePublic ? "Profile review pending" : signedIn ? "Submit profile to publish" : "Sign in to write")}</small>
                {profileApproved
                  ? <button type="submit" disabled={!postBody.trim() || postBusy}>{postBusy ? "Posting…" : "Post to feed"}</button>
                  : <a className="creator-hub__composer-action" href={signedIn ? profileSettingsUrl : "/#/account"}>{myProfile?.profilePublic ? "View review status" : signedIn ? "Submit profile" : "Sign in to post"} <span aria-hidden="true">→</span></a>}
              </div>
            </form>
          </section>

          <dl className="creator-hub__pulse" aria-label="Your Creator Hub overview">
            <div><HubIcon name="creators" /><dt>Followers</dt><dd>{signedIn ? myProfile?.followerCount ?? 0 : "—"}</dd></div>
            <div><HubIcon name="feed" /><dt>Feed notes</dt><dd>{signedIn ? home?.posts?.length ?? 0 : "—"}</dd></div>
            <div><HubIcon name="spaces" /><dt>Your Spaces</dt><dd>{signedIn ? mySpaces.length : "—"}</dd></div>
            <div><HubIcon name="account" /><dt>Public profile</dt><dd>{profileApproved ? "Live" : myProfile?.profilePublic ? "Review" : profileStatus === "loading" ? "Syncing" : profileStatus === "error" ? "Retry" : signedIn ? "Draft" : "Sign in"}</dd></div>
          </dl>

          <section className="creator-hub__social" id="creator-feed" aria-labelledby="creator-feed-title">
            <div className="creator-hub__section-heading"><div><p className="eyebrow">From the feed</p><h2 id="creator-feed-title">Studio notes.</h2></div><p>Process updates from you and the Creators you follow. Spaces remain the work; notes show how it changes.</p></div>
            <div className="creator-hub__social-grid">
              <div className="creator-hub__timeline">
                {posts.length ? posts.map((post) => {
                  const creator = post.handle === myProfile?.handle
                    ? myProfile
                    : home?.following.find((candidate) => candidate.handle === post.handle);
                  return (
                  <article className="creator-post" id={`creator-post-${post.id}`} tabIndex={-1} key={post.id}>
                    <header>
                      <a href={creatorHref(post.handle)} className="creator-post__identity" aria-label={`Visit ${post.displayName} profile`}>
                        <span className="creator-post__mark" aria-hidden="true">{creator?.imagePresent ? <img src={creatorImageUrl(post.handle)} alt="" loading="lazy" /> : post.displayName.slice(0, 1)}</span>
                        <span><strong>{post.displayName}</strong><small>@{post.handle}</small></span>
                      </a>
                      <time dateTime={post.createdAt}>{relativeDate(post.createdAt)}</time>
                    </header>
                    <p>{post.body}</p>
                    <footer className="creator-post__actions">
                      <button type="button" className={`creator-post__action${post.viewerReacted ? " is-active" : ""}`} aria-pressed={Boolean(post.viewerReacted)} onClick={() => void engage(post, "reaction")}><HubIcon name="heart" /><b>{post.reactionCount ?? 0}</b><span>Appreciate</span></button>
                      <button type="button" className="creator-post__action" aria-expanded={activePost === post.id} onClick={() => setActivePost(activePost === post.id ? undefined : post.id)}><HubIcon name="comment" /><b>{post.commentCount ?? 0}</b><span>Discuss</span></button>
                      <details className="creator-post__overflow"><summary aria-label="More post actions">•••</summary><div><small>Safety and reporting</small><button type="button" onClick={() => openReport(post)}>Report post</button><button type="button" onClick={() => void engage(post, "block")}>Block Creator</button></div></details>
                    </footer>
                    {activePost === post.id && <div className="creator-post__discussion"><form onSubmit={(event) => { event.preventDefault(); void engage(post, "comment"); }}><label><span className="visually-hidden">Comment on this post</span><input value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((value) => ({ ...value, [post.id]: event.target.value.slice(0, 280) }))} placeholder="Add a considered comment…" disabled={!signedIn || Boolean(post.demo)} /></label><button type="submit" disabled={!(commentDrafts[post.id] ?? "").trim() || !signedIn || Boolean(post.demo)}>Post</button></form>{(newComments[post.id] ?? []).map((comment) => <p key={comment.id}><strong>{comment.displayName}</strong> {comment.body}</p>)}</div>}
                    {postActions[post.id] && <small className="creator-post__notice" aria-live="polite">{postActions[post.id]}</small>}
                  </article>
                  );
                }) : <div className="creator-hub__empty creator-hub__empty--feed"><HubIcon name="feed" /><h3>{homeStatus === "error" ? "Feed connection paused." : homeStatus === "loading" ? "Loading your circle…" : "Your feed starts with real work."}</h3><p>{homeStatus === "error" ? "Your work is safe. Retry the live community feed." : signedIn ? "Follow a public Creator or publish a studio note. New Spaces and notes will appear here." : "Sign in, follow a Creator and return when their work changes."}</p>{homeStatus === "error" ? <button type="button" onClick={() => setProfileRefresh((value) => value + 1)}>Retry feed →</button> : <a href="/creators">Find Creators →</a>}</div>}
              </div>
              <aside className="creator-hub__rail"><p className="eyebrow">Following</p><h3>{home?.following.length ? "Your circle" : "Build your circle"}</h3>{home?.following.length ? <div className="creator-hub__following" aria-label="Creators you follow">{home.following.map((creator) => <a key={creator.handle} href={creatorHref(creator.handle)}><span><CreatorMark creator={creator} /></span><div><strong>{creator.displayName}</strong><small>@{creator.handle}</small></div><b>→</b></a>)}</div> : <p>Follow a public Creator and their newest notes and Spaces will collect here.</p>}<a href="/creators">Find Creators <span>↗</span></a></aside>
            </div>
          </section>

          <section className="creator-hub__work" aria-labelledby="creator-spaces-title">
            <div className="creator-hub__work-main">
              <div className="creator-hub__compact-heading"><div><p className="eyebrow">Your work</p><h2 id="creator-spaces-title">Spaces moving now.</h2></div></div>
              {featuredSpaces.length ? <div className="creator-hub__space-grid">{featuredSpaces.slice(0, 4).map((space) => (
                <a key={`${space.id}:${space.updatedAt ?? "space"}`} href={spaceCanonicalUrl(space.id)}>
                  <div><SpaceCover src={space.coverUrl} /></div>
                  <small>{space.handle ? `@${space.handle}` : space.creator}</small>
                  <h3>{space.title}</h3><span>Enter Space →</span>
                </a>
              ))}</div> : <div className="creator-hub__empty"><HubIcon name="spaces" /><h3>No public Space update yet.</h3><p>Create, publish and share the first place in this view.</p><a href="/#/create">Create a Space →</a></div>}
            </div>

            <aside className="creator-hub__dashboard-rail">
              <section id="creator-activity" className="creator-hub__notifications" aria-labelledby="creator-activity-title">
                <div><p className="eyebrow" id="creator-activity-title">Alerts</p><div><span>{notificationCount ? `${notificationCount} unread` : "Up to date"}</span>{notificationCount ? <button type="button" onClick={() => void markNotificationsRead("all")}>Mark all read</button> : null}</div></div>
                {homeStatus === "loading" ? <p role="status">Checking your activity…</p>
                  : homeStatus === "error" ? <p>Alerts could not sync. Retry from the Feed.</p>
                    : !signedIn ? <p>Sign in to see follows, comments and appreciations.</p>
                      : notifications.length ? notifications.map((notification) => {
                        const action = notification.kind === "follow" ? " followed you" : notification.kind === "comment" ? " commented on your studio note" : " appreciated your studio note";
                        const actorLabel = notification.actorHandle === myProfile?.handle ? "You" : notification.actorDisplayName;
                        const content = <><strong>{actorLabel}</strong><span>{action}</span>{notification.bodyPreview ? <small>“{notification.bodyPreview}”</small> : null}<time dateTime={notification.createdAt}>{relativeDate(notification.createdAt)}</time></>;
                        return creatorNotificationPostAnchor(notification)
                          ? <button type="button" className={notification.read ? "" : "is-unread"} key={notification.id} onClick={() => openPostNotification(notification)} aria-label={`${actorLabel}${action}, open affected studio note, ${relativeDate(notification.createdAt)}`}>{content}</button>
                          : <button type="button" className={notification.read ? "" : "is-unread"} key={notification.id} onClick={() => openFollowNotification(notification)} aria-label={`${actorLabel}${action}, open Creator profile, ${relativeDate(notification.createdAt)}`}>{content}</button>;
                      })
                        : <p>No alerts yet. New follows, comments and appreciations will appear here.</p>}
                {notificationNotice ? <small className="creator-hub__notification-notice" role="status">{notificationNotice}</small> : null}
              </section>

              <section id="creator-spaces" aria-labelledby="my-spaces-title">
                <div><p className="eyebrow" id="my-spaces-title">My Spaces</p><a href={accountOverviewUrl}>View all →</a></div>
                {visibleMySpaces.length ? <div className="creator-hub__my-spaces">{visibleMySpaces.map((space) => (
                  <a key={space.id} href={spaceCanonicalUrl(space.id)}>
                    <span><SpaceCover src={discoverCoverSource(space)} fallback={space.title.slice(0, 1)} /></span>
                    <div><strong>{space.title}</strong><small>{space.visibility} · {space.lifecycleStatus}</small></div>
                  </a>
                ))}</div> : <p>{mySpacesStatus === "error" ? "Spaces could not sync. Retry from your Account." : mySpacesStatus === "loading" ? "Syncing your Spaces…" : signedIn ? "Published Spaces from this account appear here." : "Sign in to return to your published Spaces."}</p>}
              </section>

              <section className="creator-hub__profile-card" id="creator-profile" aria-labelledby="creator-profile-title">
                <div><p className="eyebrow" id="creator-profile-title">Creator identity</p><span className={profileApproved ? "is-live" : ""}>{profileApproved ? "✓ Live" : myProfile?.profilePublic ? "Review pending" : profileStatus === "loading" ? "Syncing" : profileStatus === "error" ? "Sync paused" : signedIn ? "Private" : "Signed out"}</span></div>
                {signedIn && profileApproved ? <>
                  <div className="creator-hub__my-identity"><span><CreatorMark creator={myProfile} /></span><div><h3>{myProfile.displayName}</h3><p>@{myProfile.handle}</p></div></div>
                  {myProfile.bio && <p>{myProfile.bio}</p>}
                  <nav><a href={creatorHref(myProfile.handle)}>Open public profile <b>↗</b></a><a href={profileSettingsUrl}>Edit profile <b>→</b></a></nav>
                </> : profileStatus === "loading" ? <p>Syncing the Creator identity attached to this account…</p> : profileStatus === "error" ? <><p>{profileNotice}</p><button className="creator-hub__primary-action" type="button" onClick={() => setProfileRefresh((value) => value + 1)}>Retry profile sync <span>→</span></button></> : signedIn && myProfile?.profilePublic ? <>
                  <h3>Public review pending.</h3><p>Your profile is saved, but it stays out of public search, feeds and follows until a LIEUVA operator approves it.</p>
                  <a className="creator-hub__primary-action" href={profileSettingsUrl}>Review profile submission <span>→</span></a>
                  {profileNotice && <small className="creator-hub__profile-notice" aria-live="polite">{profileNotice}</small>}
                </> : signedIn ? <>
                  <h3>Introduce your practice.</h3><p>One public profile connects your Spaces, studio notes and follows.</p>
                  <button className="creator-hub__primary-action" type="button" disabled={profileBusy} onClick={() => void activateCreatorHub()}>{profileBusy ? "Activating…" : myProfile ? "Make profile public" : "Activate public profile"} <span>→</span></button>
                  <a className="creator-hub__secondary-action" href={profileSettingsUrl}>Edit public profile →</a>
                  {profileNotice && <small className="creator-hub__profile-notice" aria-live="polite">{profileNotice}</small>}
                </> : <><h3>Bring your practice into the Hub.</h3><p>Sign in to publish notes, follow Creators and keep your work close.</p><a className="creator-hub__primary-action" href="/#/account">Sign in or create account <span>→</span></a></>}
              </section>
            </aside>
          </section>
          </>}
        </div>
      </div>
      {reportPost ? <CreatorReportDialog creator={reportPost.handle} busy={reportBusy} error={reportError} onClose={closeReport} onSubmit={(reason) => void submitReport(reason)} /> : null}
    </main>
  );
}
