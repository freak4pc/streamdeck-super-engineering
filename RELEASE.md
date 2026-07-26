# Release checklist

## Automated gates

- [x] `npm ci`
- [x] `npm run check`
- [x] `npm audit --omit=dev`
- [x] `npm run pack`
- [x] Inspect the packaged file list for logs, source maps, profiles, and personal data.
- [ ] Install the generated `.streamDeckPlugin` on a clean Stream Deck setup.

## Manual QA

- [ ] super.engineering closed: first Session Slot shows **OPEN SUPER**.
- [ ] Compatible super.engineering open: sessions match visible sidebar title and order.
- [ ] Changing selection in either Stream Deck or super.engineering updates all connected devices.
- [ ] Agent waiting, working, and idle states render correctly.
- [ ] Dirty/clean diffs and open/merged/closed PR states render correctly.
- [ ] GitHub CLI missing or logged out does not break sessions.
- [ ] Paging wraps independently on two connected devices.
- [ ] Long press arms deletion; timeout and another-key press cancel it.
- [ ] Primary, dirty, and unpushed worktree deletion failures show an alert and preserve the session.
- [ ] Test Session Slot layouts on Mini, standard/15-key, Neo or Plus, and XL or Mobile.

## GitHub release

- [ ] Push the final release commit to `main`.
- [ ] Create and push a tag matching `package.json`, for example `v1.0.0`.
- [ ] Confirm CI attached the validated `.streamDeckPlugin` installer to the GitHub Release.
- [ ] Install that downloaded release artifact once before Marketplace submission.

## Marketplace

- [x] Confirm permission to use the super.engineering name and visual identity.
- [x] Confirm the Marketplace organization name is exactly `Shai Mishali`, or update `Author`.
- [x] Sign the Marketplace Maker Agreement.
- [x] Configure the Marketplace organization support email.
- [ ] Make the support repository/issues URL public before submission.
- [ ] Check that **super.engineering** is available as a Marketplace plugin name.
- [x] Create a 288 × 288 Marketplace App icon.
- [x] Create a 1920 × 960 thumbnail and three gallery images.
- [x] Prepare description, release notes, requirements, and additional links in `marketplace/metadata.md`.
- [x] Use `CHANGELOG.md` for release notes.
- [ ] Upload the validated `.streamDeckPlugin` in Maker Console and complete review metadata.

The plugin UUID is `com.freak4pc.super-engineering`. Treat it as immutable after the first public
release.
