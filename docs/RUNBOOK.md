# Runbook

Setup in under five minutes on a clean machine, the reset commands, and what to
do when something breaks.

## Setup

```bash
git clone <repo> && cd DealFlowTeam504
cp .env.example .env
npm install
npm approve-scripts esbuild        # only if npm warns about install scripts

docker compose up -d mongo         # Mongo 7 as a single-node replica set
npm run reset                      # wipe, rebuild, seed, verify
npm run dev                        # API on :3000 (REST + ws /realtime), web on :4200
```

Open **http://localhost:4200** and click any persona in the **Demo accounts**
panel. Credentials: `docs/CREDENTIALS.md`.

### If Docker is not available

Everything still works. `waitForMongo()` falls back to an **ephemeral in-memory
replica set**, announces itself loudly, and seeds itself. `npm run reset`,
`npm run verify` and `npm run dev:api` all run. The data does not persist across
restarts — fine for development, not what you want for the judged demo.

To get Docker working on Linux:

```bash
sudo systemctl start docker
sudo usermod -aG docker "$USER"    # then log out and back in
docker compose up -d mongo && npm run reset
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + web together |
| `npm run dev:api` | API only, on :3000 |
| `npm run dev:web` | Angular only, on :4200 |
| `npm run build:shared` | compile `packages/shared` (both apps consume `dist`) |
| `npm run seed` | seed without wiping |
| **`npm run reset`** | **the level-0 rebuild** — wipe, indexes, seed, 13 assertions |
| `npm run reset -- --keep-config` | wipe transactional data, keep products/users/config |
| `npm run reset -- --minimal` | config + users only — for testing empty states |
| `npm run reset -- --force` | allow a non-local Mongo URI (guard rail off) |
| **`npm run reset:check`** | **run the assertions only, wipe nothing** |
| `npm run demo:reset` | full rebuild + verification. **Run this before the demo.** |
| `npm run smoke` | the PDF's 8-step quick-test flow, over real HTTP |
| `npm run test` | 99 unit tests on the pure business logic |
| `npm run typecheck` | all three packages |
| `npm run lint` | zero warnings allowed |
| **`npm run verify`** | **build + typecheck + lint + test + reset + smoke. The merge gate.** |
| `npm run docs:credentials` | regenerate `CREDENTIALS.md` and the README block |
| `npm run mongo:up` / `mongo:down` | Docker Mongo |

---

## The level-0 reset

`npm run reset` returns the entire environment to a known-good baseline. **Nobody
on this team debugs a corrupted database during a hackathon** — you run this, it
takes seconds, and everything is exactly as it was.

What it does, printing a step-by-step log:

1. **Resolve and guard the target.** Refuses to run against a URI that does not
   look local/dev unless `--force` is passed.
2. **Wait for MongoDB**, with backoff, falling back to in-memory if needed.
3. **Drop the database** (or only the transactional collections with
   `--keep-config`).
4. **Recreate every collection and every index explicitly**, so no query
   silently falls back to a collection scan.
5. **Run the seed modules in dependency order** — config → users →
   pricelists/customers → products → warehouses/stock → plans → quotations →
   approvals/audit → orders/fulfillment → billing → history → alerts.
6. **Clear filesystem artifacts** (`storage/exports`, `uploads`, `logs`).
7. **Run 13 post-seed assertions**, and fail loudly if any is false.
8. **Print the summary** — document counts, the full credentials table, Priya's
   ready-to-click portal URL, the app URLs, and `Level-0 ready ✅`.

### The 13 assertions

| # | Assertion |
|---|---|
| 1 | exactly 7 demo users exist |
| 2 | **every demo credential authenticates** (real bcrypt compare) and carries the right role |
| 3 | **Q-1042 scores 33 → HIGH → `[SALES_MANAGER, FINANCE]`**, `maxSingleOver` 8, 2 explanation rows |
| 4 | Q-1042's audit trail has exactly the 3 seeded entries, chronologically, and it is PENDING with the Sales Manager |
| 5 | Laptop Pro 14 availability: **Main 18, East Depot 6**, and `available === inStock − reserved` |
| 6 | INV-1042 unpaid, INV-1043 recurring and paid, same order, **no shared line**, total equals the sum of lines |
| 7 | at least one stalled deal and one discount anomaly are detectable; Q-1030 reads "idle 9 days" |
| 8 | Priya's portal token resolves to Q-1042, is scoped to Acme, and R. Das does not share that scope |
| 9 | the audit trail is populated and every entry names an actor |
| 10 | no orphaned references across quotations, approvals, invoices and stock |
| 11 | stock reservation conservation, everywhere |
| 12 | money is stored as integers everywhere it matters |
| 13 | invoice totals equal the sum of their lines, and `amountDue === total − amountPaid` |

`npm run reset:check` runs assertions only. Two seconds, wipes nothing, answers
"is my environment still sane?".

**Timing.** Against Docker Mongo the rebuild is a few seconds. The in-memory
fallback adds ~10 s for the engine to start. `npm run demo:reset` is well inside
30 s either way — but for the judged demo, use Docker.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `MONGO_UNREACHABLE`, or the reset falls back to in-memory | Docker is not running, or you are not in the `docker` group | `sudo systemctl start docker` · `sudo usermod -aG docker "$USER"` then log out/in · `docker compose up -d mongo` |
| `permission denied … /var/run/docker.sock` | not in the `docker` group | as above. Until then the in-memory fallback keeps you working. |
| `Transaction numbers are only allowed on a replica set` | Mongo started standalone | `docker compose down && docker compose up -d mongo`. The compose file sets `--replSet rs0`; `withTransaction()` falls back gracefully in the meantime. |
| `rs.status()` errors / replica set not initialised | the health check has not run yet | wait ~10 s, or `docker exec dealflow-mongo mongosh --eval "rs.initiate()"` |
| `EADDRINUSE :3000` or `:4200` | something is already listening | `lsof -ti:3000 \| xargs kill` (or `:4200`), or change `PORT` in `.env` |
| Angular: `Cannot find module '@dealflow/shared'` | `dist` has not been built | `npm run build:shared` |
| API: the same | as above | as above (the `predev` hook usually handles it) |
| Typecheck OOMs | a circular import, or Mongoose generics | keep models as `Model<any>` (D-008) and never import `routes.registry.ts` from a router |
| `npm run reset` refuses to run | the Mongo URI does not look local | intended. `--force` only if you are certain. |
| A reset assertion fails | the seed and the rules disagree | read the named assertion — it says exactly which invariant broke. Do **not** edit the assertion to make it pass. |
| Every screen is empty | the database was wiped without seeding | `npm run reset` |
| Login fails for a demo account | stale or partially seeded data | `npm run reset`, then `npm run reset:check` |
| The portal says "This link is not valid" | the token was regenerated by a reset | take the fresh URL from the reset output |
| Stale `node_modules` after a rebase | workspace links out of date | `rm -rf node_modules apps/*/node_modules packages/*/node_modules && npm install` |
| `esbuild` / `nice-napi` install-script warnings | npm's script allowlist | `npm approve-scripts esbuild` (and `nice-napi`) |
| `ng serve` fails with **"Project target does not exist."** | a `buildTarget` written as `web:development` — that parses as *project:target*, i.e. a target literally named `development` | it must be *project:target:configuration*: `web:build:development`. Every `buildTarget` in `angular.json` needs all three segments. |
| Angular build: `Unexpected closing block` | `@else if (x; as y)` — unsupported | use `@else { @if (x; as y) { … } }` (D-007) |
| Angular build: `Opening tag not terminated` on a `[class.…/…]` | a Tailwind opacity class in a class binding | `[class]="cond ? 'bg-rose-50' : ''"` |
| The header shows an amber **Reconnecting…** chip | the socket is down — usually the API restarted, or `WEB_ORIGIN` does not match where the app is served from | the app keeps working over REST; the chip clears on its own when the API is back. If it never clears, check the browser console for the handshake error and confirm `WEB_ORIGIN` in `.env` |
| The bell never updates but the pages do | realtime is off but REST is fine — `environment.useMocks` is on (mock mode deliberately opens no socket), or the handshake was refused | turn off mock mode; a refused handshake is logged in the console with its reason (expired token, deactivated account, revoked portal link) |
| A socket connects then immediately drops | the JWT expired, or the account was deactivated mid-session | sign in again. This is intended: `requireAuth` and the handshake enforce the same rule, so a revoked account cannot hold a socket open |
| Realtime works for internal users but not the portal | the portal link was revoked or reissued | a reissue revokes every live token; take the fresh URL from the reset output or from **Reissue customer link** |
| The frontend needs an endpoint that does not exist yet | your backend counterpart is behind | set `environment.useMocks = true` and keep going |
| `GET /api/v1/<module>/_health` says `todo: […]` | that endpoint is not built | it names the domain and the screens it serves. See `ARCHITECTURE.md`. |

---

## Before the judged demo

```bash
docker compose up -d mongo     # persistent, not the in-memory fallback
npm run demo:reset             # rebuild + verify. Look for "Level-0 ready ✅"
npm run dev                    # then open http://localhost:4200
```

Then, in order:

1. Confirm the login screen shows all seven personas in the demo panel.
2. Click **J. Rao** — the dashboard should show non-zero tiles.
3. Open **Approvals** as **M. Shah** — Q-1042 should be there, HIGH, score 33.
4. Copy Priya's portal URL from the reset output and open it in a second window,
   signed out. Keep that window open.
5. Have `npm run demo:reset` ready in a spare terminal. If anything goes sideways
   mid-demo, it is seconds to a clean state.

Fallback narration for each beat: `DEMO_SCRIPT.md`.

---

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | API port |
| `API_BASE_PATH` | `/api/v1` | |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/dealflow360?replicaSet=rs0&directConnection=true` | must look local for the reset to run |
| `MONGO_DB_NAME` | `dealflow360` | |
| `JWT_SECRET` | dev secret | change for anything real |
| `JWT_EXPIRES_IN` | `12h` | long enough that a session never dies mid-demo |
| `PORTAL_TOKEN_TTL_DAYS` | `3650` | demo-only; see `DECISIONS.md` D-009 |
| `WEB_ORIGIN` / `WEB_BASE_URL` | `http://localhost:4200` | CORS, and the printed portal URL |
| `SHOW_DEMO_LOGINS` | `true` | `false` hides the panel and empties the endpoint |
| `SEED_NOW` | blank | pin an ISO date to freeze the seed for reproducible screenshots |
| `DEMO_PASSWORD` | `Demo@123` | |
| `BCRYPT_ROUNDS` | `8` | deliberately low so seeding 7 users stays fast |
