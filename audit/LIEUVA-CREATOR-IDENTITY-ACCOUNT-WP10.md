# LIEUVA Creator Identity & Account — WP10

Status labels used below: **IMPLEMENTED**, **VERIFIED LOCALLY**, **REQUIRES DEPLOYMENT**, **REQUIRES REAL DEVICE**.

## 1. Pre-WP10 architecture

**VERIFIED LOCALLY.** Private account identity was Firebase-UID based, profiles lived in `profiles/{uid}`, and Account was a single dialog/page surface. Published Spaces already carried owner/ACL data, but there was no explicit public Creator identity, stable public handle, Creator route, or mediated public portfolio.

## 2. Audit findings

**VERIFIED LOCALLY.** Public identity could not safely reuse the private profile document: it contains account-only fields and its UID must not become a public identifier. Existing Space ownership was reusable; editor/viewer ACL membership was not valid authorship. WP9 delivery, canonical, card and sitemap infrastructure was the correct extension point.

## 3. Private Account model

**IMPLEMENTED.** `profiles/{uid}` remains private account data. Public identity uses a separate creator ID and server-mediated documents. Email, UID, preferences, account controls, drafts and ACL data stay outside public responses.

## 4. Public Creator model

**IMPLEMENTED.** `creatorAccounts/{creatorId}` stores the owner link and lifecycle; `creatorProfiles/{creatorId}` stores intentionally public profile fields; `creatorAccountOwners/{uid}` maps the private owner to the stable creator ID; `creatorHandles/{normalizedHandle}` is the authoritative handle registry.

## 5. Public/private field matrix

| Data | Private Account | Public Creator |
|---|---:|---:|
| Firebase UID, email, auth provider | yes | never |
| account preferences, drafts, ACL/invites | yes | never |
| display name, short bio | source/edit surface | only after public opt-in |
| handle | owner mapping | public route key |
| up to four HTTPS links | no public default | only intentional values |
| profile image | private Storage object | mediated only while public |
| eligible owner Spaces | account management | public and lifecycle-eligible only |

## 6. Handle architecture

**IMPLEMENTED.** Public URL: `/creators/{handle}`. Handles resolve through a transaction-protected registry; public responses use the current handle and creator ID remains internal.

## 7. Normalization

**VERIFIED LOCALLY.** NFKC, lowercase, trimmed; 3–30 characters; ASCII letters/numbers with single internal hyphens; no leading/trailing or repeated hyphens. Unit tests cover case and Unicode normalization boundaries.

## 8. Reserved names

**VERIFIED LOCALLY.** Product, system, auth, legal, routing and support terms are rejected by shared client/server policy. Errors are actionable rather than silently rewriting the request.

## 9. Uniqueness

**VERIFIED LOCALLY.** Firestore transaction creation/update makes handle ownership server-authoritative and prevents case-equivalent collisions. Deterministic transaction tests cover competing ownership. **REQUIRES DEPLOYMENT:** live two-account contention test.

## 10. Handle changes

**IMPLEMENTED.** Changes are rate-limited to seven days. The previous registry entry remains an alias, so old links resolve to the current canonical handle instead of breaking.

## 11. Aliases/redirects

**VERIFIED LOCALLY.** Creator delivery detects alias resolution, returns the canonical handle, and clean-page delivery can redirect/canonicalize without exposing internal IDs.

## 12. Creator profile

**IMPLEMENTED.** Premium restrained profile page: identity, bio, links, dominant profile/Space imagery, portfolio and clear LIEUVA navigation. It intentionally avoids follows, feeds, counts, comments or other social-network mechanics.

## 13. Profile visibility

**IMPLEMENTED.** Profiles are private by default and become public only through explicit owner opt-in. Private/missing states return generic copy and no profile metadata, portfolio, image or internal identifiers.

## 14. Profile image decision

**IMPLEMENTED.** Client normalizes to square 512×512 WebP (maximum 512 KB); server validates MIME and WebP magic bytes. Storage remains at private `creator-public/{creatorId}/avatar.webp`; public delivery is mediated and allowed only for a currently public profile.

## 15. Bio

**IMPLEMENTED.** Optional short plain-text bio, length-limited and rendered as text. No rich HTML is accepted.

## 16. Links

**IMPLEMENTED.** Up to four explicitly entered HTTPS links. Non-HTTPS and malformed URLs are rejected; links use safe external-link attributes.

## 17. Creator ↔ Space relationship

**IMPLEMENTED.** Only owner relationship can create public authorship. Existing ownership/ACL contracts remain unchanged; editor/viewer access never creates attribution.

## 18. Account IA

**IMPLEMENTED.** Account now separates `Projects & Spaces`, `Public profile`, `Account & security`, and `Data & rights`. Public profile controls explain the public boundary and retain explicit save states.

## 19. Projects/Spaces management

**IMPLEMENTED.** Account shows owned/collaborative live Spaces plus local drafts, edit/manage/open actions and states without creating a new persistence system.

## 20. Public portfolio

**IMPLEMENTED.** Portfolio contains only current public, non-expired, owner-attributed Spaces and prioritizes cover imagery. Private/unlisted/expired/deleted Spaces and ACL-only access are excluded.

## 21. Discover integration

**IMPLEMENTED.** Eligible public cards may show a Creator link resolved through the public attribution mediator. Legacy/public Spaces without a public Creator continue to render without a link.

## 22. Space integration

**IMPLEMENTED.** Published visitor identity uses the same mediated attribution component. No UID or private profile lookup is performed in anonymous clients.

## 23. SEO

**IMPLEMENTED.** Creator documents reuse WP9 clean-route delivery and canonical policy. Canonical origin remains `https://lieuva.com`; aliases resolve to the current handle.

## 24. Sitemap

**IMPLEMENTED.** Sitemap extends WP9 generation with eligible public Creator profiles only. Private/missing profiles never enter it. **REQUIRES DEPLOYMENT:** production crawler validation.

## 25. Structured data

**IMPLEMENTED.** Public pages emit conservative `ProfilePage` JSON-LD matching visible data. No unproven `Person`/organization claims or private fields are generated.

## 26. Open Graph

**IMPLEMENTED.** Public Creator OG/Twitter metadata and image delivery are server-mediated. Private/missing states use generic noindex output without specific identity.

## 27. Sharing

**IMPLEMENTED.** Creator sharing uses the clean canonical URL and the existing WP9 share/card architecture; no second share subsystem was introduced.

## 28. Firestore/Functions impact

**IMPLEMENTED.** Added creator identity callable/HTTP delivery in `functions/src/creatorIdentity.ts`, exports in `functions/src/index.ts`, Hosting rewrites in `firebase.json`, and deny-by-default direct client access in `firestore.rules`. No existing collection, callable, Space ID or Storage path was renamed.

## 29. Security/privacy

**VERIFIED LOCALLY.** Direct browser reads of creator collections are denied. Public responses are allowlisted, profile image delivery rechecks visibility, malformed input is rejected, and telemetry contains no handle, name, URL, UID or email. **REQUIRES DEPLOYMENT:** Rules/Functions emulator or isolated Firebase verification.

## 30. Account deletion

**IMPLEMENTED.** Existing deletion pipeline now includes creator account/profile/owner mapping/handle aliases and Creator image objects. Cleanup remains scoped to the deleting account.

## 31. Data export

**IMPLEMENTED.** Account export now includes creator account/profile/handle state in the private export without changing existing export fields.

## 32. Telemetry

**IMPLEMENTED.** Reuses WP6 allowlisted telemetry with `creator_profile_viewed` and `creator_profile_saved`; only safe mode/outcome dimensions are emitted.

## 33. Accessibility

**VERIFIED LOCALLY.** Semantic headings/regions, keyboard-reachable links and controls, explicit labels, visible focus, generic private state and 44×44 mobile close target. Reduced-motion behavior inherits the shared global policy.

## 34. Mobile

**VERIFIED LOCALLY.** Browser QA at 390×844 and 360×800: Account close is visible at 44×44, no horizontal page overflow, no desktop-only movement hint, and the missing/private Creator route shows no sensitive data. **REQUIRES REAL DEVICE:** iOS Safari/Android Chrome profile editing and image selection.

## 35. Performance before/after

**VERIFIED LOCALLY.** WP9 baseline → WP10 final: total JS gzip 532,503 → 538,393 B; CSS gzip 32,412 → 34,667 B; largest lazy JS 180,266 → 180,987 B; entry JS 108,129 → 107,653 B. All warning budgets pass; CSS has 333 B headroom and should be watched.

## 36. Bundle before/after

**VERIFIED LOCALLY.** Anonymous Creator UI is lazy-loaded (`CreatorProfilePage` 1.58 KB gzip JS + 1.35 KB gzip CSS). Authenticated Account logic is not pulled into that lazy Creator chunk. Total JS change: +5,890 B gzip; CSS: +2,255 B gzip; entry: −476 B gzip.

## 37. Visual refinement

**IMPLEMENTED.** Creator pages use the established LIEUVA typography, neutral/acid palette, generous imagery and restrained editorial layout. Account controls were regrouped rather than visually forked.

## 38. Browser QA

**VERIFIED LOCALLY.** Local Vite: desktop 1440×1000; mobile 390×844 and 360×800; anonymous Account; missing/private Creator route. No horizontal overflow or unexpected visible application error. Signed-in editing and a real public fixture remain external checks.

## 39. Test results

**VERIFIED LOCALLY.** Root `npm run check`: 38 files / 248 tests, lint and production build pass. Functions `npm run check`: 6 files / 43 tests and TypeScript build pass. Release gate: 8 files / 71 tests pass (subset of root coverage). Creator-specific client/server tests include normalization, reserved/case collisions, transaction race behavior, aliases, eligibility, privacy, WebP validation and response shaping.

## 40. Migration behavior

**VERIFIED LOCALLY.** Existing public Spaces, legacy schema reads, AURA technical identifiers, Firebase collections, Storage objects, share IDs, clean/hash compatibility and DannyHirschArts remain untouched. Spaces without Creator identity remain valid and unattributed.

## 41. Files changed

**IMPLEMENTED.** `firebase.json`, `firestore.rules`, Functions identity/index/data-rights/observability/SEO files and tests; `src/App.tsx`; Account dialog/settings; Creator profile/attribution components and styles; creator/profile image services and tests; route/share/telemetry/global style integration. This document records the full scope.

## 42. Remaining conditions

**REQUIRES DEPLOYMENT:** isolated Firebase verification of transaction contention, Rules, image mediation, sitemap/canonical/OG and deletion cleanup. **REQUIRES REAL DEVICE:** mobile image chooser/crop/save, signed-in Account editing and public Creator visual QA. Bundle CSS budget is close and must not grow casually.

## 43. Deployment requirements

**REQUIRES DEPLOYMENT.** Later authorized release must deploy the updated Firestore rules, Hosting configuration and Functions exports for creator identity/document/image/attribution plus the updated sitemap. No new Firestore index is currently required by the implemented bounded queries. WP9 delivery Functions/Hosting conditions still apply. No deployment, DNS change, commit or push was performed in WP10.
