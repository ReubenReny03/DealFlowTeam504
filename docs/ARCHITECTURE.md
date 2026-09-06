# Architecture

How DealFlow360 is put together: the nine domains, what each one owns, and where
the business rules actually live.

Every API module reports its own domain at `GET /api/v1/<module>/_health`, and
`GET /api/v1/_routes` lists all of them. The same nine names appear on
`SCREEN_REGISTRY` in `packages/shared`, so a screen, its endpoints and its seed
data are always labelled the same way.

---

## The shape of the system

```
packages/shared          the frozen contract + every pure business rule
      │                  (enums, DTOs, pricing, risk, billing, upsell,
      │                   warehouse split, deal health)
      ├──────────────────────────────┐
      ▼                              ▼
apps/api  (Express + Mongoose)   apps/web  (Angular, standalone + signals)
  routes.registry.ts               app.routes.ts
  one module per domain            one feature folder per screen
```

The rule that makes this work: **a business rule is written once, in
`packages/shared`, and imported by both sides.** The API calls
`calculateBlendedRisk` on submit; the Angular quotation builder calls the same
function on every keystroke. The optimistic preview therefore cannot disagree
with what the server stores (D-020).

---

## The nine domains

| Domain | API modules | Owns (collections) | Screens |
|---|---|---|---|
| **platform** | `health`, `auth`, `users` | `User` | 1, 19 |
| **catalogue** | `products`, `pricelists`, `customers`, `subscription-plans` | `Product`, `PriceList`, `ProductPairing`, `Customer`, `SubscriptionPlan` | 16, 17 |
| **governance** | `config` | `ApprovalChainConfig` | 18 |
| **quotations** | `quotations`, `pricing`, `risk`, `upsell` | `Quotation`, `Counter` | 2, 3, 4 |
| **approvals** | `approvals`, `audit` | `Approval`, `AuditLog` | 5, 6 |
| **portal** | `portal`, `negotiation`, `notifications` | `PortalToken`, `NegotiationEvent`, `Notification` | 11 |
| **inventory** | `warehouses`, `stock`, `orders`, `fulfillment` | `Warehouse`, `Stock`, `Order`, `Fulfillment` | 7, 8 |
| **billing** | `billing`, `subscriptions`, `invoices`, `payments` | `Subscription`, `Invoice`, `CreditNote` | 9, 10, 12, 13 |
| **analytics** | `deal-health`, `reporting` | `DealAlert` | 14, 15 |

`payments` has no collection of its own — a payment always belongs to one
invoice, so it is an embedded array and the endpoint is mounted on the invoices
router.

---

## Where the business rules live

Every rule below is a **pure function** in `packages/shared/src/logic`, with unit
tests and no database access. That is what makes them testable, and what lets the
UI preview a result the server will agree with.

| Rule | Function | File | Used by |
|---|---|---|---|
| Line pricing, tax, margin | `computeLinePricing`, `computeQuoteTotals`, `computeMargin` | `pricing.ts` | quotations, orders, invoices, portal |
| Blended discount risk + routing | `calculateBlendedRisk`, `resolveApprovalChain` | `risk.ts` | quotations (submit), config (re-score), portal (re-entry) |
| Warehouse split planning | `planWarehouseSplit`, `checkBackorderConsolidation` | `warehouse.ts` | fulfillment, stock |
| Proration and billing dates | `prorate`, `nextBillingDates` | `billing.ts` | orders, subscriptions, billing |
| Upsell ranking | `rankUpsells` | `upsell.ts` | upsell |
| Stalled / anomaly / slippage | `detectDealHealth` | `dealHealth.ts` | deal-health |

Nothing about these is hardcoded: they all read thresholds from
`ApprovalChainConfig`, which screen 18 edits live.

---

## Request lifecycle

```
request
  → attachUser          verifies the JWT signature and expiry (never throws)
  → <module> router
      → requireAuth     re-reads the account: still exists, still active, and
                        the role enforced is the DB's, not the token's (D-035)
      → validate(zod)   rejects a malformed body with a field-level 400
      → handler         business rule from packages/shared, then persistence
      → writeAudit      actor, action, entity, before/after, reason
  → errorHandler        one envelope: { success, data, error }
```

Read-side scoping sits between auth and the query: `utils/roleScope.ts` narrows
what a role may **see** (Finance's quotation list and approval queue), separately
from what a role may **do**.

---

## Realtime

Socket.IO rides on the **same HTTP server** as Express (`apps/api/src/index.ts`
wraps `createApp()` in `createServer`), on its own path `/realtime`. One port,
one origin, one CORS rule. `app.ts` stays frozen.

### Rooms are the authorisation boundary

Authentication happens **once**, in the handshake, and its result is a set of
rooms. Nothing downstream re-checks who may see what — an emit names a room, and
only sockets the handshake put in that room receive it.

```
handshake (apps/api/src/realtime/server.ts)
  ├─ portalToken?  → PortalToken must exist, not be revoked, not be expired
  │                  → rooms: user:<id>  role:CUSTOMER  customer:<id>  quotation:<the one it unlocks>
  ├─ JWT?          → verify, then RE-READ the account (same rule as requireAuth:
  │                  a token is a bearer credential we cannot recall)
  │                  → rooms: user:<id>  role:<ROLE>  + internal (never for CUSTOMER)
  └─ neither       → refused. A socket that cannot say who it is has no room to be in.
```

A client may additionally ask to watch one quotation
(`subscribe:quotation`). Internal users may watch any — they can already open it
over REST. A customer may watch only their own company's, and a magic-link
session only the quotation its link was minted for. That is the same rule
`assertPortalScope` enforces on the REST side, for the same reason: guessing an
id must not be a way in.

### Two kinds of message

| Kind | Events | Reaches | Carries |
| ---- | ------ | ------- | ------- |
| **Personal** | `notification:new`, `notification:count` | `user:<id>` only | the whole `NotificationDto` |
| **Domain** | `quotation:updated`, `approval:updated`, `negotiation:event`, `order:updated`, `fulfillment:updated`, `invoice:updated`, `subscription:updated`, `alert:updated`, `stock:updated`, `config:updated` | the rooms the change concerns | identity + a summary, never a document |

A domain event deliberately does **not** carry the changed record. It says "this
changed"; the screen re-reads it over REST and stays exactly as correct as it
was on first load — same role scoping, same pagination, same derived counts.
Pushing documents would mean maintaining a second, subtly different copy of
every endpoint's shaping logic.

### Persist first, emit second

`notifications.service.ts` is the only way a notification is created. The Mongo
row **is** the notification; the socket is only how it arrives sooner. A user who
was offline still finds it in the bell, and a failed emit never loses one — the
service logs a delivery failure rather than throwing, because a notification is a
courtesy on top of a business event that has already succeeded and been audited.

Three rules hold everywhere:

1. **Nobody is notified of their own action.** Every helper takes the actor and
   drops them from the recipient list.
2. **Persist first, emit second.**
3. **A notification is private** — written per user, pushed to that user's room.
   There is no shared feed to leak out of.

`emit.ts` is a no-op when realtime is not running, so the seed script, the smoke
test and any unit test call the same routes without a socket server.

### The client

One socket per tab (`core/realtime/realtime.service.ts`), shared by every store.
It follows the **session**, not the router: an `effect` watches the token, so
signing in connects, signing out disconnects, and swapping accounts reconnects
under the new identity — a socket still authenticated as the previous user would
otherwise keep receiving their notifications.

Screens opt in with `liveRefresh([events], () => this.reload())`
(`core/realtime/live-refresh.ts`), which collapses bursts, ignores the echo of
this session's own actions, and unsubscribes with the component. The quotation
builder is the one screen that guards the reload: an edited-but-unsaved draft
raises the existing "reload the latest version" notice instead of being
overwritten.


---

## The append-only registries

Three files are only ever appended to, never restructured:

- `apps/api/src/routes.registry.ts` — one line mounts a module; `app.ts` never changes.
- `apps/api/src/seed/seeds.registry.ts` — one line per seed module, with an explicit `order` for dependencies.
- `packages/shared/src/constants.ts` → `SCREEN_REGISTRY` — the screen list the docs and router agree on.

---

## Related documents

- `DATA_MODEL.md` — every collection, field by field.
- `DB_DIAGRAM.md` — the same thing as a diagram, with the relationships drawn.
- `API_CONTRACT.md` — every endpoint, its auth and its shape.
- `BUSINESS_RULES.md` — the rules in prose, with worked examples.
- `DECISIONS.md` — why each non-obvious choice was made.
