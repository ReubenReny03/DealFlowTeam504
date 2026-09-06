# Decisions

Every judgement call made while building DealFlow360, with a one-line rationale.
Bias throughout: **demo-ability in 24 hours · real business logic, never faked ·
zero merge conflicts between four parallel agents.**

New decisions go at the bottom with the next `D-nnn`. If a decision changes a
type in `packages/shared`, it also needs an entry in `CONTRACT_CHANGELOG.md`.

---

## Architecture and tooling

**D-001 — npm workspaces, not a heavier monorepo tool.**
Nx or Turborepo would give caching we will never notice in 24 hours, and both
add a config surface that can break at 3am. `npm workspaces` is already in the
Node we have.

**D-002 — Money is an integer count of minor units (cents), everywhere.**
Floating-point money drifts, and a demo where the invoice total is a cent off
the sum of its lines is a demo that loses. `Money = number` (an integer), one
`Money` helper module, one Angular `money` pipe, and a reset assertion that fails
if any persisted total is not an integer.

**D-003 — MongoDB runs as a single-node replica set.**
Multi-document transactions (stock reservation on order confirmation) need one.
`docker-compose.yml` starts `mongo:7` with `--replSet rs0`. `withTransaction()`
detects a standalone deployment and falls back to sequential writes rather than
crashing, so a teammate on a plain `mongod` is inconvenienced, not blocked.

**D-004 — `@dealflow/shared` builds to `dist` and is consumed through
node_modules.**
Both apps resolve the package the ordinary way instead of through tsconfig path
aliases. It costs one `npm run build:shared` (already wired into `dev`, `verify`
and a `predev` hook) and removes an entire class of "works in the API, fails in
Angular" resolution problems.

**D-005 — `RiskLevel.NONE` is displayed as "LOW".**
Screen 5 shows an auto-approved quotation with a `LOW` chip, but the routing
rule in the brief has three bands: 0 → NONE, 1-29 → MEDIUM, 30+ → HIGH. Rather
than bend the routing to the label, `RISK_LEVEL_LABEL` maps `NONE → "LOW"`.
Routing stays exactly as specified; the screen reads exactly as mocked.
`RiskLevel.LOW` remains in the enum for configuration-driven use.

**D-006 — Raising only the *category* ceiling does not clear Q-1042.**
The rule is `allowedPct = min(tierCeiling, categoryCeiling)`. Raising Services
from 10% to 20% leaves Gold's 15% binding, so an 18% discount is still 3 points
over: Q-1042 drops from HIGH (two approvers, score 33) to MEDIUM (one approver,
score 12) rather than clearing. To demonstrate a full drop to auto-approval,
raise **both** Gold and Services to 20% — that is what the smoke test does, and
what `docs/DEMO_SCRIPT.md` narrates. Both behaviours are unit-tested. This is a
correction to the integration-checkpoint wording in the original brief, which
assumed a single-ceiling change would clear the quote; under `min()` it cannot.

**D-007 — Angular does not support `@else if (expr; as alias)`.**
Only `@if` accepts the `as` alias. Every page therefore uses
`@if (loading) {} @else if (error) {} @else { @if (data(); as d) { ... } }`.
Worth knowing before you write the next screen.

**D-008 — Mongoose models are typed `Model<any>`; the typed contract lives at
the serialisation boundary.**
Full Mongoose generics on 22 schemas blew the TypeScript heap (a literal OOM on
`npm run typecheck`). Types are enforced where they matter — the DTOs in
`@dealflow/shared` that both sides import, applied by `toDto()`.

## Demo, credentials and data

**D-009 — Uniform demo credentials, and they are documented on purpose.**
Seven personas, one password (`Demo@123`), bcrypt cost 8, and a portal token
that does not expire for ten years. A judge or a teammate must be able to sign
in as anyone in one click. In production every one of these would change:
per-user credential policy, cost 12+, MFA, lockout, short-lived signed portal
links. `docs/CREDENTIALS.md` says so at the point of use.

**D-010 — `docs/CREDENTIALS.md` and the README table are generated, not typed.**
`npm run docs:credentials` renders both from `DEMO_ACCOUNTS` in
`apps/api/src/seed/users.seed.ts`. Hand-copied credentials drift, and drifted
credentials fail on stage.

**D-011 — The seed computes; it does not hardcode.**
Every seeded quotation runs through the same `computeLinePricing`,
`computeQuoteTotals` and `calculateBlendedRisk` the live app uses
(`apps/api/src/seed/build.ts`). Seed data therefore cannot disagree with what
the app would calculate for the same input, and Q-1042's score of 33 is
*derived*, not asserted.

**D-012 — Every seeded date is an offset from a single `SEED_NOW` anchor.**
"Idle 9 days" is exactly 9 days whenever you run it. `SEED_NOW` can be pinned in
`.env` for reproducible screenshots.

**D-013 — Fixed ObjectIds for every seeded document.**
`fid('a1', 2)` → `a10002000000000000000000`. Reproducible runs, no dangling
cross-references, and tests can hard-code an id without querying for it first.

**D-014 — Where the mockup contradicts itself, the computable number wins.**
The mockup is not internally consistent, and three places matter:

| Mockup says | Problem | What we do |
|---|---|---|
| Screen 4 shows 3 lines; screen 6's flagged table shows 2 | Adding the third line (Extended Warranty, 0 points over) dilutes the blended average to 32, not 33 | Q-1042 is seeded with the **two** lines from screen 6, which produce exactly 33. Screen 4 renders whatever lines exist. |
| Screen 7: East Depot Laptop 10 / 6 / 4; screen 8 allocates 6 units from East | You cannot allocate 6 from an availability of 4 | Seeded as Main 40/22/**18** and East 10/4/**6**, so the planner *genuinely* produces Main 18 + East 6 for a 24-unit order. Reserved and Available are transposed relative to the mockup. |
| Kanban amounts ($12,400 for Acme), "128 active products", "146 quotes", "6.4 hours" | Decorative figures that do not follow from the line data | Every figure on every screen is computed from real documents. The seed is sized so the counts land close (147 quotes, 5 stalled, 2 anomalies, 16/2/3 subscriptions), but the number displayed is always the true one. |

**D-015 — The Gold price list's "base minus 10 percent" rule is really applied.**
Screen 17 configures it, so it would be dishonest to leave it as dead config.
Acme's Laptop line therefore prices at $1,080, not the $1,200 catalogue price.
**This does not change the risk score**: the blended overage is a
revenue-*weighted* average, so scaling every line by the same factor leaves the
weights identical — `(2160×0 + 405×8)/2565 = 1.26`, exactly as with the base
prices. Proved by a unit test. A tier's *price rule* (screen 17) and a tier's
*discount ceiling* (screen 18) are separate things and are modelled separately.

**D-016 — Q-1042's confirmed order is larger than the quotation it started as.**
To make the 18 + 6 warehouse split real, the order needs 24 units; the risk
example needs 2. Both are true at different times: Priya expands the rollout
during negotiation, which is also *why* the quote re-enters approval. The demo
is stronger for it — the re-approval loop is triggered by a material change, not
a contrived one.

**D-017 — An `Order` is a distinct entity from a `Quotation`.**
Fulfillment allocates against an order, invoices bill an order's shipped
quantities, and subscriptions belong to an order. Collapsing them would make
"what was quoted" unrecoverable after confirmation. Order numbers are their own
sequence (`ORD-1041`), so the mockup's habit of labelling an order `Q-1042` is
cosmetic, not structural.

**D-018 — Screens 12 and 13 are populated by a *prior* Acme order (ORD-1041).**
Every screen must be non-empty on first run, but Q-1042 must still be sitting in
the approval queue when the demo starts. So a previous, already-confirmed Acme
order supplies INV-1042 (unpaid, one-time) and INV-1043 (paid, recurring) — one
order, two billing artefacts, visible before the demo starts. The live demo path
then generates its own.

**D-019 — Warehouse ranking and cost estimation are separate numbers.**
`shippingCostWeight` (Main 1.0, East 1.4) ranks warehouses; `baseShipmentCost +
perUnitShippingCost × qty` estimates the cost. Main is preferred *and* the
mockup's $42 / $26 figures come out exactly. One number could not do both.

## Product and business rules

**D-020 — The blended risk score is computed in one pure function, and only
there.** `calculateBlendedRisk` in `packages/shared` is called by the API on
submit and by the Angular builder on every keystroke. The optimistic preview
therefore cannot disagree with what the server stores. This is also the mitigation
for "two agents implement the rule slightly differently".

**D-021 — The risk engine always returns its own explanation.**
`RiskAssessmentDto.explanation` is an array of `{line, given, allowed, overBy,
status, weight}` produced by the engine and rendered verbatim by screen 6. The UI
never recomputes a single one of those numbers.

**D-022 — Tax is charged on the discounted amount.**
`gross → discount → net → tax → total`. What every B2B system does, and it makes
the discount actually reduce the tax.

**D-023 — Quotation edits use optimistic concurrency, not locking.**
Every quotation carries a `version`; a write that sends a stale one gets
`409 STALE_VERSION` with a message telling the user to reload. Cheap, and it
stops two reps silently overwriting each other during a live demo.

**D-024 — Nothing is invoiced before it ships.**
`invoiceableOneTimeLines()` bills `min(qtyShipped, qty) − qtyInvoiced`. Partial
delivery produces a partial invoice automatically, and re-running it never
double-bills.

**D-025 — Recurring lines are invoiced at the *start* of each period.**
Per screen 17. `dueDate === periodStart` for every schedule entry.

**D-026 — Deal-health anomalies compare against the owning rep's own trailing
average**, not a global one. A rep who habitually discounts 20% is not anomalous
at 24%; a rep who averages 8% is very anomalous at 32%. An absolute cap (25%)
catches the case where a rep has no history yet.

**D-027 — The customer portal is a separate surface, enforced in four places.**
A different Angular route tree and shell, a different guard (`portalGuard`), a
different credential (`X-Portal-Token`, never the JWT), and a server-side scope
check (`assertPortalScope`) that ties a token to exactly one quotation and one
customer. An internal JWT gets 403 from the portal. R. Das gets 403 on Acme's
quotation whether he guesses the URL or reuses Priya's link.

## Process

**D-028 — Registry files, not shared files.**
`routes.registry.ts`, `seeds.registry.ts` and `app.routes.ts` are append-only
arrays. An agent adds one line; nobody restructures. `app.ts` is frozen. This is
the single biggest source of avoided merge conflicts.

**D-029 — The smoke test reports PENDING, not FAIL, for unbuilt endpoints.**
`npm run smoke` walks the PDF's eight-step quick-test flow and marks each step
PASS, PENDING (naming the owning agent) or FAIL. A step that is not built yet is
not a broken build — but a step that is built and *wrong* fails the run. It
doubles as the team's live progress dashboard.

**D-030 — Read endpoints were scaffolded for every module in Phase 3.**
Each of the 18 screens renders real seeded data from minute one, so no
workstream is blocked on another and no screen is ever blank. The **write** side
— the actual business logic — is deliberately left to the owning agent, and each
module's `GET /_health` lists exactly what is still theirs to build.

**D-031 — `npm run reset` refuses to run against a non-local Mongo URI.**
`isLocalMongoUri()` requires a local-looking host *and* a dev-looking database
name. `--force` overrides. A reset script that can nuke something real is a
liability, not a convenience.

**D-032 — An in-memory MongoDB fallback ships with the repo.**
When the configured Mongo is unreachable, `waitForMongo()` starts an ephemeral
single-node replica set so `npm run reset`, `npm run verify` and `npm run dev:api`
all still work. It announces itself loudly and tells you the Docker command for a
persistent environment. Nobody loses an hour of the 24 to Docker permissions.
*(This was written because Docker was in exactly that state on the machine this
repo was scaffolded on.)*

**D-033 — Mock mode for the frontend.**
`environment.useMocks = true` answers every request from in-memory fixtures.
If a backend counterpart is behind, the frontend workstream keeps moving.

**D-034 — Accounts are issued by an Admin. There is no public signup.**
`POST /auth/signup` was an unauthenticated endpoint that accepted a `role`, so
anyone reachable by the API could mint themselves an `ADMIN`, or a `CUSTOMER`
account pointed at a company they had nothing to do with — the portal's whole
isolation guarantee rests on that link being correct. It is gone, along with the
`/signup` screen and the login page's "Create one" link. Accounts are created on
screen 19 (`/admin/users`), where the actor is known, the write is audited, and
the company link is validated. The cost is that a new user must be added for
them; for this product that is the correct trade.

**D-035 — A valid token is not a valid session, so every guarded request re-reads
the account.** `requireAuth` verifies the JWT and then loads the user, enforcing
the role stored in the database rather than the one the token was minted with. A
JWT cannot be recalled once issued, so without this an account deactivated on
screen 19 would keep working until its token expired — which would make the
Deactivate button a lie — and a demoted user would keep their old rights for the
rest of the token's life. One indexed lookup per authenticated request is the
price of being able to revoke access at all. (The alternative, a token blocklist,
is more moving parts for the same outcome at this scale.)

**D-036 — The first-sign-in password change is an offer, not a wall.**
An account created on screen 19 carries `mustChangePassword`, because the
password on it was typed by whoever created the account, not by its holder. Signing
in routes them to *Choose your password* — with **Skip for now**, which leaves the
flag set so the offer returns at the next sign-in. It is deliberately not enforced
server-side: a hard lock would mean a half-provisioned account cannot be looked at
during a demo, and the flag is the same one a guard would read if that changes.
The Admin reset path (`PATCH /users/:id` with `password`) re-arms the flag,
because a reset password is one the holder did not choose either. Seeded demo
logins are explicitly exempt: their passwords are published in the README, on the
login screen and in docs/CREDENTIALS.md, so a judge changing one would make the
published credential wrong.

**D-037 — Realtime rooms are the authorisation boundary, decided once at the
handshake.**
A socket is authenticated when it connects, and the result is a set of rooms
(`user:<id>`, `role:<ROLE>`, `internal`, `customer:<id>`, `quotation:<id>`). An
emit names a room; nothing re-checks the recipient. The alternative — filtering
at emit time — means every one of the twenty-odd emit sites has to remember who
is entitled to what, and one that forgets leaks silently rather than failing.
Consequences worth stating: the JWT path **re-reads the account** exactly as
`requireAuth` does, because a deactivated user must not keep a socket open on a
token minted before they were switched off; a socket with no credential is
refused rather than downgraded to a read-only feed; and `subscribe:quotation` is
authorised against the same rule as `assertPortalScope`, so guessing an id is
not a way in.

**D-038 — Domain events carry identity, not documents.**
`quotation:updated` says *which* quotation changed and why; it does not ship the
quotation. The screen re-reads it over REST. Pushing the record would be one
round trip cheaper and would mean maintaining a second, subtly different copy of
every endpoint's shaping — the role scoping in `roleScope.ts`, the pagination,
the derived counts — inside the socket layer. Notifications are the exception
and carry the whole `NotificationDto`, because a notification has no other
endpoint shaping it and the bell must be able to render it with no follow-up
call.

**D-039 — A notification is a database row first and a push second.**
`notifications.service.ts` writes the Mongo row, then emits. A user who was
offline still finds the notification in their bell, and a socket failure never
loses one — the service logs a delivery failure instead of throwing, because a
notification is a courtesy on top of a business event that has already succeeded
and been audited. Failing a customer's confirm because a manager's bell could
not be reached would be the wrong trade in every case.

**D-040 — Nobody is notified of their own action.**
Every helper in the notification service takes the actor and drops them from the
recipient list. It is enforced in one place rather than at each call site,
because the call sites that would forget are exactly the ones where the actor is
usually — but not always — the same person as the recipient. A manager who
submits a quotation on a rep's behalf *does* notify that rep; a rep who submits
their own does not notify themselves.

**D-041 — A live screen refetches; it does not patch itself from the socket.**
`liveRefresh()` re-runs the page's own `load()`. Patching local state from an
event payload drifts from what the endpoint would have returned, and the drift
only shows up under exactly the conditions that are hardest to reproduce. The
one screen that guards the refetch is the quotation builder: an edited-but-unsaved
draft raises the existing "reload the latest version" dialog instead of being
overwritten, because silently discarding someone's typing to show them fresher
data is worse than being briefly stale.
