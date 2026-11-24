# Pust feature implementation handoff

Saved 24 November 2026. The user asked to save progress and then commit it.
The implementation is committed together with this handoff on `main`. It has
not been pushed or deployed. Production still runs the earlier version below.

## Current production version

Last committed and deployed version: `c543cec`, "Compact personal status and
align weekly goal defaults". Its automatic deployment was verified healthy.
It includes the compact `/pust meg` format. Production goals were separately
set in Coolify to 8 participants and 1200 minutes on 23 November.

## Implemented locally

The user approved these three additions and stressed that most people use
Slack on phones. Keep channel posts compact, with details in modals.

- `/pust inviter`: create shared activities, RSVP with Blir med or Kanskje,
  withdraw through Kan ikke, view participants, and edit/cancel as organizer
  before start. Four-line channel posts have three short buttons. Details and
  participant lists open separately. Listings show five invitations per page,
  including events from the past seven days.
- After an invitation ends, confirmed participants receive one private
  Logg aktivitet prompt. The existing logging form is prefilled with the
  clicking user, activity type, date and duration. No automatic activity,
  Sparks or distance is awarded by signing up. Cancelled events are excluded.
- Changing an invitation's time, place, activity type or duration changes
  other participants' responses to Kanskje, requiring fresh confirmation.
  Old RSVP buttons cannot confirm a revised invitation.
- Pustelag now supports kilometer goals with up to two decimals. Only recorded
  distance matching the activity filter counts. Existing membership and
  correction rules apply. Shared status is at most five text lines; activity
  totals remain available in the detail modal.
- `/pust admin`: authorized users can schedule participant/minute goals from a
  future Monday, defaulting to next week. Current/past weeks cannot be changed.
  Separate paginated views show planned goals and the audit history.
- Weekly goals are persisted in SQLite and shared by manual status, recap,
  archive and streak calculations. Environment values seed the database once.
  Known archived goals are imported without modifying report snapshots.
  Older weeks without known archived goals use the persisted initial values.

## Authorization decision

The user explicitly chose designated Pust-voktere configured by Slack user ID,
not all workspace administrators. `PUST_ADMIN_USER_IDS` accepts comma-separated
IDs; an empty setting allows nobody to administer goals. Authorization is
rechecked at save time. Actual administrator IDs have not been supplied or
configured. No new Slack scopes are required.

## Main implementation locations

- `src/domain/weekly-goals.ts`, `src/storage/weekly-goal-repository.ts`,
  `src/slack/weekly-goal-handlers.ts`: persisted decisions, future-week rules,
  optimistic concurrency and admin UI.
- `src/slack/weekly-status.ts`, `src/domain/streaks.ts`, `src/index.ts`:
  goal lookup and runtime wiring.
- `src/domain/team-challenge.ts`, `src/storage/team-repository.ts`,
  `src/slack/team-views.ts`, `src/slack/team-handlers.ts`: kilometer goals and
  compact team posts.
- `src/domain/invitation.ts`, `src/storage/invitation-repository.ts`,
  `src/slack/invitation-views.ts`, `src/slack/invitation-handlers.ts`,
  `src/invitation-followups.ts`: invitations, RSVP, publication and prompts.
- `src/slack/message-sender.ts`: bounded fetch-based Slack sender with no
  automatic transport/rate-limit retries. The existing weekly recap sender
  re-exports it. Durable send claims prevent duplicate automatic attempts.
- `src/slack/activity-modal.ts`: optional prefilled activity settings.
- `src/slack/compact-ui.ts`: small shared Block Kit helpers.
- Config, Compose, manifest, help, README, product plan, deployment runbook and
  manual Slack test plan have been updated.

## Verification completed

- All 230 tests in 14 files passed on 24 November.
- Typechecking and production build passed.
- `git diff --check` passed.
- New tests cover permissions, stale forms/buttons, duplicate submissions,
  persistence and restart behavior, historical goal calculations, archive
  immutability, fractional kilometer goals, activity filters, membership and
  activity corrections, legacy schema migration, Oslo clock changes,
  cancellation, reminder timing and Slack failures.
- Full test execution needed sandbox escalation because six existing HTTP
  tests bind localhost ports. The unrestricted run passed; the earlier EPERM
  failures were sandbox restrictions.
- Real Slack rendering on a phone has not been checked. No test invitations
  or other messages were sent to production during this implementation.

## Deployment and follow-up

1. The user authorized a local commit of these three features and this handoff.
   Review that commit against `c543cec` when resuming. A push and deployment
   remain outstanding.
2. Obtain/configure actual Pust-vokter IDs in `PUST_ADMIN_USER_IDS` when preparing
   deployment. Check production's initial goals remain 8 and 1200 before the
   first startup of this version.
3. Take and verify a SQLite backup before deploying. This version rebuilds
   `team_challenges` transactionally to allow distance goals and adds the goal,
   invitation, RSVP and reminder tables. Migration tests preserve IDs,
   memberships, revisions and request IDs.
4. Push when requested. A push to `main` triggers automatic deployment
   in Coolify. Verify the exact commit's webhook deployment and app health.
5. Follow `docs/slack-testplan.md` on a phone, including invitation creation,
   RSVP/edit/cancel, prefilled logging, kilometer challenges and admin access.

Coolify target: `rp9shkdgtpcc10vccy5xyna5`, repository
`SmidigBommen/pust-bot`, branch `main`, public health endpoint
`https://pust.smidigbommen.no/health`. The Coolify skill and deployment runbook
explain existing API access. Never print credentials or upload local `.env`.

## Deliberate limits and operational notes

- Invitations can be edited or cancelled only before start. No team linkage,
  participant cap or before-event reminder is included.
- Post-event prompts catch up only within 24 hours of the scheduled end.
- Ambiguous Slack publication/send failures are not retried automatically.
  An invitation remains in the list after a publication failure, with a notice;
  a prompt can be missed. Each actual network send has a ten-second timeout.
- Goal changes do not announce themselves publicly. Existing posts and saved
  archive reports remain unchanged.
- Rolling back to older code after distance goals have been created requires
  a compatible version or restoring the backup. Older code also ignores the
  persisted goal schedule and reads goals from environment variables.
