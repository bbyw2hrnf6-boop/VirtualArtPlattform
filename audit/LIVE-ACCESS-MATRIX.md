# AURA live access and lifecycle matrix

Run this only with disposable test content after the trusted room Functions,
App Check key, Firestore rules, and Storage rules are live. Never use a real
customer account or artwork.

## Test identities

- **Owner**: verified Email/Password account. Publishes the room and manages its
  settings.
- **Collaborator**: second verified account, ideally Google sign-in. It is used
  first as Viewer and then as Editor.
- **Uninvited**: incognito session or a third disposable account.

The two durable accounts prove that ACL behavior is tied to identity rather
than the owner's browser session. Keep their passwords in a password manager,
not in repository files, shell history, screenshots, or issue comments.

## Required matrix

| Flow | Owner | Viewer | Editor | Uninvited |
| --- | --- | --- | --- | --- |
| Public room opens | yes | yes | yes | yes |
| Unlisted direct link opens | yes | yes | yes | yes |
| Room appears in Discover | public only | public only | public only | public only |
| Private room opens | yes | yes | yes | no |
| Edit current live URL | yes | no | yes | no |
| Change visibility/renew/archive/Trash | yes | no | no | no |
| Manage ACL | yes | no | no | no |

## Lifecycle checks

1. Publish a Public room and confirm its Firestore document, cover, and artwork
   objects use the same owner/gallery path.
2. Change it to Unlisted and Private; confirm Discover and direct-link behavior.
3. Archive it; confirm the public link closes while Account still lists it.
4. Unarchive it; confirm the same URL reopens.
5. Move it to Trash; confirm the link closes and Account shows the purge date.
6. Restore it within seven days; confirm the same URL and revision survive.
7. Renew an account-preview room and confirm the expiry moves by one year.
8. Attempt a second guest publication from the same anonymous identity; expect
   the server quota message and no orphan Storage objects.

## App Check and failure checks

1. In Firebase App Check metrics, confirm valid requests from GitHub Pages.
2. With enforcement still in monitor mode, test Chrome, Safari, mobile Safari,
   and a privacy-restricted browser.
3. Enable enforcement for Functions first, then Firestore and Storage.
4. Remove the site key in a local production build and confirm publication and
   lifecycle callables fail without mutating Firestore or Storage.
5. Interrupt a publication after the cover upload. Confirm immutable objects
   are bounded to that permitted gallery path and the local draft remains.
6. Run the cleanup Action manually and confirm a successful OAuth step plus a
   zero-or-more deletion summary.

## Evidence to retain

Record test date, browser versions, account UIDs (not passwords), gallery IDs,
expected/actual outcome, App Check metrics screenshot, and the successful
cleanup Action URL in `audit/`. Delete all disposable galleries afterward via
Trash and the trusted cleanup path.
