# LIEUVA Space URL & SEO Architecture

Status: Architecture decision for Work Package 5. No production deployment is part of this document.

## 1. Current routing architecture

- `src/App.tsx` owns a small manual router. `routeFromHash()` reads `location.hash`; `hashchange` updates React state.
- Published Spaces currently resolve through `#/g/{galleryId}`. Studio, Account, DannyHirschArts and the remaining product areas also use hash routes.
- `src/services/galleryShareUrl.ts` currently creates legacy hash links from the active origin and path.
- Published visitor data is loaded by `GalleryRepository.findManifest()` and then hydrated from Firebase Storage. No router framework is installed.
- Route-level Three.js code remains lazy-loaded. Routing and metadata must not move Three.js into the landing bundle.

Confirmed fact: the current viewer route is a presentation layer over an existing publication identity. It is not the publication identity itself.

## 2. Current hosting constraints

- `.github/workflows/deploy.yml` builds a static Vite bundle and publishes it to GitHub Pages.
- GitHub Pages can serve the SPA and its hash routes, but cannot return per-Space initial HTML, privacy-aware metadata, dynamic social images or correct status codes from Firestore state.
- `vite.config.ts` currently emits relative production URLs for the GitHub Pages subdirectory.
- Firebase Functions, Firestore, Storage and Authentication already exist in the repository and use `europe-west1`. `firebase.json` does not yet configure Hosting.

Conclusion: GitHub Pages alone cannot satisfy the raw-HTML and privacy requirements of WP5.

## 3. Existing Space identity model

- New publication IDs are generated in `FirebaseGalleryRepository.publish()` as a bounded title/creator prefix plus 16 random hexadecimal characters.
- The resulting ID is the Firestore document ID under `galleries/{galleryId}`, the Storage path identity under `published/{ownerId}/{galleryId}/`, the ACL parent identity, and the existing share-link identity.
- `FirebaseGalleryRepository.updatePublished()` preserves that ID and increments `revision`; revision media is stored below a revision path.
- `GalleryEditTarget.id` in `src/services/galleryAccess.ts` and `GalleryRecord.id` in `src/services/galleryRepository.ts` confirm this durable identity contract.

Decision: use the existing `galleryId` as the clean URL identifier. The human-readable prefix is incidental; the complete ID is stable, URL-safe and collision-resistant. Title, creator and revision changes do not alter it.

## 4. Proposed canonical URL model

Canonical customer URL:

`https://lieuva.com/spaces/{existing-galleryId}`

- New links and internal visitor navigation use this form.
- No new slug collection, alias document or publication identity is introduced.
- The route is validated before any data lookup.
- Existing hash routes remain compatibility entry points, not canonical alternatives.
- DannyHirschArts remains on its existing demo route because it is not currently represented by a persisted `galleries/{galleryId}` publication. Inventing a one-off fake Space identity would violate this contract.

## 5. Proposed metadata delivery model

Use Firebase Hosting with narrowly scoped rewrites:

- `/spaces/**` -> an HTTP Function that loads only the current Firestore publication manifest, enforces the visibility/lifecycle boundary, and returns the built SPA shell with request-specific metadata.
- `/space-cards/**` -> an HTTP Function that exposes the current approved public cover without exposing a Storage URL.
- `/sitemap.xml` -> an HTTP Function that emits eligible public canonical URLs.
- all other application paths -> the static Vite SPA shell.

The root build copies its final hashed `dist/index.html` to a generated Functions asset. The metadata Function changes only head metadata; the same React application then boots and loads the Space normally. It does not initialize Three.js or download artwork binaries.

## 6. Legacy URL compatibility model

- `#/g/{id}` remains recognized by the client router.
- A valid legacy route resolves the same existing ID and replaces/navigates to `https://lieuva.com/spaces/{id}`.
- It never creates a document, revision or alias.
- Local development resolves to the same local origin for deterministic testing.
- `public/404.html` is a noindex GitHub Pages rollback bridge from a clean path to the legacy hash identity. Its `legacy=1` marker prevents a redirect loop when the legacy host is intentionally restored.
- All other legacy hash routes remain unchanged.

## 7. Public / unlisted / private indexing policy

| State | HTTP content metadata | Robots | Sitemap | Social image |
| --- | --- | --- | --- | --- |
| Active, unexpired public | Approved current title, creator, description and card endpoint | `index,follow` | Included | Current public cover or LIEUVA fallback |
| Active, unexpired unlisted | Generic LIEUVA shared-Space metadata only | `noindex,nofollow` | Excluded | Generic fallback only; no Space media |
| Active, unexpired private | Generic `LIEUVA — Private Space` metadata only | `noindex,nofollow` | Excluded | Generic fallback only; no Space media |
| Missing, malformed, archived, trashed or expired | Generic unavailable metadata | `noindex,nofollow` | Excluded | None |
| Backend unavailable | Generic temporary-error metadata | `noindex,nofollow` | Excluded | None |

Firestore and Storage rules remain the access-control source for the application. Metadata is an additional public API surface and independently applies the stricter table above.

## 8. Social-card architecture

- Public metadata points `og:image` and `twitter:image` to `/space-cards/{galleryId}?v={revision}`.
- The card Function re-reads the current manifest, confirms public/active/unexpired state and validates `coverPath` ownership before streaming the image.
- The revision query is a cache-busting hint, not an authorization input.
- Private and unlisted requests never stream the cover and never expose Storage URLs.
- A missing public cover uses an existing, same-origin LIEUVA fallback image. No screenshot rendering service is introduced.

## 9. Sitemap architecture

- The sitemap Function emits the homepage plus active, unexpired public Spaces.
- It queries the existing indexed modern visibility contract and the existing legacy schema contract, merges by document ID, then applies the same server-side eligibility classifier used for metadata.
- It emits only `https://lieuva.com/` and `https://lieuva.com/spaces/{id}` URLs.
- Account, Studio, invitations, unlisted/private Spaces, legacy hashes and transient revision URLs are excluded.

## 10. 404 and error behavior

- Malformed identifier: HTTP 404 with generic noindex SPA document.
- Missing/deleted/archived/trashed/expired Space: HTTP 404 with generic noindex SPA document.
- Private/unlisted Space: HTTP 200 so the existing access/direct-link experience can boot, but initial metadata is generic and `noindex,nofollow`.
- Firestore or shell failure: HTTP 503 with generic noindex response.
- Revoked access remains an application-level authorization result after the privacy-safe document boots.
- A non-sensitive `lieuva:space-state` head marker lets the SPA preserve the server's not-found decision rather than misclassifying a denied/missing client read as a private Space.

## 11. Deployment requirements

1. Review and merge repository changes.
2. Build and test both root and Functions packages.
3. Deploy the new HTTP Functions and Firebase Hosting configuration together to a preview channel/project first.
4. Verify raw HTTP responses, Auth callbacks, clean deep-link refresh, legacy redirects and visibility transitions.
5. Add `lieuva.com` and `www.lieuva.com` to Firebase Hosting only during an approved cutover.
6. Change DNS only after preview acceptance; keep Firebase Auth authorized domains intact.
7. Submit the canonical sitemap only after production verification.

No Firestore collection, rule contract, Storage path or document ID migration is required.

## 12. Rollback strategy

- Persistent Space data is untouched, so rollback is delivery-only.
- Repoint DNS/custom-domain delivery to the previous GitHub Pages deployment if necessary.
- Keep the existing GitHub Pages workflow and its relative-base build available during the review/cutover window.
- Legacy `#/g/{id}` links still contain the durable ID and can be served by the old build.
- Disable/remove only the Hosting rewrites and new HTTP Functions after traffic is back on the old host.
- Restore the static homepage-only sitemap while the old host is active.

## 13. Alternatives considered

### A. Keep GitHub Pages only

Rejected. It cannot produce route-specific raw HTML from Firestore, privacy-aware cards, dynamic sitemap output or correct Space status codes.

### B. Pre-generate one HTML file per public Space

Rejected for WP5. Every publish, revision, title or visibility change would require a trusted build/deploy pipeline and deletion invalidation. It adds more synchronization and stale-privacy risk than the existing Firebase stack.

### C. Firebase Hosting plus Functions

Chosen. Firebase is already the data/auth/runtime boundary; three small HTTP handlers can enforce current publication state without changing the model. Hosting rewrites solve direct clean loads and raw metadata with minimal client routing changes.

### D. Add another edge/SSR platform or migrate to a framework router

Rejected. It adds a second deployment/security environment and a broad application migration without improving the underlying identity or privacy contract.

## 14. Why this is the smallest coherent solution

The chosen design reuses the existing publication ID, Firestore manifest, Storage cover, Firebase Admin runtime, Vite shell and manual router. It adds only the delivery capabilities static hosting lacks. It preserves every persistent compatibility contract named in `AGENTS.md`, keeps the 3D/runtime architecture unchanged, provides a bounded rollback, and establishes one server-side visibility classifier shared by metadata, cards and sitemap generation.

Clean customer URLs do not imply renamed Firebase/data identifiers. `galleries`, `galleryId`, `aura_*`, callable names, Storage paths, local draft keys and legacy schema readers intentionally remain unchanged.
