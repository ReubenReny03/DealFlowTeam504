# Demo script

Five minutes, two full flows, eight judging moments. Speaker notes, timings, and
a fallback line for every step.

## Before you start

```bash
docker compose up -d mongo
npm run demo:reset        # look for "Level-0 ready ✅"
npm run dev
```

**Set up three browser windows before you go on:**

| Window | Signed in as                         | Sitting on                                |
| ------ | ------------------------------------ | ----------------------------------------- |
| 1      | J. Rao (`rep@dealflow360.test`)      | `/app/quotations`                         |
| 2      | M. Shah (`manager@dealflow360.test`) | `/app/approvals`                          |
| 3      | signed out                           | Priya's portal URL, from the reset output |

Keep a fourth terminal with `npm run demo:reset` ready. If anything goes sideways
you are seconds from a clean state.

**Role switching on stage is one click** — the login screen's Demo accounts
panel. Never type a password in front of judges.

---

## The eight judging moments

| #   | Moment                                                | Where             | Why it wins                        |
| --- | ----------------------------------------------------- | ----------------- | ---------------------------------- |
| 1   | The blended risk score is **explained on screen**     | screen 6          | it is not a black box              |
| 2   | The **re-approval loop**, live                        | portal → screen 5 | the most impressive twenty seconds |
| 3   | The split shows its **rationale**, and override works | screen 8          | the logic is provably real         |
| 4   | One order → **two billing artefacts**                 | screens 10, 13    | hybrid billing is genuinely hybrid |
| 5   | The portal is **provably restricted**                 | R. Das → 403      | five seconds, very high value      |
| 6   | The **audit trail** with user, time and reason        | screen 6          | governance, not just workflow      |
| 7   | Change a ceiling, **behaviour changes live**          | screen 18         | proves nothing is hardcoded        |
| 8   | Everything is **seeded, fast, never blank**           | all               | it feels finished                  |

---

## The script

### 0:00 – 0:20 · Open

> "Most sales tools take a quote and turn it into an invoice. This one **governs
> the deal while it's happening** — it decides who needs to approve it, how to
> ship it, and how to bill it, without anyone asking.
>
> Everything you're about to see is computed. Nothing on screen is a constant."

---

### 0:20 – 1:00 · The rep builds a quote _(window 1, J. Rao)_

**Do:** open Q-1042 for Acme Corp. Point at the upsell panel. Click **Add to
Quote** on Care Plan 2yr.

> "J. Rao is quoting Acme. On the right, ranked upsell suggestions from real
> co-purchase history, each with its margin impact.
>
> Watch the margin figure — **[click]** — it moved in the same frame. No
> round-trip. The browser runs the exact same pricing functions the server does."

**Do:** click into the Onsite Setup Service discount field, type `18`, tab out.

> "Now the discount. Acme is a Gold customer, allowed 15%. But this is a _service_
> line, and services are capped at 10% because the margins are thin.
>
> **[tab]** — the moment I leave the field: **OVER, plus 8 points**. And the risk
> card underneath already says HIGH, 33, and tells me it's going to route to a
> Sales Manager and then Finance. Before I've submitted anything."

**Fallback:** _"The margin figure is live here — you'll see it move again when we
re-price in a moment."_ Then carry on to submit.

---

### 1:00 – 1:20 · It intercepts by itself · **MOMENT 1**

**Do:** click **Submit for Approval**.

> "I expected that to just go out. **I never asked for an approval.** The system
> scored the quote, decided it needed two people, and intercepted it."

**Fallback:** switch to M. Shah's window — Q-1042 is already seeded in the queue.
_"Here it is, already waiting for the manager."_

---

### 1:20 – 2:10 · Why it was flagged _(window 2, M. Shah)_ · **MOMENT 1, 6**

**Do:** open Approvals, click Q-1042.

> "The manager's queue. Three pending, and the risk level is the first column he
> reads.
>
> **[open]** — and this is the part that matters. It doesn't just say HIGH."

**Do:** point at the _Why This Quote Was Flagged_ table, line by line.

> "The laptop: 12% given, 15% allowed — fine. The setup service: 18% given, 10%
> allowed — **eight points over**. And the weight column shows how much of the
> order each line represents, because the score is revenue-weighted.
>
> One bad line is enough. And so is a pattern of small ones — three lines two
> points over each still routes to a manager. That's what 'blended' means."

**Do:** scroll to the audit trail.

> "Every round is here. Submitted, returned, resubmitted — each with a name, a
> time and a reason. Nothing happens in this system without a record."

**Do:** approve. Point at the stepper.

> "Approved by the manager — and it moves to **Finance**, because HIGH needs two."

**Do:** sign in as K. Iyer (one click), approve.

---

### 2:10 – 2:35 · Two approvals, then the customer

> "Finance approves, and now the customer can see it."

---

### 2:35 – 3:20 · The portal _(window 3, Priya)_ · **MOMENT 5**

**Do:** switch to window 3.

> "Completely different surface. Different login, different navigation — three
> items. And notice what she **cannot** see: no margin, no cost, no risk score,
> no idea who approved it."

**Do:** _(optional, five seconds — sign in as R. Das and open the same URL)_

> "And it's genuinely restricted. Here's a customer from a different company
> opening the same link — **403.** Not a hidden button. A different credential
> with a server-side scope check."

**Do:** back as Priya, type a comment on the warranty line, enter a counter
discount, click **Submit Request**.

> "She wants a better warranty discount. She proposes it right here — no email."

**Fallback:** if the counter endpoint is not wired, say: _"When she submits, the
system re-scores the new terms against the same engine and, if they breach,
sends it straight back for approval."_ Then show the seeded re-approval state.

---

### 3:20 – 3:40 · The re-approval loop · **MOMENT 2 — the big one**

**Do:** switch to M. Shah's window. Refresh.

> "**Look at the manager's queue. It's back.**
>
> Nobody requested that review. The customer changed the terms, the system
> re-scored them against the same rules, saw they now breached the threshold, and
> **put the quote back in the approval chain by itself.** The audit reason says
> exactly that: re-entered from negotiation."

_(Pause here. This is the moment. Let it land.)_

---

### 3:40 – 4:10 · Confirm, split and hybrid billing · **MOMENTS 3, 4**

**Do:** approve, switch to Priya, click **Confirm Quotation**. Then open
Fulfillment.

> "Confirmed. And the order splits itself: 18 units from Main Warehouse, 6 from
> East Depot, two shipments, sixty-eight dollars.
>
> But here's the part I care about — **it tells you why.**"

**Do:** point at the _Why this split_ panel.

> "No single warehouse could cover it. Warehouses ranked by coverage, then by
> shipping cost weight. Main first. And if operations disagrees, **Manual
> Override** — validated against real availability, and logged with a reason."

**Do:** open Subscriptions → the Acme Care Plan.

> "And the same order produced **two** billing artefacts. One-time lines on the
> left, invoiced only for what actually shipped. Recurring lines on the right,
> with their own schedule, billed at the start of each period. Same order.
> Neither list ever contains the other."

**Fallback:** the seeded ORD-1041 and ORD-1032 already show a split, a backorder
and both invoice types. _"Here's one from earlier today."_

---

### 4:10 – 4:30 · Record a payment

**Do:** open the unpaid invoice, **Record Payment**.

> "Nothing is billed before it ships — a partial delivery makes a partial
> invoice, automatically. Record the payment, and the stepper moves: confirmed,
> shipped, invoiced, **paid**."

---

### 4:30 – 4:50 · Change a ceiling, live · **MOMENT 7**

**Do:** sign in as A. Verma, open **Discount Tiers & Approvals**. Set Gold to 20
and Services to 20, type a reason, **Save configuration**.

> "Last thing. This is the governance screen. Let me raise the Gold tier and the
> services ceiling to 20% — and save.
>
> **[save]** — and look underneath. Every open quotation just got re-scored.
> Q-1042 went from **33 to 0** and **auto-approved**. The approval it was waiting
> on is gone.
>
> Nothing about that risk engine is hardcoded. It reads this screen."

**Fallback:** if the impact panel is empty, open Q-1042 — the score has changed.
_"Same quote, different number, because the rules changed."_

---

### 4:50 – 5:00 · Deal Health, and close · **MOMENT 8**

**Do:** open Deal Health.

> "And it watches the deals nobody is looking at. Stalled quotes, discounts out
> of character **for that specific rep**, delivery promises at risk. One click
> nudges the rep.
>
> Quote to cash, with the governance in the middle actually doing something.
> Thank you."

---

## What we'd build next

_(Have this ready — it is worth thirty seconds if you are asked.)_

- Email delivery of quotation links
- Multi-company support — an explicit bonus in the brief
- Variant-level stock, rather than per product per warehouse
- Approval delegation and out-of-office routing
- Forecasting on top of the deal-health signals

Full list with reasoning: `FEATURE_PRIORITY.md` P3.

---

## Phase E surfaces — optional 20-second detours

Built in the integration/hardening pass (`PHASE_E.md`). None are on the critical
path; drop them in only if you have slack.

- **Notification bell** (internal header): after the "nudge" beat in the Deal
  Health close, click the 🔔 — the nudge/escalation is sitting there, deep-links
  to the deal, "Mark all read" clears the badge.
- **Reissue customer link**: on the approval-detail page for an approved quote,
  "Reissue customer link" → a fresh magic link, old links revoked. This is the
  other end of the portal's "ask your account manager for a new one" message.
- **SLA highlight**: on Reporting, the "Avg Approval Time" tile is green within
  the 24h target, rose over it; the approval queue flags any pending item past it.
- **Stale-version dialog**: edit Q-1042 in two tabs, save both — the second gets
  a "this quotation changed while you were editing it" dialog with a Reload
  button, not a lost write.

---

## If something breaks on stage

1. **Do not debug in front of judges.** Move to the next beat and come back.
2. Every beat has a seeded fallback — the state you need already exists in the
   database, so you can _show_ it rather than _create_ it.
3. If the app is genuinely wedged: `npm run demo:reset` in the spare terminal,
   and keep talking about the rule while it rebuilds.
4. If the API is down, the quotation builder still computes totals, margin and
   risk locally — the arithmetic is in the browser. Use that.
