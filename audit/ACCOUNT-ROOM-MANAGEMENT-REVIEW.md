# AURA account and room-management review

Stand: 15 August 2026.

## Finding

Room ownership, live-link editing, visibility, access, export, archive and Trash
had grown into one modal. That made a short authentication surface carry a
long-lived resource-management workflow. It also made the opaque Firebase
Callable error `internal` look like a user mistake.

The live cross-check found a separate production blocker: the trusted gallery
Callable endpoints in `europe-west1` currently return HTTP 404. Consequently,
visibility, lifecycle and ACL actions cannot succeed until the non-mail Cloud
Functions are deployed. Existing Storage objects use numeric immutable paths
(`artworks/1.webp`, revision equivalents), so uploaded display names are not
used as Firebase object names.

## Reference patterns

- [Carbon dialogs](https://v10.carbondesignsystem.com/patterns/dialog-pattern/)
  recommends keeping modal time short and moving complex data interaction to a
  full page.
- [Carbon data tables](https://carbondesignsystem.com/components/data-table/usage/)
  treats a resource list as the place for status, filtering and row actions;
  one or two common actions should remain visible while secondary actions use a
  contextual area.
- [Primer layout](https://primer.style/product/getting-started/foundations/layout/)
  recommends a list-detail layout on wide screens and separate drill-in pages
  or a bottom sheet on narrow screens.
- [Atlassian components](https://atlassian.design/components/) separates
  persistent page structure, status, inline messages and brief modal tasks.
- [GOV.UK service-error guidance](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/)
  says to explain what happened to saved work, avoid backend jargon and offer a
  clear retry path.

## Applied direction

- Signed-in account management now has a dedicated `#/account` route.
- The header opens that page for signed-in users; the dialog remains available
  for focused sign-in inside the builder and private-room gate.
- Room rows expose identity, role, visibility, current revision and expiry.
- Settings keep the same live URL and group visibility, link copy, access,
  export, renewal, archive and Trash with explicit save/error state.
- Firebase Callable errors are translated into actionable, loss-safe messages;
  raw `internal` is no longer shown.
- Image upload MIME is normalized from the prepared Blob instead of parsing a
  possibly irregular data-URL header. Artwork titles and original filenames do
  not influence Storage paths.

## Remaining gate

Deploy and live-test the trusted non-mail Functions before calling lifecycle or
ACL production-ready. A true restorable revision timeline needs a backend
revision manifest and retention policy; the current product correctly exposes
only the active revision number and export rather than implying restore support.

