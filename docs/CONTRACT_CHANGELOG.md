# Contract changelog

`packages/shared` is the frozen contract. Every enum, DTO and pure function in
it is imported by **both** the API and the Angular app, and nobody redefines any
of it locally.

## The rule

**Frozen after Phase 3.** Adding an optional field is cheap; changing or removing
one breaks another agent's compile at the worst possible moment.

Before you change anything in `packages/shared`:

1. **Prefer adding an optional field** over changing an existing one.
2. Say so in the team channel *before* you edit, naming the type.
3. Add a row to the table below.
4. Run `npm run verify` — it typechecks all three packages together, so it will
   catch every downstream break in one pass.
5. Merge the shared change **on its own**, before the work that needs it.

If you cannot avoid a breaking change, it is the integrator's call, and it
happens at a checkpoint (T+8 / T+14 / T+19), never between them.

## What counts as breaking

| Change | Breaking? |
|---|---|
| Adding an optional field to a DTO | No |
| Adding a new enum member | No — unless something switches exhaustively on it |
| Adding a new exported function | No |
| Renaming or removing a field | **Yes** |
| Making an optional field required | **Yes** |
| Changing a field's type | **Yes** |
| Changing what a pure function returns | **Yes** |
| Changing a risk threshold *default* | No — but say so, it moves the demo numbers |

## Log

| # | Date | Type | What changed | Why | Who | Downstream |
|---|---|---|---|---|---|---|
| 1 | T+0 | Baseline | Initial contract: enums, entity DTOs, request/response DTOs, and the nine pure functions (`computeLinePricing`, `computeQuoteTotals`, `computeMargin`, `calculateBlendedRisk`, `resolveApprovalChain`, `prorate`, `nextBillingDates`, `rankUpsells`, `planWarehouseSplit`) | Phase 1 | Architect | — |
| 2 | T+10 | Additive | `AuditEntity` gains `PRICELIST`, `WAREHOUSE`, `SUBSCRIPTION_PLAN` | The catalogue writes (A-19..A-22) audit-log against their own entity rather than borrowing `CONFIG`. Nothing switches exhaustively on `AuditEntity`, so this is non-breaking. | A | none — additive enum members |
| 3 | T+10 | Additive | New request DTOs: `UpdatePriceListRequest`, `UpsertWarehouseRequest`, `UpsertSubscriptionPlanRequest` | `PUT /pricelists/:id`, `POST`/`PUT /warehouses` and `POST /subscription-plans` needed typed bodies; `UpsertProductRequest` already existed. | A | none — new exported types |
| 4 | T+21 | Additive | New request DTO: `UpsertCustomerRequest`; `AuditEntity` gains `CUSTOMER` | `POST /customers` and `PATCH /customers/:id` — the last endpoints left in the `customers` module's `todo` list — needed a typed body and their own audit entity, matching the `UpsertWarehouseRequest` / `WAREHOUSE` pattern. | A | none — new exported type and additive enum member |

<!-- Append below. One row per change. -->
