# LIEUVA Mobile Experience and AI Direction

- **Status:** durable direction draft; implementation remains subject to product review and measured validation
- **Reviewed:** 2026-09-11
- **Repository review baseline:** `a532c01546f9a53048c0c641848f2d4d5a617329`
- **Live baseline at review:** `3e6e58226c3b6204e06033b1e5df0957fa2fc2d5`
- **Scope:** visitor mobile experience, mobile Studio, WebGL resilience and bounded AI assistance

## Executive decision

LIEUVA should treat mobile as two related products, not as a smaller desktop layout:

1. a visitor experience whose primary job is to help somebody find, understand and share art; and
2. a creator workspace whose primary job is to preserve work while making spatial editing precise, reversible and understandable.

The next mobile investment should therefore prioritize interaction safety, orientation, recovery, accessibility and real-device performance before adding more visual motion or broader AI behavior. Immersion is useful only when the visitor remains oriented and in control. Empirical museum studies repeatedly report disorientation, missed controls, unreadable labels and low learnability; one 2024 mobile study did not find that greater immersion by itself improved ease or enjoyment.[^4][^5][^6]

At the review start, the feature labelled **AI Curator** was not a remote generative-AI system. It analyzed image palettes locally and used bounded heuristics, randomized compatible choices, the placement repair path and the existing validator.[^3] The current change now presents it as **Auto-arrange**, explicitly says that it runs locally and states that no artwork is sent to an AI service. **Decision:** this truthful boundary must remain unless a real, separately consented model integration exists.

If GPT-6 Astra is introduced, it should be an optional semantic suggestion layer. Astra may produce a typed *curation brief* or draft text; it must not emit authoritative coordinates, bypass the placement solver, alter the draft without confirmation, or publish. The deterministic solver and shared placement validator remain authoritative. Every model-assisted flow ends in **Preview changes → Apply, Edit or Discard**, and applying one proposal creates exactly one undo transaction.

The durable product boundary is:

```text
Creator intent and selected inputs
        ↓ explicit opt-in + exact data preview
Server-side AI adapter (`store: false`)
        ↓ strict, versioned CurationBrief schema
Deterministic layout solver
        ↓
Shared placement validator
        ↓
Human-readable diff
        ↓
Apply / Edit / Discard → one Undo step
        ↓
Existing pre-publish review → explicit Publish
```

This direction does not authorize a renderer rewrite, an identifier migration, deployment, live-data changes or a new public-upload policy. Existing AURA/gallery contracts remain unchanged.[^1][^2]

### Implemented now and still open

Implemented in the current working change:

- honest **Auto-arrange** wording for the local heuristic, including its data boundary;
- visible mobile `Draft · Not live` / publication scope and save state;
- at least 44-pixel mobile header, room-turn and visitor-help controls;
- stronger mobile upload-ready contrast;
- a short-screen tool sheet that overlays rather than compresses the remaining canvas;
- reduced blur and shadow cost on mobile canvas overlays;
- an actionable lightweight poster when the browser reports Data Saver through `navigator.connection.saveData`; and
- compact visitor actions whose labels remain readable instead of being clipped.

Still open and not claimed by this document:

- the physical iOS Safari, Android Chrome and in-app-browser release gate;
- an explicit cross-browser lightweight-mode control before claiming Data Saver coverage on Safari/iOS;
- persistent orientation state, map/zone overview and visited-state validation;
- a direct **Enter 3D** versus **View works** choice at Space entry;
- state-preserving WebGL context-loss recovery with directory fallback; and
- any real GPT-6 Astra pilot, provider data flow or production AI endpoint.

### Repository journey audit

The implementation was inspected end to end at 390 × 844, 360 × 800 and the limiting 320 × 667 viewport: landing, Explore, every template entry, upload and placement, reload/recovery, Arrange, Walk Preview, publish review, Account, Creator Hub, the Danny reference and a public Space. No login, publish, deployment or live-data mutation was performed. Browser emulation validates layout and behavior contracts, not physical-device GPU or thermal behavior.

| Journey area | Observed repository state | Disposition |
| --- | --- | --- |
| Landing handoff | The initial poster and the WebGL story previously swapped both label and destination after the mobile defer window. | The poster now offers the same “Open this Space in Studio” intent, and Data Saver keeps that actionable lightweight path. The normal progressive swap remains covered by the story smoke suite. |
| Discovery | Search and Explore are both functional but open separate discovery surfaces with overlapping purpose. | Keep both for now; consolidate only after an information-architecture decision and search/explore task testing. |
| Studio save confidence | Compact CSS hid the scope and left only `Ready`, `Saving…` or `Saved`, although a local draft is not necessarily live. | Fixed: scope such as `Draft · Not live` or `Changes · Not live` remains visible beside the save state. |
| Studio canvas and sheets | At 320 × 667, opening a half-height tool sheet compressed the usable canvas to roughly 178 pixels. | Fixed: on short screens the sheet overlays the stable canvas. A browser assertion now guards the canvas height. |
| Touch geometry | Landing/Studio logos, Search, Account and 36-pixel room-turn controls included targets below the repository's 44-pixel minimum. | Fixed for the audited controls and guarded at 320 × 667. Continue auditing any new icon-only action. |
| Upload feedback | The mobile success message used 10-pixel, low-contrast text on the light tool sheet. | Fixed with a 12-pixel high-contrast light-surface treatment. |
| Walk controls | Five visitor actions plus the D-pad were functional, but action labels clipped at narrow widths and the overall control density remains high. | Clipping is fixed; a later orientation study decides whether secondary actions move into a sheet. Reset, artwork access and Help must remain obvious. |
| Local automation | UI copy implied remote AI although [`autoCurator.ts`](../src/features/gallery/autoCurator.ts) performs local color sampling and bounded arrangement rules. | Fixed as `Auto-arrange`, with the local/no-AI-service boundary and reversible result tested. |
| Publish and recovery | Upload, undo/redo, reload recovery and publish review completed at mobile sizes; blocking geometry feedback remained available. Some guest/publish explanation sits below the first viewport. | Preserve the working safety path. Reorder explanatory copy only with a focused publish-comprehension test. |
| Creator Hub | The signed-out composer dominates the narrow first viewport, and at 320 pixels the bottom navigation can crowd the sign-in action. | Open P2 layout refinement; do not mix it into the 3D control change without its own Hub visual and auth-state coverage. |
| Existing 3D safeguards | The runtime already caps initial DPR, adapts quality from measured frame time, pauses work with page visibility, disposes resources and provides an artwork directory. Context events are observed, but a failed restoration does not yet guarantee stateful directory fallback. | Keep these foundations. Finish forced-loss recovery and physical-device soak evidence before claiming mobile resilience complete. |

## Method and limits

### Evidence method

Research was conducted to 2026-09-11 and triangulated four evidence classes:

| Class | Use in this document | Examples |
| --- | --- | --- |
| Normative and platform guidance | Hard accessibility and interaction constraints | WCAG 2.2, Apple HIG, Android accessibility guidance |
| Primary technical documentation | Capability, data and runtime constraints | OpenAI, Chrome, MDN, Khronos, Three.js, EU Commission |
| Empirical research and museum practice | Repeated user problems and domain-specific patterns | PLOS ONE, Electronics, Springer, Cleveland Museum of Art, The Met, Nasher Museum |
| Practitioner/community discussion | Directional warning signals only | Three.js Forum and Reddit discussions |

Recommendations marked **Decision** are LIEUVA product or engineering judgments. They are not claims made by the cited source. Proposed thresholds beyond published standards are initial internal budgets and must be calibrated with field data.

### Material limits

- The museum studies used different systems, including panorama tours and headset variants. Their interaction failures transfer directionally to LIEUVA, but their absolute scores do not.
- Study populations were limited. The 2024 PLOS sample was predominantly Chinese and young or university educated; the 2025 study had 64 participants; the smartphone museum study had 40; the 2023 remote study had 14 and used desktop input.[^4][^5][^6][^7]
- Reddit and forum posts are self-selected, non-representative and sometimes lack device diagnostics. They are included only when they converge with standards, technical documentation or empirical findings.
- This research did not itself execute the still-open physical iOS Safari and Android Chrome acceptance pass documented in the current-state boundary.[^2]
- Astra capabilities, prices, availability, snapshots and data controls are time-sensitive. They were checked on 2026-09-11 and must be revalidated before implementation.[^24][^26]
- `store: false` limits Responses application-state storage but does not by itself remove default abuse-monitoring logs, which may contain customer content and are generally retained for up to 30 days. Eligible organizations may separately qualify for Modified Abuse Monitoring or Zero Data Retention.[^26]
- The EU AI Act notes below are a product-risk flag, not legal advice. Article 50 has applied since 2026-08-02; exact duties depend on the output, context and the substance of human editorial review.[^32]

## Prioritized direction

### P0 — required before expanding mobile or AI scope

| Rank | Evidence | Decision | Completion evidence |
| --- | --- | --- | --- |
| P0.1 Input ownership and drag alternatives | WCAG 2.2 requires a single-pointer alternative for non-essential dragging and complex multipoint/path gestures. Browsers cancel pointer sequences when native scrolling or zooming takes ownership.[^8][^9] | Keep page scrolling native outside an explicitly active canvas. Use `touch-action` only on the interaction region that needs it. Every drag, pinch or rotation task also needs a tap, nudge, stepper or numeric path. A `pointercancel`, lost capture or mode switch rolls the proposed change back transactionally. | Automated coverage for pointer down/move/cancel and lost capture; all transforms complete without dragging; no page-scroll lock outside the focused canvas. |
| P0.2 Stable touch geometry and viewport behavior | Apple recommends 44 × 44 pt controls; Android recommends at least 48 × 48 dp. Mobile visual and layout viewports diverge when browser chrome or the keyboard appears.[^10][^11][^12] | Preserve the repository's 44 × 44 CSS-pixel minimum and prefer 48-pixel primary dock targets. Reserve toolbar geometry before icons or state arrive. Apply safe-area insets and VisualViewport-aware keyboard handling; do not base the editor solely on `100vh`. | Portrait, landscape, 200% text, expanded/collapsed Safari bars and keyboard runs show no covered primary action, shifting active target or inaccessible selected item. |
| P0.3 Spatial orientation | Across virtual-gallery research, users lost awareness while following floor points, remained unintentionally zoomed, misunderstood inaccessible space and requested maps, history and clearer guidance.[^4][^5] | Make Reset View continuously available. Add a compact room/zone orientation affordance, current location, visited state and a previous-position action. Destination transitions must face the target; unavailable paths must look unavailable. Filter artwork hotspots by proximity to prevent clutter. | A novice can enter, locate a named work, inspect it and return to the start without facilitator help. Arrival direction and unavailable boundaries pass deterministic journey tests. |
| P0.4 Work preservation and precision | Creative-tool users repeatedly describe gesture-mode conflicts, moved toolbars, lost canvas centers and undo operations that reverse too much. This evidence is anecdotal but aligns with WCAG's demand for alternatives and LIEUVA's transactional invariants.[^8][^35][^36] | Keep visible adjacent Undo and Redo, save scope and save state. Treat one continuous gesture and one accepted AI proposal as one semantic transaction. Provide Recenter, snap/alignment feedback and coarse/fine or numeric controls. Backgrounding, rotation, keyboard appearance and interrupted gestures must never leave mesh, React state and persisted draft inconsistent. | Characterization tests cover interruption at every edit phase. Recovery restores the same selection and valid transform. Undo reverses exactly one user-recognizable action. |
| P0.5 WebGL recovery and physical-device gate | Mobile WebGL guidance stresses explicit resource budgets, smaller backbuffers, batching, compressed textures and avoiding blocking calls. A restored WebGL context invalidates prior resources. Desktop emulation cannot reproduce mobile GPU, memory-bandwidth or thermal behavior.[^13][^14][^15] | Pause render/decode work when hidden; dispose obsolete textures and buffers; cap quality through measured frame-time tiers and hysteresis rather than user-agent detection. Restore scene resources and draft state after context loss. After one controlled failed recovery, present the full artwork directory instead of a retry loop. Physical iOS Safari and midrange Android Chrome are release gates, including in-app browsers and a 20-minute soak. | Zero unhandled context loss in the device matrix; a forced loss restores valid scene/state or reaches the directory; no unbounded resource growth in the soak; background/foreground, lock, call interruption and rotation preserve the draft. |
| P0.6 Progressive access and motion control | Canvas content needs an accessible fallback. WCAG requires control over qualifying auto-moving content, and `prefers-reduced-motion` communicates a request to minimize non-essential motion.[^16][^17][^18] | Treat the non-WebGL artwork directory as a first-class visitor path with the same works, metadata, order and canonical links. The 20-second landing sequence must have Pause/Skip, never gate navigation and become static or cross-faded under reduced motion. Native scrolling remains authoritative. | A visitor can find, read and share every work with WebGL unavailable and through screen-reader navigation. Reduced-motion mode has no camera travel; the page remains reversible and interruptible. |
| P0.7 Honest AI presentation and authority | Human-AI guidance emphasizes accurate mental models, visible control, editability and a manual fallback. Museum experiments report hallucinations, tone drift and layouts or descriptions that experts must override.[^27][^28][^29][^30][^31] | Keep the implemented **Auto-arrange** wording truthful. Any future Astra feature is explicitly optional and proposal-only. Show what will change, preserve manual operation and keep creator/editor approval authoritative. No model output may publish automatically or bypass validation. | Copy and telemetry distinguish local heuristic from model-assisted results. Tests prove timeout/refusal/schema failure leaves the draft unchanged and that publication always needs the existing explicit review action. |

### P1 — next improvements after P0 evidence exists

| Rank | Evidence | Decision | Completion evidence |
| --- | --- | --- | --- |
| P1.1 Contextual first-run learning | Smartphone museum participants needed operating instructions, map labels and visited markers. In another mobile study, users requested slower movement and easier viewpoint changes.[^5][^6] | Use at most three dismissible coach marks: Look, Move, Inspect. Hide each after demonstrated success and keep Help available. Default mobile movement should be slower, with a visible speed choice. Do not require signup before exploration. | Moderated novice rounds show successful first movement, inspection and reset without spoken instruction; Help can be replayed and never blocks the canvas. |
| P1.2 Artwork inspection as editorial DOM | Virtual-tour participants tried to read real labels and usually found the available information insufficient; mobile users also missed small text and icons.[^4][^5] | Selecting a work should stabilize or frame it, then open a nonmodal DOM bottom sheet with title, creator, description and an optional high-resolution view. Preserve Close, Back and Reset. Do not depend on small in-scene texture labels. | Metadata remains usable at 200% zoom and by screen reader; closing returns to the same location and orientation. |
| P1.3 Progressive room/media loading | KTX2/Basis can reduce transfer and GPU memory for suitable textures; Three.js supports KTX2, Meshopt and Draco paths but still requires deliberate resource disposal.[^19][^20] | Show meaningful editorial content or a room poster first, then room shell, then visible works, then secondary details. Evaluate KTX2 for authored environment/material textures while retaining an explicit artwork-fidelity and color-management policy. | Measure poster, room-interactive and all-visible-work milestones separately. Compression is accepted only after visual review of artwork and material fidelity. |
| P1.4 Astra curation-brief pilot | GPT-6 Astra accepts text and image input and supports Structured Outputs, function calling and streaming; audio input/output is not supported. Structured Outputs can constrain responses to a versioned JSON schema but do not make the content true or geometrically valid.[^24][^25] | Send only the explicitly previewed scope. Astra may return mood, narrative arc, grouping intent, emphasis, palette family and explanation. It must not return final coordinates or executable actions. The deterministic solver translates the brief into candidates, then the shared validator accepts or rejects them. | Versioned fixtures, refusal cases and adversarial inputs pass. Unknown keys fail closed. Every accepted proposal produces a comprehensible before/after diff and one undo step. |
| P1.5 Assistive copy, not invented scholarship | Cleveland Museum of Art uses AI to draft descriptions within a human-governed style guide and preserves expert override. The Met uses AI to simplify or translate existing expert text while warning about tone drift. W3C notes that alt text depends on the image's purpose and context.[^29][^30][^33] | Offer drafts for alt text, long description, shortening and translation only when source material is selected. Label drafts, expose source text and require approval. Never invent artist biography, provenance, interpretation, dates, materials or accessibility claims. | Factual-preservation evals and expert review precede release. Empty or insufficient source material returns a request for input, not fabricated copy. |
| P1.6 Native share and stateful return | The Web Share API provides an OS-native share mechanism under secure-context and user-activation constraints.[^21] | Prefer native Share on supported mobile devices, with Copy Link fallback. Browser Back from artwork detail must restore the previous room position and selected context. | The exact canonical Space URL is shared; canceling Share changes nothing; return navigation restores position without reload-induced loss. |

### P2 — investigate only after P0/P1 outcomes are measured

| Rank | Direction | Guardrail |
| --- | --- | --- |
| P2.1 Optional guided exhibition route | A curator-defined route may reduce novice uncertainty, but must not replace free exploration or imply that every visitor wants a game-like tour. |
| P2.2 Creator-controlled preferences | Remember movement speed, reduced visual density or last-used tool locally only after explaining scope and offering Reset. Do not infer sensitive preferences or silently train a profile. |
| P2.3 Provenance display | If LIEUVA later handles generated or materially edited media, evaluate direct, neutral provenance presentation and C2PA-compatible signals.[^34] Machine-readable provenance complements, but does not replace, visible disclosure where required. |
| P2.4 Separate listen mode | Astra itself has no audio modality. Any text-to-speech or audio-guide work is a separate accessibility and rights project, not a hidden extension of the curation pilot.[^24] |

### Explicit non-goals

Do not add a global AI chat bubble, autonomous publishing, model-generated final coordinates, generated imitation of an artist's style, voice cloning, a model-based authenticity detector, opaque Discover ranking or automatic replacement of artist/curator copy. Community sentiment in museum practice is particularly sensitive to authenticity and replacement of expert voice; those Reddit signals are qualitative, not representative.[^37]

## Complete mobile journey

The journey below is the target interaction contract. Existing product capabilities are described in the repository README and current-state record; this table defines the mobile direction, not present-tense implementation claims.[^1][^2]

| Stage | User goal | Required mobile behavior | Failure/recovery contract |
| --- | --- | --- | --- |
| 1. Landing arrival | Understand LIEUVA and proceed | Readable editorial poster immediately; native scrolling; visible Explore/Create routes; Pause/Skip for the room sequence | 3D or film failure leaves navigation and core proposition intact |
| 2. Explore Spaces | Find something worth entering | Stable cards, clear creator/title/privacy context, no late control movement, touch targets at least 44 px | Empty/error states explain the condition and allow retry without losing filters |
| 3. Creator profile | Understand authorship and body of work | DOM text, consistent card order, direct links and a clear back path | Missing media keeps title/metadata and accessible placeholder |
| 4. Space choice | Choose 3D or direct art access | Offer **Enter 3D** and **View works** as peer paths, not capability/error hierarchy | Unsupported WebGL selects View works automatically while explaining that 3D is unavailable |
| 5. Load | Reach useful content quickly | Poster/skeleton first; room shell and visible work progressively; announced status without blocking the whole page | Cancel/back remains available; asset failure identifies retry or opens directory |
| 6. First entry | Learn controls without a tutorial wall | Three contextual prompts maximum; slow default movement; Reset and Help visible | Prompts are dismissible, replayable and absent after learned actions |
| 7. Walk | Move without fighting page scroll | Explicit canvas focus; predictable one-finger movement; alternative directional controls; clear exit from Walk | Lost pointer, browser gesture or interruption stops motion safely |
| 8. Orient | Know location and recover | Current zone, compact map/room list, previous position, visited state and Reset View | Teleport never leaves the camera facing away; blocked paths are visually and semantically disabled |
| 9. Inspect artwork | Read and look closely | Tap/select frames the work; DOM bottom sheet carries title, creator and description; pinch and buttons both zoom | Closing or Back returns to the same position; high-resolution failure retains metadata |
| 10. Share/leave | Share the exact work or Space | Native Share first, Copy Link fallback; canonical URLs | Canceling share changes nothing; link copy receives explicit success/failure feedback |
| 11. Start creating | Pick an appropriate room | Mobile-comparable template summary, real spatial differences, demo/preview before commitment | Back preserves the user's path; choosing another template never deletes an existing draft silently |
| 12. Upload | Add artwork safely | Mobile picker/camera-source compatibility, visible per-file progress, clear size/type errors, no hidden primary action under keyboard | Partial success identifies each file; retry does not duplicate accepted uploads; draft survives navigation |
| 13. Arrange | Select, place and transform precisely | Clear Arrange mode, selected item always identifiable, tap placement plus drag, nudge/numeric precision, stable dock and bottom inspector | Invalid placement is rejected transactionally with a specific reason and recovery action |
| 14. Design room | Change surfaces, light and objects | Contextual sheet; canvas remains sufficiently visible; Apply/Done explicit; frequent tools stay one tap away | Closing sheet preserves accepted changes; cancel restores the prior transaction |
| 15. Request assistance | Get a bounded variation or text draft | State whether the feature is local or Astra-assisted; show data scope; explicit Run; cancellable progress | Timeout/refusal/error leaves draft unchanged and manual editing available |
| 16. Review AI proposal | Decide, do not merely accept | Before/after summary, affected scope, rationale and validation result; Apply, Edit, Discard | Apply creates one undo step; Discard sends no layout mutation; invalid candidate cannot be applied |
| 17. Walk Preview | Experience exactly what visitors will get | One obvious mode switch; tools disappear but exit remains visible; location/session persist | Returning to Arrange retains selection, camera context and draft |
| 18. Interrupt/recover | Resume after ordinary mobile interruption | Autosave status remains visible; background rendering pauses; recovery returns to last valid transaction | App kill, lock, call, rotation and context loss restore valid draft or provide explicit recovery choice |
| 19. Pre-publish review | Understand blockers | Group issues by artwork/room; each issue links to the relevant edit context; privacy/share mode explicit | Publish stays blocked for invalid geometry and explains every blocker; draft remains intact |
| 20. Publish and update | Finish and share confidently | Explicit Publish/Update, progress, canonical URL and native Share; guest/account consequences stated before commitment | Retry is idempotent; no double publication; failed update leaves the previous live revision intact |

## Astra role and AI trust contract

### Bounded Astra role

As of 2026-09-11, GPT-6 Astra supports text input/output, image input, Streaming, Function Calling and Structured Outputs; it does not support audio. OpenAI lists a 1,050,000-token context window and version-sensitive token pricing.[^24] Those capacities do not justify sending full-resolution collections or large draft histories. LIEUVA should minimize the request around the chosen task and validate a pinned model configuration against its own evaluation set before changing it.[^23]

The first acceptable Astra use is a structured semantic brief:

```ts
type CurationBriefV1 = {
  schemaVersion: "1";
  intent: "quiet" | "warm" | "bold" | "custom";
  narrativeArc: string;
  grouping: Array<{
    artworkIds: string[];
    relationship: string;
    emphasis: "primary" | "supporting";
  }>;
  atmosphere: {
    wallFamily: string;
    floorFamily: string;
    lightingIntent: string;
  };
  constraintsAcknowledged: string[];
  rationale: string;
};
```

This is an illustrative contract, not an implementation-ready schema. Production enums must reference actual catalog/template IDs, cap every collection and string, reject unknown fields, validate artwork IDs against the current draft and record a schema version. Structured Outputs constrains shape; the application must still validate meaning, authorization and geometry.[^25]

### Trust contract

| Clause | User-facing promise | Engineering enforcement |
| --- | --- | --- |
| Truthful identity | LIEUVA states whether a result came from local rules or a named model-assisted feature | Separate result types and labels; never reuse `AI Curator` copy for a local-only run |
| Explicit invocation | AI runs only after the creator asks for it | No background model calls on upload, open, save, preview or publish |
| Data preview | Before sending, show whether titles, descriptions, reduced images or other fields leave the browser | Scope object is rendered from the exact outbound request; consent is request-specific, not bundled into general use |
| Data minimization | Send the minimum necessary version of selected content | Strip EXIF, downscale image inputs when vision is necessary, omit account/profile and unpublished unrelated work |
| Server boundary | API credentials and provider policy remain server-side | Authenticated, rate-limited server adapter; no browser API key; `store: false`; documented region and retention configuration |
| Honest retention | Do not describe `store: false` as zero retention | Product notice reflects default abuse-monitoring retention and any approved organization controls[^26] |
| Proposal-only authority | AI suggests; creator decides | Output cannot invoke publish or mutate state. UI exposes Apply, Edit and Discard |
| Deterministic safety | Model language never becomes placement truth | Solver maps brief to candidate; shared validator is mandatory for every affected rectangle/footprint |
| Visible consequence | The creator can understand the proposed scope | Diff names moved works, changed surfaces, lighting and objects before Apply |
| Reversibility | One accepted proposal is one undoable action | Transaction snapshot before apply; Undo restores the complete prior draft |
| Failure containment | AI failure cannot cost work | Timeout, refusal, malformed schema, stale draft or validation error produces no mutation |
| Human editorial control | Artist/curator text remains authoritative | Generated text is a draft with source comparison and explicit approval; human edits are never overwritten automatically |
| No invented facts | AI does not manufacture cultural metadata | Biography, provenance, date, medium and interpretation require supplied source material; insufficient evidence yields a question |
| Accessible output | AI assistance never replaces accessible product structure | Directory, labels, keyboard/touch alternatives and human-authored override remain available without AI |
| Neutral disclosure | Assistance is marked clearly without presenting a model result as authenticated truth | Direct label such as “AI-assisted draft”; provenance display follows output type and applicable review policy[^32][^34] |
| Minimal telemetry | Improvement data does not become a shadow collection archive | Record model/schema version, duration, token/cost band, request-scope categories, validation outcome and user action; do not log raw images, prompts or generated copy in analytics |
| Reproducible change | A later team can identify what produced a proposal | Store bounded technical metadata with the local transaction: provider, model snapshot/alias, prompt-template version, schema version and validator version |
| Manual fallback | Every task remains possible without AI | Local/manual Arrange, metadata edit and publication paths remain complete |

PAIR recommends disclosing collected feedback and its purpose, providing a manual fallback, and allowing users to edit or reset prior preferences. Microsoft describes its HAX guidelines as evidence-based practices spanning initial interaction, normal use, errors and use over time.[^27][^28] These principles support the trust contract; they do not substitute for LIEUVA-specific tests.

### Copy-assistance boundary

Permitted P1 tasks are:

- draft context-specific alt text;
- draft a longer visual description;
- shorten an existing creator statement;
- translate supplied text while preserving names, titles, dates, measurements and uncertainty;
- suggest questions where source information is missing.

Each result must be visibly a draft and editable. Alt text and long description are different fields: the correct alt treatment depends on the image's purpose and nearby content, so a generic visual caption is not automatically accessible alt text.[^33]

The Cleveland Museum of Art's accessibility project is a useful governance model because AI drafting sits under a human-authored style guide, disabled experts participate, origin is disclosed and people can override the system. The Met's experiment shows scale potential for translation/simplification but also tone drift. The Nasher experiment demonstrates why cultural interpretation and layout choices need expert review: the chatbot produced hallucinations and unsuitable recommendations.[^29][^30][^31]

## Measurement plan

### Measurement principles

1. Measure visitor and creator journeys separately.
2. Segment by browser, physical device class, viewport/orientation, reduced-motion preference and 3D quality tier.
3. Use field data for user-visible performance and controlled device runs for diagnosis. Core Web Vitals should be assessed at the 75th percentile, separately for mobile and desktop.[^22]
4. Keep product analytics behind the repository's existing consent and privacy boundary. Do not join raw interaction telemetry to Auth/profile identity and do not record artwork content in events.[^2]
5. Establish the current baseline before changing budgets. An improvement without a baseline is a hypothesis, not evidence.

### Scorecard

| Area | Metric or test | Initial gate | Evidence type |
| --- | --- | --- | --- |
| Web performance | Mobile p75 LCP / INP / CLS | LCP ≤ 2.5 s; INP ≤ 200 ms; CLS ≤ 0.1 | Published Core Web Vitals thresholds[^22] |
| Progressive 3D | `poster_visible_ms`, `room_interactive_ms`, `visible_art_ready_ms` | Baseline per device/network; no regression without reviewed tradeoff | LIEUVA judgment |
| Frame stability | active walkthrough frame-time distribution and stalls over 100 ms | Establish on physical reference devices; choose quality tier from measured hysteresis, not UA | LIEUVA judgment informed by MDN/Chrome[^13][^15] |
| Resilience | context-loss count, successful restore, fallback activation, 20-minute soak | No unhandled crash; forced loss restores state or reaches directory; no monotonic resource growth | LIEUVA gate |
| Input integrity | pointer cancel/lost capture/background/rotation test matrix | 100% returns to prior or next valid transaction | Repository invariant |
| Accessibility | drag-free completion, keyboard/switch path, 200% text, reduced motion, directory parity | Every core visitor/editor task has a non-drag path; no occluded action; no camera travel in reduced motion | WCAG/LIEUVA gate[^8][^17] |
| Visitor orientation | task success, time to named artwork, Reset use, wrong-turn/retrace events | Baseline with novices; no unresolved critical failure in release round | Product research measure |
| Artwork access | select-to-readable-details success, directory fallback use, share completion | Same metadata and URL available with and without WebGL | LIEUVA gate |
| Creator safety | recovered-draft success, invalid placement rejected, undo semantic correctness | Zero silent work loss; 100% invalid candidates rejected | Repository invariant |
| AI reliability | strict-schema success, stale-draft rejection, solver/validator rejection, timeout/no-mutation | 100% fail closed; zero direct publish capability | AI trust contract |
| AI utility | Apply/Edit/Discard rate, post-apply Undo, time saved on selected task | Pilot baseline; retain only if creators understand and intentionally use it | Product judgment |
| AI factuality | preservation of supplied names/dates/materials; unsupported factual additions | Zero unsupported facts in launch evaluation set | Cultural-content gate |
| AI privacy | scope-preview agreement, request payload audit, raw-content analytics scan | Outbound request matches preview; no raw content in telemetry | Trust contract/data review |

### Device and interruption matrix

The minimum pre-release run should cover:

- current iPhone/Safari and one older supported iPhone/Safari;
- a current flagship and a midrange Android/Chrome device;
- portrait and landscape, browser bars expanded/collapsed, 200% text and reduced motion;
- in-app browser where sharing links commonly open;
- Wi-Fi, constrained mobile network and offline transition during load/save;
- incoming-call/background simulation, screen lock, rotation, keyboard opening, memory pressure and forced WebGL context loss;
- guest publish, account handoff/update, draft recovery, Walk Preview and native share.

Chrome explicitly warns that device emulation is only a first-order approximation and that desktop throttling does not model mobile GPU, memory bandwidth, storage or thermal behavior.[^15] Emulator screenshots remain useful for coverage, not release evidence.

### Usability program

Run short moderated rounds for two cohorts: first-time visitors and creators who have not used a 3D editor. Include different ages, visual/motor access needs and prior game/3D experience because the research shows interaction familiarity affects learnability.[^6]

Use stable tasks rather than subjective walkthroughs:

1. find a named exhibition and enter it;
2. locate a named artwork, open its information and return to the entrance;
3. use the non-WebGL/direct directory path and share the same work;
4. create a draft, upload two works, place one without dragging, correct an invalid placement and recover it after interruption;
5. request a bounded variation, explain what changed, discard it, run again, apply it and undo it;
6. identify whether any content left the device and whether the result was local or model-assisted;
7. review and publish or explain every remaining blocker.

Small moderated rounds detect severe interaction failures but are not statistical proof. Release decisions should combine them with field telemetry, automated contracts and physical-device traces.

### AI evaluation set

Before any Astra pilot, create a versioned offline evaluation corpus using licensed/internal fixtures rather than production creator content. It should include:

- empty and one-work collections;
- conflicting creator instructions;
- multilingual titles, names and diacritics;
- abstract, photographic, text-heavy and sensitive works;
- locked/hidden works and rooms with no valid remaining placement;
- prompt injection inside titles/descriptions;
- stale draft revision during a slow response;
- refusal, rate limit, timeout and malformed/unknown-schema output;
- a brief that is semantically plausible but geometrically impossible;
- descriptions where the source lacks date, medium, provenance or interpretation.

Score schema validity, source-field preservation, unsupported claims, explanation quality, solver feasibility, validator outcome, latency/cost band and human preference. Never score “accepted by creator” as factual correctness.

## Footnotes

[^1]: LIEUVA, [`README.md`](../README.md), repository product and compatibility boundary, reviewed 2026-09-11.
[^2]: LIEUVA, [`audit/CURRENT-STATE.md`](./CURRENT-STATE.md), pilot, performance and open physical-device boundary, reviewed 2026-09-11.
[^3]: LIEUVA, [`src/features/gallery/autoCurator.ts`](../src/features/gallery/autoCurator.ts), current local palette analysis, heuristic composition and validator use, accessed 2026-09-11.
[^4]: M. Herskovitz et al., “[Making Virtual Tours Accessible to Older Adults: A Preliminary Investigation](https://arxiv.org/html/2310.11176),” arXiv, 2023. Preprint; study used desktop input.
[^5]: PLOS ONE, “[Virtual reality online exhibition: User experience and technology acceptance of the Liangzhu Museum](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0308267),” 2024.
[^6]: Electronics, “[Towards an Accessible Metaverse Experience](https://www.mdpi.com/2079-9292/14/8/1635),” vol. 14, no. 8, 2025.
[^7]: Universal Access in the Information Society, “[Usability evaluation of a virtual museum on mobile devices](https://link.springer.com/article/10.1007/s10209-021-00820-4),” published 2021; journal issue 2022.
[^8]: W3C WAI, “[Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)” and “[2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html),” WCAG 2.2.
[^9]: MDN, “[touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action),” accessed 2026-09-11.
[^10]: Apple, “[Accessibility — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/accessibility)” and “[Layout](https://developer.apple.com/design/human-interface-guidelines/layout),” accessed 2026-09-11.
[^11]: Android Developers, “[Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views),” accessed 2026-09-11.
[^12]: MDN, “[Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)” and “[CSS length values](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length),” accessed 2026-09-11.
[^13]: MDN, “[WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices),” updated 2025-11-03.
[^14]: MDN, “[HTMLCanvasElement: webglcontextrestored event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event)” and “[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API),” accessed 2026-09-11.
[^15]: Chrome for Developers, “[Device Mode](https://developer.chrome.com/docs/devtools/device-mode)” and “[DevTools grounded in the real world](https://developer.chrome.com/blog/devtools-grounded-real-world),” accessed 2026-09-11.
[^16]: MDN, “[`<canvas>`: The Graphics Canvas element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas),” accessed 2026-09-11.
[^17]: W3C WAI, “[Understanding Success Criterion 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html),” WCAG 2.2.
[^18]: web.dev, “[prefers-reduced-motion: Sometimes less movement is more](https://web.dev/articles/prefers-reduced-motion),” accessed 2026-09-11.
[^19]: Khronos Group, “[KTX — Texture Container Format](https://www.khronos.org/ktx/),” accessed 2026-09-11.
[^20]: Three.js, “[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html),” accessed 2026-09-11.
[^21]: W3C, “[Web Share API](https://www.w3.org/TR/web-share/),” W3C Recommendation; web.dev, “[Integrate with the OS sharing UI with the Web Share API](https://web.dev/articles/web-share).”
[^22]: web.dev, “[Web Vitals](https://web.dev/articles/vitals),” accessed 2026-09-11.
[^23]: OpenAI, “[Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model),” accessed 2026-09-11.
[^24]: OpenAI, “[GPT-6 Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra),” accessed 2026-09-11.
[^25]: OpenAI, “[Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs),” accessed 2026-09-11.
[^26]: OpenAI, “[Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data),” accessed 2026-09-11.
[^27]: Google PAIR, “[Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)” and “[Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/),” People + AI Guidebook, accessed 2026-09-11.
[^28]: Microsoft, “[Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/),” HAX Toolkit, accessed 2026-09-11.
[^29]: Cleveland Museum of Art, “[Making Art Accessible to All](https://www.clevelandart.org/making-art-accessible-all),” accessed 2026-09-11.
[^30]: The Metropolitan Museum of Art / Google Arts & Culture, “[Museum Close Looking with AI](https://artsandculture.google.com/story/museum-close-looking-with-ai-the-metropolitan-museum-of-art/FgXBv1J5yFLKYQ?hl=en),” accessed 2026-09-11.
[^31]: American Alliance of Museums, “[Curatorial Chatbot: An Experiment with AI at the Nasher Museum of Art](https://www.aam-us.org/2023/11/28/curatorial-chatbot-an-experiment-with-ai-at-the-nasher-museum-of-art/),” 2023-11-28.
[^32]: European Commission, “[Transparency obligations under Article 50 of the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act),” updated 2026-07-24; Article 50 applies from 2026-08-02.
[^33]: W3C WAI, “[An alt Decision Tree](https://www.w3.org/WAI/tutorials/images/decision-tree/),” Images Tutorial, accessed 2026-09-11.
[^34]: C2PA, “[User Experience Guidance for Implementers](https://spec.c2pa.org/specifications/specifications/2.0/ux/UX_Recommendations.html),” specification 2.0.
[^35]: Reddit / r/canva, “[What are annoying problems do you face while using Canva?](https://www.reddit.com/r/canva/comments/1drzbi6/what_are_annoying_problems_do_you_face_while/),” 2024, qualitative community evidence; and “[Eraser and pinch zoom](https://www.reddit.com/r/canva/comments/1sb60l8/eraser_and_pinch_zoom/),” 2026, qualitative community evidence.
[^36]: Adobe Community, “[Provide separate buttons for undo and redo](https://community.adobe.com/feature-requests-681/p-provide-separate-buttons-for-undo-and-redo-661930),” qualitative community evidence.
[^37]: Reddit / r/MuseumPros, “[Thoughts on generative AI in museums?](https://www.reddit.com/r/MuseumPros/comments/1vx9ton/thoughts_on_generative_ai_in_museums/),” 2026-09-11, qualitative and non-representative.

## Sources

### Repository sources

1. LIEUVA. [`README.md`](../README.md). Product, architecture and compatibility boundary. Reviewed 2026-09-11.
2. LIEUVA. [`audit/CURRENT-STATE.md`](./CURRENT-STATE.md). Pilot boundary, performance limits and open real-device validation. Reviewed 2026-09-11.
3. LIEUVA. [`src/features/gallery/autoCurator.ts`](../src/features/gallery/autoCurator.ts). Current local automatic-curation implementation. Accessed 2026-09-11.

### Standards, platform and model documentation

4. W3C WAI. “[Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/).” W3C Recommendation, 2023; later republication incorporated errata.
5. W3C WAI. “[Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).” Accessed 2026-09-11.
6. W3C WAI. “[Understanding Success Criterion 2.5.1: Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html).” Accessed 2026-09-11.
7. W3C WAI. “[Understanding Success Criterion 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).” Accessed 2026-09-11.
8. W3C WAI. “[An alt Decision Tree](https://www.w3.org/WAI/tutorials/images/decision-tree/).” Accessed 2026-09-11.
9. Apple. “[Accessibility — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/accessibility).” Accessed 2026-09-11.
10. Apple. “[Gestures — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/gestures/).” Accessed 2026-09-11.
11. Apple. “[Sheets — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/sheets).” Accessed 2026-09-11.
12. Apple. “[Layout — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/layout).” Accessed 2026-09-11.
13. Android Developers. “[Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views).” Accessed 2026-09-11.
14. MDN. “[touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).” Accessed 2026-09-11.
15. MDN. “[Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).” Accessed 2026-09-11.
16. MDN. “[WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).” Updated 2025-11-03.
17. MDN. “[HTMLCanvasElement: webglcontextrestored event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event).” Accessed 2026-09-11.
18. MDN. “[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).” Accessed 2026-09-11.
19. MDN. “[`<canvas>`: The Graphics Canvas element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas).” Accessed 2026-09-11.
20. web.dev. “[prefers-reduced-motion: Sometimes less movement is more](https://web.dev/articles/prefers-reduced-motion).” Accessed 2026-09-11.
21. web.dev. “[Web Vitals](https://web.dev/articles/vitals).” Accessed 2026-09-11.
22. Chrome for Developers. “[Device Mode](https://developer.chrome.com/docs/devtools/device-mode).” Accessed 2026-09-11.
23. Chrome for Developers. “[DevTools grounded in the real world](https://developer.chrome.com/blog/devtools-grounded-real-world).” Accessed 2026-09-11.
24. Khronos Group. “[KTX — Texture Container Format](https://www.khronos.org/ktx/).” Accessed 2026-09-11.
25. Three.js. “[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).” Accessed 2026-09-11.
26. W3C. “[Web Share API](https://www.w3.org/TR/web-share/).” W3C Recommendation.
27. OpenAI. “[GPT-6 Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra)” and “[Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model).” Accessed 2026-09-11.
28. OpenAI. “[Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs).” Accessed 2026-09-11.
29. OpenAI. “[Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data).” Accessed 2026-09-11.
30. European Commission. “[Transparency obligations under Article 50 of the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act).” Updated 2026-07-24.
31. C2PA. “[User Experience Guidance for Implementers](https://spec.c2pa.org/specifications/specifications/2.0/ux/UX_Recommendations.html).” Specification 2.0.

### Research and museum practice

32. Herskovitz, M., et al. “[Making Virtual Tours Accessible to Older Adults: A Preliminary Investigation](https://arxiv.org/html/2310.11176).” arXiv, 2023.
33. PLOS ONE. “[Virtual reality online exhibition: User experience and technology acceptance of the Liangzhu Museum](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0308267).” 2024.
34. Electronics. “[Towards an Accessible Metaverse Experience](https://www.mdpi.com/2079-9292/14/8/1635).” Vol. 14, no. 8, 2025.
35. Universal Access in the Information Society. “[Usability evaluation of a virtual museum on mobile devices](https://link.springer.com/article/10.1007/s10209-021-00820-4).” Published 2021; issue 2022.
36. Google PAIR. “[Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/).” People + AI Guidebook. Accessed 2026-09-11.
37. Google PAIR. “[Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/).” People + AI Guidebook. Accessed 2026-09-11.
38. Microsoft. “[Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/).” HAX Toolkit. Accessed 2026-09-11.
39. Cleveland Museum of Art. “[Making Art Accessible to All](https://www.clevelandart.org/making-art-accessible-all).” Accessed 2026-09-11.
40. The Metropolitan Museum of Art / Google Arts & Culture. “[Museum Close Looking with AI](https://artsandculture.google.com/story/museum-close-looking-with-ai-the-metropolitan-museum-of-art/FgXBv1J5yFLKYQ?hl=en).” Accessed 2026-09-11.
41. American Alliance of Museums. “[Curatorial Chatbot: An Experiment with AI at the Nasher Museum of Art](https://www.aam-us.org/2023/11/28/curatorial-chatbot-an-experiment-with-ai-at-the-nasher-museum-of-art/).” 2023-11-28.

### Qualitative practitioner and community signals

42. Three.js Forum. “[Looking for a Three.js mobile controls / 3D navigation expert](https://discourse.threejs.org/t/paid-looking-for-a-three-js-mobile-controls-3d-navigation-expert-touch-gestures-ios/89060).” 2026-01. Qualitative evidence.
43. Three.js GitHub. “[WebGL memory usage regression on Safari/iOS](https://github.com/mrdoob/three.js/issues/30416).” 2025-01-28. Issue report, not population evidence.
44. Three.js GitHub. “[WebGL context lost reports on Apple devices](https://github.com/mrdoob/three.js/issues/30767).” 2025-03-20. Issue report, not population evidence.
45. Reddit / r/webdesign. “[We built a scroll-animated 3D website in Three.js](https://www.reddit.com/r/webdesign/comments/1vd4hcq/we_built_a_scrollanimated_3d_website_in_threejs/).” 2026-08. Qualitative evidence.
46. Reddit / r/threejs. “[Poor performance WebGL on iPhone](https://www.reddit.com/r/threejs/comments/1k91ho7/poor_performance_webgl_on_iphone/).” 2025-04. Qualitative evidence.
47. Reddit / r/canva. “[What are annoying problems do you face while using Canva?](https://www.reddit.com/r/canva/comments/1drzbi6/what_are_annoying_problems_do_you_face_while/).” 2024. Qualitative evidence.
48. Reddit / r/canva. “[Eraser and pinch zoom](https://www.reddit.com/r/canva/comments/1sb60l8/eraser_and_pinch_zoom/).” 2026. Qualitative evidence.
49. Adobe Community. “[Provide separate buttons for undo and redo](https://community.adobe.com/feature-requests-681/p-provide-separate-buttons-for-undo-and-redo-661930).” Qualitative evidence.
50. Reddit / r/MuseumPros. “[Thoughts on generative AI in museums?](https://www.reddit.com/r/MuseumPros/comments/1vx9ton/thoughts_on_generative_ai_in_museums/).” 2026-09-11. Qualitative, self-selected and non-representative.
51. Reddit / r/FigmaDesign. “[Has anyone had success using Figma's new AI?](https://www.reddit.com/r/FigmaDesign/comments/1ubfqk9/has_anyone_had_success_using_figmas_new_ai/).” 2026. Qualitative, self-selected and non-representative.
52. Reddit / r/ContemporaryArt. “[Did virtual exhibitions ever actually work?](https://www.reddit.com/r/ContemporaryArt/comments/1p2tzul/did_virtual_exhibitions_ever_actually_work/).” Qualitative, self-selected and non-representative.
