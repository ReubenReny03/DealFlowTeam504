# Phase E — Integration & Hardening

**Status:** ✅ complete · `npm run verify` green (build + typecheck ×3 + lint 0 warnings +
99 unit + reset **16/16** + smoke **16/16**) · `npm run build -w @dealflow/web` green.

Phase E is the **Agent E role** from `AGENT_E_INTEGRATION.md` — "prove the four
slices are one product" — plus the last open **P2 polish** items from
`PROGRESS.md`. A/B/C/D were already functionally complete on the write side; this
phase closed every remaining `[ ]` on the board and automated the cross-module
sweeps that were still manual.

---

## What shipped

### #35 · Notification centre

- **Backend** (`notifications` module): `GET /notifications` is now user-scoped,
  paginated, and returns `unreadCount`; new `POST /notifications/read-all`.
  Read-state writes no audit entry — it is not a business event (matches the
  existing `PATCH /:id/read`).
- **Frontend**: `NotificationBellComponent` in the internal shell header — a bell
  with an unread badge and a dropdown panel; each row deep-links to the deal it
  concerns and marks itself read; "Mark all read" clears the badge. Backed by
  `NotificationStore`. Mock fixture added so it renders in `useMocks` mode.
- Not mounted in the dark admin shell — notifications are about deals, which live
  in the sales workspace, and the bell's palette is built for the light header.

### #36 · Magic-link reissue

- **Backend**: `POST /quotations/:id/portal-link` (internal JWT, write roles).
  Revokes **every** live `PortalToken` for the quotation and mints one fresh
  14-day link for the customer's portal contact. Audited as
  `PORTAL_LINK_REISSUED`. Rejected for a `DRAFT` or `REJECTED` quotation.
- **Frontend**: "Reissue customer link" button on the approval-detail page (for
  an `APPROVED` approval) and the quotation-detail header (any non-draft
  quotation). Result opens in a modal with a copy-to-clipboard field and the
  expiry date. Closes the loop the expiry banner (`USER_FLOWS §E11`) already
  told the customer about.

### #37 · Avg-approval-time SLA highlighting

- New shared constant `APPROVAL_SLA_HOURS = 24`.
- **Backend**: `ReportingDashboardDto` gains `avgApprovalSlaHours` and
  `avgApprovalWithinSla`; both also land in the CSV / PDF / XLSX summary blocks.
- **Frontend**: the "Avg Approval Time" KPI tile turns green within SLA, rose
  over it, with a "within / over the 24h SLA target" caption. The approval queue
  shows an "⚠ over SLA" chip on any `PENDING` row that has sat past the target.

### #38 · Stale-version merge prompt

- The HTTP interceptor no longer toasts a `409 STALE_VERSION` — the quotation
  builder owns it.
- `QuotationBuilderStore` exposes `staleConflict` and `reloadFromServer()`.
- Screen 4 shows a proper dialog when a save/submit loses the version race:
  **Reload latest** (discards local edits, re-reads the server copy) or
  **Keep editing** (dismiss; the next save will 409 again until reload). The
  on-screen figures stay visible behind the dialog so nothing is lost silently.

### #34 · Pagination on approvals / subscriptions / invoices

- The three list endpoints that overrode `GET /` with a custom counts handler
  now honour `page` / `pageSize` and return `paginate(...)` meta, matching
  `readonly.factory.ts`. Default page size 50.
- `ApprovalStore` / `BillingStore` switched those loads to `getWithMeta`; a new
  `PaginatorComponent` (Prev · "page X of Y" · Next) renders on each list only
  when the total exceeds one page.

### #29 · Loading / empty / error audit on C & D screens

Walked every C/D screen. The `@if loading / @else if error / @else if empty /
@else` pattern was already consistent on the list and detail screens. Two
customer-portal tabs were missing an error branch — `portal-messages` and
`portal-profile` now render `df-error-state` with a retry when the portal load
fails. Everything else was already correct.

---

## Cross-module sweeps — now automated

`e2e-smoke.ts` grew three steps (13–15); `reset-env.ts` grew three assertions
(14–16):

| Sweep | Was | Now |
|---|---|---|
| #7 Restock ⇒ consolidation prompt | manual | **smoke 13** — restock East Depot ⇒ `POST /stock/adjust` flips `ORD-1032` to consolidation-available and `GET /fulfillment/:id/consolidation` confirms |
| Notification centre round-trip | — | **smoke 14** — escalate writes one unread notification to the manager; `read-all` clears the badge; every notification is user-scoped |
| Magic-link reissue | — | **smoke 15** — reissue revokes the seeded link (old link → 403) and returns a working new one (new link → 200) |
| Reservations back allocations | manual query | **reset 14** — every committed fulfillment allocation is covered by a real `stock.reserved` |
| No double-billing | manual query | **reset 15** — `qtyInvoiced ≤ qtyShipped` on every non-subscription order line |
| One alert per rule per deal | manual | **reset 16** — no duplicate `(quotationId, type)` in `DealAlert` |

Updated `PROGRESS.md`'s contract-test table accordingly (7 of the 11 are now
smoke steps; the rest were already automated).

---

## Checkpoint status (`AGENT_E_INTEGRATION.md`)

### Checkpoint 1 — "the spine is connected" ✅
All seven personas sign in and land correctly (smoke 0 / reset 2). Every module
`/_health` reports `todo: []`. `packages/shared` stable — three additive changes,
all logged in `CONTRACT_CHANGELOG.md` (#5–#7). `npm run smoke` 0 FAIL.

### Checkpoint 2 — "the golden path runs" ✅
Cross-module contract tests 1–6 pass (smoke 2/5/6/7/8 + reset). The golden path
is exercised end to end by the smoke suite: submit → risk → chain → portal →
counter → re-approval → confirm → order → split → invoice → payment. Every P0 row
in `FEATURE_PRIORITY.md` is merged.

### Checkpoint 3 — "demo hardening" ✅ (with named exceptions)
- All 11 cross-module contract tests pass — 7 as smoke steps, 4 already automated.
- `npm run demo:reset` completes with `Level-0 ready ✅`.
- Data-consistency sweep clean — reset assertions 9–16.
- Loading / empty / error states present on all 18 screens.
- Every list endpoint paginated; `syncAllIndexes()` builds every index explicitly.
- 401 / 403 behave per `USER_FLOWS §E11` / `§E13`.

**Deliberate non-goals** (deferred per `DECISIONS.md`, unchanged by this phase):
sockets / live notification push, email delivery, magic-link **email** send
(the link is generated and shown to the rep to send however they send things),
drag-and-drop persistence, the fancier stale-version *merge* UI (a reload dialog
is shipped; a field-level three-way merge is not).

**Not performed here** (needs a human, not code):
- A live end-to-end demo rehearsal with a timer (`DEMO_SCRIPT.md`).
- Screenshot fallbacks for the eight judging moments (`docs/screenshots/`).

The endpoints and screens all exist and are exercised by `npm run verify`; the
rehearsal and screenshots are a person-with-the-app task.

---

## Files touched

- **Contract**: `packages/shared/src/{constants.ts, dto/requests.ts}`
- **API**: `modules/notifications/notifications.routes.ts`,
  `modules/quotations/quotations.routes.ts`, `modules/reporting/reporting.routes.ts`,
  `modules/{approvals,subscriptions,invoices}/*.routes.ts`
- **Web**: `core/state/{feature.stores.ts, quotation-builder.store.ts}`,
  `core/http/api.interceptor.ts`, `core/api/mock.data.ts`,
  `shared/ui/{notification-bell,paginator}.component.ts` (new) + barrel,
  `layouts/internal-shell.component.ts`,
  `features/quotations/quotation-detail.page.ts`,
  `features/approvals/{approval-list,approval-detail}.page.ts`,
  `features/reports/reports.page.ts`,
  `features/{subscriptions,invoices}/*-list.page.ts`,
  `portal/{portal-messages,portal-profile}.page.ts`
- **Tests / docs**: `apps/api/src/tests/e2e-smoke.ts`, `scripts/reset-env.ts`,
  `docs/{PHASE_E.md, PROGRESS.md, CONTRACT_CHANGELOG.md, DEMO_SCRIPT.md}`
