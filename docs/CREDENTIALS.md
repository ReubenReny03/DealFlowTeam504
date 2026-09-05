# Demo credentials

<!-- GENERATED FILE - do not edit by hand.
     Source of truth: apps/api/src/seed/users.seed.ts (DEMO_ACCOUNTS)
     Regenerate with: npm run docs:credentials -->

Every persona in DealFlow360 has a pre-seeded, working account. No registration,
no setup - run `npm run reset` and sign in.

<!-- BEGIN GENERATED CREDENTIALS -->

| Persona | Name | Email | Password | Role | Lands on |
|---|---|---|---|---|---|
| Admin | A. Verma | `admin@dealflow360.test` | `Demo@123` | `ADMIN` | /admin/products |
| Sales Rep | J. Rao | `rep@dealflow360.test` | `Demo@123` | `SALES_REP` | /app/dashboard |
| Sales Rep 2 | S. Nair | `rep2@dealflow360.test` | `Demo@123` | `SALES_REP` | /app/dashboard |
| Sales Manager | M. Shah | `manager@dealflow360.test` | `Demo@123` | `SALES_MANAGER` | /app/dashboard |
| Finance | K. Iyer | `finance@dealflow360.test` | `Demo@123` | `FINANCE` | /app/approvals |
| Customer — Acme Corp | Priya Menon | `priya@acmecorp.test` | `Demo@123` | `CUSTOMER` | /portal |
| Customer — Beta Industries | R. Das | `das@betaindustries.test` | `Demo@123` | `CUSTOMER` | /portal |

**Customer portal, ready to click:** http://localhost:4200/portal/q/Q-1042?token=demo-acme-q1042-2f7a91c4b8e04d16 (Acme Corp / Priya)

**And a second company:** http://localhost:4200/portal/q/Q-1038?token=demo-beta-q1038-6c31d0af59b74e28 (Beta Industries / R. Das)

<!-- END GENERATED CREDENTIALS -->

## The one-click demo panel

The login screen (screen 1) shows a **Demo accounts** panel listing every persona
with a *Log in as...* button that fills the form and submits it. One click puts
you on that persona's own landing screen - no typing on stage.

It is guarded by `environment.showDemoLogins` (`apps/web/src/environments/`),
which is `true` in development and `false` in a production build. The API
mirrors the guard: `GET /api/v1/auth/demo-accounts` returns an empty array
unless `SHOW_DEMO_LOGINS=true`.

## The customer portal, two ways in

The portal accepts **either** path, and the two are scoped differently:

1. **Magic link** - the seeded, deterministic tokens in the URLs above. The
   `portalGuard` stashes the token and the HTTP interceptor sends it as
   `X-Portal-Token` on every `/portal/*` request. A link unlocks **exactly one
   quotation**, so the portal's list shows that one and says so.
2. **Password login** - `priya@acmecorp.test` / `Demo@123`. A
   `CUSTOMER` user is scoped to their own **company**, which means they see
   **every quotation that company has been sent**, not just the last one linked.

### One customer, many quotations

Sign in as **R. Das** (`das@betaindustries.test`) and the portal opens on
*My Quotations*: Beta Industries' whole set - one still in negotiation, one
approved and waiting on him, one already confirmed, one sitting in internal
approval - each with its own lines and its own message thread. Open his magic
link instead and the same screen shows a single row, because that is all the
link was minted for.

### The negative-auth demo (five seconds, and worth doing)

Sign in as **R. Das** (`das@betaindustries.test`) and try to open Acme Corp's
quotation - by his own login, or by pasting Priya's link. Both return **403**.
An internal JWT returns 403 as well: the portal is not an internal screen with a
different header, it is a different surface with a different guard.

The expired-link path is seeded too. Token `demo-acme-q1042-expired-000000000`
returns `PORTAL_TOKEN_EXPIRED`, and the portal renders "This link has expired"
with instructions rather than a blank page.

## Where these come from

| Place | How it is produced |
|---|---|
| The database | `seedUsers()` in `apps/api/src/seed/users.seed.ts`, bcrypt-hashed at seed time |
| Seed / reset console output | `credentialsTable()` from the same file |
| `docs/CREDENTIALS.md` (this file) | `credentialsMarkdown()`, via `npm run docs:credentials` |
| `README.md` | the same generated block, between the GENERATED markers |
| The login screen panel | `GET /api/v1/auth/demo-accounts`, served from `DEMO_ACCOUNTS` |

Passwords are **never** stored in plaintext in the database - only the bcrypt
hash is. The plaintext lives in `DEMO_ACCOUNTS` purely so the demo panel and
these docs can show it.

## A note on production

> These are deliberately uniform hackathon demo credentials: one password, no
> rotation, no MFA, no lockout, and a portal token with a ten-year lifetime.
> In production every one of those would be replaced - see `docs/DECISIONS.md`
> **D-009**, which records the decision and what would change.

## Verifying them

`npm run reset` asserts, as one of its post-seed checks, that **every account in
this table authenticates** and that each carries the landing route listed above.
If a credential ever stopped working, the reset fails loudly rather than letting
you discover it on stage.

```bash
npm run reset:check   # re-runs those assertions without wiping anything
```
