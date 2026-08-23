import { describe, expect, it } from "vitest";
import appSource from "../App.tsx?raw";
import logoSource from "../components/Logo.tsx?raw";
import errorBoundarySource from "../components/AppErrorBoundary.tsx?raw";
import accountSource from "../features/account/AccountDialog.tsx?raw";
import authActionSource from "../features/account/AuthActionPage.tsx?raw";
import accessSource from "../features/account/GalleryAccessManager.tsx?raw";
import visitorControlsSource from "../features/gallery/VisitorControls.tsx?raw";
import gallerySceneSource from "../features/gallery/GalleryScene.tsx?raw";
import demoCollectionSource from "../features/gallery/editor/demoCollection.ts?raw";
import pitchSource from "../features/landing/PitchSections.tsx?raw";
import scrollStorySource from "../features/landing/ScrollGalleryStory.tsx?raw";
import actionErrorsSource from "../services/firebaseActionError.ts?raw";
import firebaseRepositorySource from "../services/firebaseGalleryRepository.ts?raw";
import publishingErrorsSource from "../services/galleryPublishingError.ts?raw";
import draftStorageSource from "../services/draftStorage.ts?raw";
import storagePathsSource from "../services/galleryStoragePaths.ts?raw";
import emailSource from "../../functions/src/emailTemplates.ts?raw";
import functionsSource from "../../functions/src/index.ts?raw";
import htmlSource from "../../index.html?raw";
import manifestSource from "../../public/site.webmanifest?raw";
import faviconSource from "../../public/favicon.svg?raw";
import { PRODUCT_BRAND, productTitle } from "./brand";

const visibleSources = {
  "src/App.tsx": appSource,
  "src/components/Logo.tsx": logoSource,
  "src/components/AppErrorBoundary.tsx": errorBoundarySource,
  "src/features/account/AccountDialog.tsx": accountSource,
  "src/features/account/AuthActionPage.tsx": authActionSource,
  "src/features/account/GalleryAccessManager.tsx": accessSource,
  "src/features/gallery/VisitorControls.tsx": visitorControlsSource,
  "src/features/gallery/GalleryScene.tsx": gallerySceneSource,
  "src/features/gallery/editor/demoCollection.ts": demoCollectionSource,
  "src/features/landing/PitchSections.tsx": pitchSource,
  "src/features/landing/ScrollGalleryStory.tsx": scrollStorySource,
  "src/services/firebaseActionError.ts": actionErrorsSource,
  "src/services/firebaseGalleryRepository.ts": firebaseRepositorySource,
  "src/services/galleryPublishingError.ts": publishingErrorsSource,
  "functions/src/emailTemplates.ts": emailSource,
  "functions/src/index.ts": functionsSource,
  "index.html": htmlSource,
  "public/site.webmanifest": manifestSource,
  "public/favicon.svg": faviconSource,
};

describe("LIEUVA visible-brand and compatibility contract", () => {
  it("exposes the frozen WP3 positioning from one client source", () => {
    expect(PRODUCT_BRAND).toMatchObject({
      name: "LIEUVA",
      category: "Immersive 3D presentation platform",
      claim: "Give your work a place.",
      primaryCta: "Create a Space",
      secondaryCta: "Explore the demo",
    });
    expect(productTitle()).toBe("LIEUVA — Immersive 3D presentation platform");
  });

  it("contains no unintended customer-visible legacy branding", () => {
    const forbidden = [
      /\bAURA\b/,
      /\bAura\b/,
      /Virtual Art Platform/i,
      /Smart view/i,
      /Create a gallery/i,
      /Your rooms/i,
      /My rooms/i,
    ];
    const failures = Object.entries(visibleSources).flatMap(([file, source]) =>
      forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`),
    );
    expect(failures).toEqual([]);
  });

  it("preserves migration-sensitive AURA-era identifiers", () => {
    const required: Array<[string, string, string[]]> = [
      ["src/services/draftStorage.ts", draftStorageSource, [
        'const DATABASE_NAME = "aura-gallery-editor"',
        'const FALLBACK_PREFIX = "aura-gallery-project-v2:"',
        'const LEGACY_FALLBACK_PREFIX = "aura-gallery-draft-v1:"',
      ]],
      ["src/features/account/AccountDialog.tsx", accountSource, [
        'format: "aura-gallery-export"',
        ".aura.json",
      ]],
      ["src/services/firebaseGalleryRepository.ts", firebaseRepositorySource, [
        '"beginAuraGalleryPublication"',
        '"abortAuraGalleryPublication"',
        '"createAuraGalleryInvite"',
        '"acceptAuraGalleryInvite"',
        '"revokeAuraGalleryAccess"',
        '"manageAuraGalleryLifecycle"',
        '"galleries"',
        '"galleryArtworks"',
      ]],
      ["functions/src/index.ts", functionsSource, [
        '"AURA_PUBLIC_APP_URL"',
        '"AURA_REPLY_TO"',
        '"AURA_LEGAL_FOOTER"',
        "export const beginAuraGalleryPublication",
        "export const exportAuraAccountData",
        "export const deleteAuraAccount",
      ]],
      ["src/services/galleryStoragePaths.ts", storagePathsSource, ["published/"]],
    ];
    const missing = required.flatMap(([file, source, identifiers]) =>
      identifiers
        .filter((identifier) => !source.includes(identifier))
        .map((identifier) => `${file}: ${identifier}`),
    );
    expect(missing).toEqual([]);
  });
});
