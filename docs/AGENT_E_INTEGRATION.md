# Agent E — Integration & Hardening

**Not a fifth person.** This is a role, taken in turn by whoever is free at each
checkpoint. The rota is A → B → C → D, matching the merge order and the
dependency direction.

Your job is the thing no single agent can do alone: prove the four slices are
actually one product.

---

## Merge protocol

**Trunk-based.** Short-lived branches, rebased before merge, merged straight to
`main`. No long-lived integration branch — it becomes a second `main` that nobody
tests.

```
feat/<agent>/<slice>        feat/b/quotation-builder · feat/c/portal-counter
```

### The merge gate

```bash
git fetch && git rebase origin/main
npm run verify              # build + typecheck + lint + test + reset + smoke
```

**Green, or it does not merge.** No exceptions, no "I'll fix it after".

`npm run verify` is deliberately slow (~40 s) because it is the only thing
standing between four parallel agents and a broken `main`.

### Merge order at every checkpoint: **A → B → C → D**

Dependencies flow that way, so merging against that grain means each agent
rebases onto a tree that already contains what they depend on.

### Conflicts

If two people touched the same file, **one of them was in the wrong file.** The
ownership tables in `AGENT_*.md` are the arbiter. The three shared files are
append-only arrays — a conflict there is two lines added at the same index, and
the resolution is always "keep both, in owner order A, B, C, D".

### Contract changes

Anything in `packages/shared` after T+6:

1. announce it before you edit, naming the type
2. add a row to `CONTRACT_CHANGELOG.md`
3. merge the shared change **on its own**, before the work that needs it
4. `npm run verify` typechecks all three packages together, so it catches every
   downstream break in one pass

A **breaking** change (rename, remove, tighten, retype) is the integrator's call
and happens **at a checkpoint**, never between them.

---

## The three mandatory checkpoints

**T+8 · T+14 · T+19.** Every agent stops, merges, and the integrator drives.

Each one opens the same way, **on a clean clone**:

```bash
git clone <repo> /tmp/dealflow-check && cd /tmp/dealflow-check
cp .env.example .env && npm install
npm run reset && npm run reset:check
```

A clean clone, because "works on my machine" is the failure mode this catches.

---

### Checkpoint 1 — T+8 · "the spine is connected"

**Goal:** everyone is unblocked and the contract is stable.

| ✓ | Check |
|---|---|
| ☐ | `npm run reset` prints `Level-0 ready ✅`, all 13 assertions |
| ☐ | `npm run reset:check` passes on a clean clone |
| ☐ | `npm run dev` starts both apps with no errors |
| ☐ | All seven personas sign in and land on the correct screen |
| ☐ | All 18 routes render — none blank, none 404 |
| ☐ | `GET /api/v1/_routes` lists every module |
| ☐ | Every `/<module>/_health` reports its owner and its remaining TODOs |
| ☐ | `packages/shared` is stable — no pending contract change |
| ☐ | `npm run smoke` shows **0 FAIL** (PENDING is expected and fine) |

**The two conversations that must happen here:**

1. **B → C:** is `POST /quotations/:id/submit` landing by T+11? If not, C
   confirms out loud that they are building against the seeded approvals.
2. **C → D:** agree the `createOrderFromQuotation(quotationId, actor)` signature,
   in writing.

**Rollback rule:** if `main` is red for more than 30 minutes, revert the last
merge. Do not debug on `main` while three people are blocked.

---

### Checkpoint 2 — T+14 · "the golden path runs"

**Goal:** the demo works end to end, even if it is rough.

| ✓ | Check |
|---|---|
| ☐ | Everything from checkpoint 1, still green |
| ☐ | Cross-module contract tests **1–6** pass (below) |
| ☐ | The golden path is walkable by hand, start to finish |
| ☐ | `npm run smoke` has ≤ 2 PENDING and **0 FAIL** |
| ☐ | Every P0 row in `FEATURE_PRIORITY.md` is merged or has a named ETA |
| ☐ | Somebody has read the demo script out loud with the app open |

**The hard question:** *is any P0 row at risk?* If yes, this is where the team
converges — everyone drops P1 and helps.

**Rollback rule:** if the golden path cannot be walked by hand at T+14, freeze
all P1 work until it can.

---

### Checkpoint 3 — T+19 · "demo hardening"

**Goal:** it cannot embarrass you on stage.

| ✓ | Check |
|---|---|
| ☐ | All 11 cross-module contract tests pass |
| ☐ | `npm run demo:reset` completes and prints `Level-0 ready ✅` |
| ☐ | The data consistency sweep is clean (below) |
| ☐ | Every one of the 18 screens has loading, empty and error states |
| ☐ | Every list is paginated; no unindexed query |
| ☐ | 401 and 403 behave as `USER_FLOWS.md` §E11 and §E13 describe |
| ☐ | The demo has been rehearsed **twice**, end to end, with timings |
| ☐ | Screenshot fallbacks captured for all eight judging moments |
| ☐ | The "what we'd build next" slide is written from `DECISIONS.md` + P3 |

**Rollback rule:** after T+19, **feature freeze.** Bug fixes and rehearsal only.
A feature that lands at T+22 has not been rehearsed, and an unrehearsed feature
is a liability.

---

## The cross-module contract test suite

Eleven end-to-end assertions that **no single agent can write alone**. Run
against a freshly reset level-0 database, using the §2.9 credentials.

Most are already automated in `apps/api/src/tests/e2e-smoke.ts`; the rest are the
integrator's manual pass. As each agent lands their slice, convert the manual
ones into smoke steps.

| # | Test | Automated? | Owners |
|---|---|---|---|
| 1 | **Admin raises Gold *and* Services to 20%** ⇒ Q-1042 recomputes to `NONE` and auto-approves ⇒ its pending approval closes with an explanation. *(Raising only Services drops it 33 → 12, HIGH → MEDIUM — the tier ceiling still binds. See `DECISIONS.md` D-006.)* | ✅ smoke 12 | A |
| 2 | A quote with Laptop 12% / Setup 18% ⇒ **riskScore 33, HIGH, chain `[SALES_MANAGER, FINANCE]`**, and screen 6's explanation table matches field for field | ✅ smoke 2 + reset 3 | A, B, C |
| 3 | Manager returns ⇒ rep edits ⇒ resubmits ⇒ the audit trail has **3 entries in order** | ✅ reset 4 | B, C |
| 4 | The approved quote appears in the portal under **Priya's** token and only hers — **R. Das gets 403**, an internal JWT gets 403, an expired token gets `PORTAL_TOKEN_EXPIRED` | ✅ smoke 7 | A, C |
| 5 | A customer counter beyond the threshold ⇒ the quote **re-enters approval automatically**, stage `PENDING_APPROVAL`, audit reason `RE_ENTERED_FROM_NEGOTIATION` | ✅ smoke 8 | C |
| 6 | Confirm ⇒ split across **Main 18 + East 6**, stock reserved, availability decremented, `rationale` non-empty | ✅ smoke 5 + reset 5 | C, D |
| 7 | East Depot restocks ⇒ the **consolidation prompt** appears on screen 8 | manual → smoke | D |
| 8 | A hybrid order ⇒ a one-time invoice for the **shipped** quantity **and** a separate recurring schedule with correct next-bill dates ⇒ **the recurring invoice contains no one-time line** | ✅ smoke 6 + reset 6 | D |
| 9 | Record a payment ⇒ invoice `PAID`, the order stepper advances, Deal Health and Reporting KPIs update | ✅ smoke 9 | D |
| 10 | A quote idle > 7 days appears in **Stalled Deals**; a nudge writes an activity record | ✅ smoke 10 + reset 7 | D |
| 11 | **All seven credentials authenticate and land on the correct screen** | ✅ smoke 0 + reset 2 | A |

```bash
npm run smoke     # runs every automated one and reports PASS / PENDING / FAIL
```

**PENDING is not FAIL.** A step that is not built yet reports `⧗ awaiting Agent X`
and names the owner. A step that is built and *wrong* fails the run. That is the
distinction the whole harness is built around, and it doubles as the team's live
progress dashboard.

---

## Data consistency sweeps

Run at every checkpoint. Assertions 9–13 of `npm run reset` cover most of it
automatically; the rest is a query.

| Sweep | What it proves | Automated? |
|---|---|---|
| **Orphaned references** | every quotation has a real owner and customer; every approval a real quotation; every invoice a real order | ✅ reset 10 |
| **Stock reservation conservation** | `available === max(0, inStock − reserved)` on every row, and nothing negative | ✅ reset 11 |
| **Reservations match allocations** | `Σ stock.reserved` for a product equals `Σ` open allocations for it | manual query |
| **Money is integral** | no persisted total is a float | ✅ reset 12 |
| **Invoice arithmetic** | `total === Σ lines.total` and `amountDue === total − amountPaid` | ✅ reset 13 |
| **No double-billing** | `Σ invoiced qty ≤ Σ shipped qty` on every order line | manual query |
| **Timezone consistency** | every stored date is UTC; nothing has drifted a day | manual spot-check |
| **Audit completeness** | every approval decision has a matching `AuditLog` with a non-empty reason | ✅ reset 9 |
| **One alert per rule per deal** | the `{quotationId, type}` unique index holds after a re-evaluation | manual |

---

## Performance and robustness pass — T+19

| Area | Check |
|---|---|
| **N+1 queries** | no `find()` inside a loop over documents. The denormalised `customerName` / `ownerName` / `warehouseName` fields exist precisely so list screens need no joins. |
| **Indexes** | every filter and sort in a list endpoint is covered. `syncAllIndexes()` builds them explicitly during reset — nothing relies on lazy autoIndex. |
| **Pagination** | every list endpoint accepts `page` and `pageSize` and returns `meta.total`. 149 seeded quotations must not arrive in one response. |
| **Optimistic concurrency** | a `PATCH /quotations/:id` with a stale `version` returns `409 STALE_VERSION`, and the UI shows "This record changed while you were editing it." |
| **Global error boundary** | every unhandled error becomes a typed envelope, never a stack trace on the wire in production |
| **Loading / empty / error** | all 18 screens. Walk them with the API stopped. |
| **401 / 403** | 401 clears the session and returns to login with a banner; 403 toasts and redirects to the user's own landing route |
| **Payload size** | no endpoint returns more than ~500 documents |

---

## Demo hardening

**`npm run demo:reset` must restore the exact demo state, fast.** Against Docker
Mongo it is a few seconds; the in-memory fallback adds about ten. Rehearse with
Docker, and check the banner says `Level-0 ready ✅`.

**Rehearse the script twice, with a timer.** `DEMO_SCRIPT.md` has the beats, the
timings, the exact sentences and a fallback line for every step.

**Capture screenshot fallbacks** for all eight judging moments before T+21. If
something fails live, you show the screenshot and keep talking. Store them in
`docs/screenshots/`.

**Offline fallback.** The quotation builder computes totals, margin and risk in
the browser, so it keeps working with the API down. If the network fails on
stage, use screen 4 to explain the risk engine while someone restarts the API.

**The "what we'd build next" slide** comes from `DECISIONS.md` (what we chose not
to do and why) plus P3 of `FEATURE_PRIORITY.md`. Naming the trade-offs reads as
judgement; pretending there were none reads as naivety.

---

## Risk register

| # | Risk | Likelihood | Impact | Owner | Mitigation |
|---|---|---|---|---|---|
| 1 | **Agent A slips past T+6 and stalls three people** | Medium | **Critical** | A | Ship the contract at T+2 *separately*. Everyone else uses `environment.useMocks = true` and the seeded data. Escalate at T+4, not T+6. |
| 2 | **Two agents implement the risk rule differently** | Low | **Critical** | A | Structurally impossible: `calculateBlendedRisk` is one pure function in `packages/shared`, imported by both sides. Reject any PR that reimplements it. |
| 3 | **B's `submit` slips and blocks C** | Medium | High | B, C | The seeded approvals are correct and complete. C builds the whole state machine against them. Decide at T+8, not T+14. |
| 4 | **C's `confirm` slips and blocks D's finale** | Medium | High | C, D | ORD-1041, ORD-1032 and ORD-1036 are seeded. D builds and demos split, billing and payment against them, and wires the call last. |
| 5 | **Mongo transactions unavailable on someone's machine** | Medium | Medium | A | `withTransaction()` detects a standalone deployment and falls back to sequential writes. The compose file starts a replica set. |
| 6 | **Docker unavailable / permissions** | Medium | Medium | A | The in-memory replica-set fallback. `npm run reset`, `verify` and `dev:api` all still work, loudly announced. |
| 7 | **A corrupted local database eats an hour** | High | Medium | all | `npm run reset`. Thirty seconds to a known-good state. Nobody hand-fixes data. |
| 8 | **Scope creep past T+19** | High | High | integrator | Feature freeze at T+19. The P3 list is the answer to "could we also…". |
| 9 | **A seeded value drifts and breaks three tests** | Medium | Medium | all | 13 reset assertions + 12 smoke steps. **Fix the seed, never the assertion.** |
| 10 | **The demo is never rehearsed end to end** | Medium | **Critical** | integrator | It is a checkpoint-3 gate. Twice, timed, with the fallbacks read out. |

---

## The integrator's checklist, every time

```bash
# 1. clean clone
git clone <repo> /tmp/dealflow-check && cd /tmp/dealflow-check
cp .env.example .env && npm install

# 2. level-0
npm run reset          # 13 assertions, "Level-0 ready ✅"
npm run reset:check    # again, without wiping

# 3. the gate
npm run verify         # build + typecheck + lint + 99 tests + reset + smoke

# 4. the contract suite
npm run smoke          # 0 FAIL. PENDING is fine and names its owner.

# 5. by hand
#    - all seven personas sign in and land correctly
#    - all 18 screens render
#    - walk the golden path once
```

Then post in the channel: **what merged, what is still PENDING and who owns it,
and whether any P0 row is at risk.** That last sentence is the whole point of the
checkpoint.
