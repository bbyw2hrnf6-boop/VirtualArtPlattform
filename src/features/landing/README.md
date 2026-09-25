# LIEUVA homepage contract

**Status:** current product and presentation contract, checked against the repository on 2026-09-25. For launch risks and live qualification, use [`audit/CURRENT-STATE.md`](../../../audit/CURRENT-STATE.md). For the three-world film and standalone guided visits, use the [showcase direction](../showcase/README.md).

## Product promise

LIEUVA lets people create, publish and explore walkable 3D Spaces for art, design and ideas in a browser. A creator can start with one of three Studio templates, arrange work, preview the visit and publish a shareable Space. Visitors can enter public Spaces and meet Creators. The homepage should make those actions understandable without requiring 3D expertise.

Keep the language consistent with [`PRODUCT_BRAND`](../../config/brand.ts): **LIEUVA**, “Give your work a place”, “Create a Space” and “Explore the demo”. Preserve the difference between a local draft, a published Space and an Explore listing. The controlled pilot has guest and verified-account paths; professional plans, permanent hosting and billing are not active. The [publishing contract](../../../audit/PUBLISH-UPDATE-RELEASE-GATE.md) and [current state](../../../audit/CURRENT-STATE.md) govern details that the homepage summarizes.

## Page journey

| Section | What it must communicate | Primary next step |
| --- | --- | --- |
| Studio story and poster | A creator chooses a room, brings work, shapes the setting and shares a walkable Space. The 20-second scroll/play story presents the real shared Studio scene; the poster still explains the product when that scene is delayed or unavailable. | Open the template chooser at `#/create`; do not silently create a project from the story. |
| Beyond the Studio | Obsidian, Sculpture Pavilion and Forest Fold House demonstrate individually authored worlds. They are read-only showcases, separate from the three Studio templates. The optional 20-second video is a montage of these worlds, not the Studio story. | Open each original showcase from its card. |
| Follow the work | Visitors can explore eligible Spaces and Creator profiles and enter the Danny reference exhibition. | Explore Spaces, Creator Hub or the reference exhibition. |
| Pilot explanation and FAQ | Guest publication, account control, visibility, review and hosting limits are explained in plain language. Bespoke projects are available on request, with the current contact route still pending. | Choose the available creation or exploration path without implying that a future plan is live. |

## Acceptance criteria for homepage changes

- A first-time visitor can distinguish **create**, **explore published work** and **enter a bespoke example**, and can reach each action from the page.
- The three Studio templates and three bespoke showcases stay distinct in copy, links and imagery. A showcase must not promise Studio editing or Firebase publication.
- Copy does not turn a local save into a live publication, an Explore request into guaranteed placement, or a future paid feature into a current offer.
- The Studio story keeps a readable poster and a working Create action while WebGL loads, fails or is deferred by Data Saver. The three-world film loads media only after an explicit Play action; its cards remain usable without playback. Reduced motion keeps useful still content and direct actions.
- Keyboard access, visible focus, readable mobile layouts and 44 px touch targets remain available. Review desktop and 390 × 844 layouts after visual changes.

## Where to work and verify

- Product name and shared promise: [`src/config/brand.ts`](../../config/brand.ts). Story chapters and motion: [`scrollStoryModel.ts`](./scrollStoryModel.ts), [`ScrollGalleryStory.tsx`](./ScrollGalleryStory.tsx) and [`StoryPoster.tsx`](./StoryPoster.tsx).
- Homepage sections and current pilot copy: [`ShowcaseCollection.tsx`](./ShowcaseCollection.tsx), [`PitchSections.tsx`](./PitchSections.tsx) and the `Landing` composition in [`src/App.tsx`](../../App.tsx). The three-world film behavior is specified in the [showcase direction](../showcase/README.md).
- Nearby checks: [`ScrollGalleryStory.contract.test.ts`](./ScrollGalleryStory.contract.test.ts), [`ShowcaseCollection.test.tsx`](./ShowcaseCollection.test.tsx), [`tests/browser-smoke/public-shell.spec.ts`](../../../tests/browser-smoke/public-shell.spec.ts), [`space-story.spec.ts`](../../../tests/browser-smoke/space-story.spec.ts) and [`visual-regression.spec.ts`](../../../tests/browser-smoke/visual-regression.spec.ts).

When the page's promise, section purpose, offer or entry path changes, update this contract in the same change. Update the scoped showcase, publishing or access contract if its behavior changes. Change [`audit/CURRENT-STATE.md`](../../../audit/CURRENT-STATE.md) only when the product boundary, current risk or priority changes; dated test evidence does not become a current-status claim by itself.
