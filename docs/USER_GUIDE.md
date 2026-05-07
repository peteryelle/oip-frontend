# OIP User Guide

A guide to using WinQuest's Opportunity Intelligence Platform — what every screen does, how the matching engine works, and what you control as a user.

This guide applies to all roles: **owners** and **admins** can edit configuration; **members** can manage signal workflow; **viewers** can read but not change anything.

---

## Table of Contents

1. [How matching works — Profile, Objectives, Sentinel](#how-matching-works)
2. [Sentinel tiers — what they mean](#sentinel-tiers)
3. [The weekly cycle — what runs when](#the-weekly-cycle)
4. [Home dashboard](#home-dashboard)
5. [Weekly Update](#weekly-update)
6. [Market Review — the signals list](#market-review)
7. [Profile](#profile)
8. [Business Objectives](#business-objectives)
9. [Sentinel — keyword vocabulary](#sentinel)
10. [Pursued pipeline](#pursued-pipeline)
11. [Settings — Subscriptions, Team, Run history](#settings)
12. [Roles and what each can do](#roles)

---

## How matching works

The OIP runs a weekly scrape across the procurement and capital-planning sources you've subscribed to (city councils, school districts, state agencies). Every document it captures is a **signal**. Signals are then scored against your sentinel — the keyword vocabulary you've defined — and the matches are what you see in the app.

Three pieces of configuration drive what gets matched and how it ranks:

**Profile** describes your firm — what you do, what services you offer, what programs you care about. It's the human-readable answer to *"who are we?"*. The profile doesn't directly drive the regex matching, but it shapes the keyword vocabulary you build in the Sentinel and gives context for everyone reading the dashboard. Think of it as the **firm description**.

**Business Objectives** describe what you're trying to win — strategic targets, expansion areas, capability adjacencies. This is the answer to *"what are we hunting for right now?"*. Objectives inform which keywords belong in your sentinel and at what tier. Think of them as the **hunt brief**.

**Sentinel** is the keyword vocabulary that actually does the matching. Each keyword has a tier (1, 2, 3, or 4) and a group (civil_infrastructure, broadband_infra, etc.). When a signal's text contains a keyword, that's a match. When it contains *multiple* tier-1 keywords from different groups, that's a **tier1_strong** match — the highest signal quality.

The flow is conceptual → operational:

> Profile says "we're a civil engineering firm with a growing broadband practice."
> Objectives say "we want to win middle-mile broadband design work in upstate NY."
> Sentinel encodes that as keywords: `middle mile`, `BEAD`, `fiber`, `broadband`, `network design` (all tier 1, group `broadband_infra`).
> Now when a signal contains 2+ of those, it scores as tier1_strong — and you see it on the home page.

You can edit Profile and Objectives without changing what gets matched (descriptive only). Editing the **Sentinel** changes what matches — because that's the regex. After editing the sentinel, click **Re-score** to apply the new vocabulary to existing signals.

---

## Sentinel tiers

Keywords live in four tiers. The tier controls how much weight a match carries.

**Tier 1 — Primary**
The keywords that, when matched, are likely indicators of a real opportunity for you. These are the workhorses. A single tier-1 match qualifies a signal as `tier1`. Multiple tier-1 matches across different groups qualifies it as `tier1_strong` — the highest tier.
*Examples for HDR:* `middle mile`, `BEAD`, `master plan`, `engineering services`, `bridge replacement`.

**Tier 2 — Secondary**
Augmenting keywords. They support a primary match but don't elevate a signal on their own. Useful for nuance — a tier-2 keyword might be common procurement language ("contract renewal", "RFP") that's relevant only when paired with a tier-1 match.
*Examples for HDR:* `contract renewal`, `change order`, `value engineering`.

**Tier 3 — Exploratory**
Keywords you're testing. They surface in the table but don't currently drive scoring. Use this for new vocabulary you're considering — see how often it would hit before promoting it to tier 1 or 2.
*Examples:* `microwave` (does it correlate with telecom work for us?), `decarbonization` (worth tracking?).

**Tier 4 — Watchlist**
Keywords you want to remember exist but explicitly do NOT want firing. Use this for terms you've decided are off-strategy ("school bus contracts", "lead remediation"). They're documented so the team knows the decision was made consciously, not forgotten.

**The practical rule:** start everything in tier 1 if you think it should match. Demote to tier 2 if it produces too many weak hits. Park in tier 3 if you're uncertain. Move to tier 4 only when you've actively decided not to pursue it.

After moving keywords between tiers, click **Re-score** on the Sentinel page. Existing signals get re-evaluated against the new sentinel; nothing in your pursued pipeline is affected.

---

## The weekly cycle

The OIP runs on a weekly cadence. Here's what happens:

| Day | What happens |
|-|-|
| Saturday 02:00 | Scrape runs across all states with active subscriptions in the cycle group |
| Saturday 02:30–04:00 (typical) | Scoring auto-triggers when scrapes complete; new signals get matched against your current sentinel |
| Sunday – Friday | You review the weekly update, the new signals in Market Review, and decide which to pursue |
| Thursday 23:59 | **Edit cutoff** — any sentinel or profile edits you save before this time will be reflected in the next run |
| Saturday 02:00 | Next cycle begins |

Edits made after the Thursday cutoff still take effect, but you'll need to manually click **Re-score** on the Sentinel page to apply the new vocabulary to the prior week's signals.

If a state's scrape fails (rare), the cycle continues without it. The Run History page on Settings shows you which states succeeded and which failed.

---

## Home dashboard

The home view is your weekly briefing. It answers: **what should I act on this week?**

**Hero** — your firm name and OIP.

**Status strip** — five quick numbers:
- *Active signals · N states* — total scored signals across your subscribed states
- *Strong-tier hits* — how many of those are tier1_strong (your highest quality)
- *Entities tracked* — distinct sources (school districts, city councils, etc.) that produced matches
- *Run cadence* — when the scrape runs
- *Next scheduled run* — when fresh data lands

**Section nav** — quick jump to the other pages.

**Top 10 Pursuit Targets** — the entities most worth your attention this week, ranked by:

1. **Strong hits** (most important) — entities that triggered multiple tier-1 keywords in single signals
2. **Total signals** — overall activity volume
3. **Distinct keyword groups** — entities whose signals span multiple practice areas (a sign of cross-cutting opportunity)

Each row shows:
- **Quality** — *Strong* (3+ strong hits), *Active* (4+ total signals), or *Emerging* (some activity)
- **Timeline** — *Immediate* (act now), *Soon* (next 30 days), or *Plan in place* (build relationship)
- **Why it fits** — auto-generated rationale from matched keyword groups

Click "View signals" to drill into that entity's signals in Market Review.

---

## Weekly Update

A short editorial summary of the most recent run:

- **Total scored signals** and **strong-tier hits** for the cycle
- **Top 3 entities** with brief descriptions

Use this view as your "what's new" check-in — it's the lightweight alternative to scanning the full Market Review.

---

## Market Review

The full signals list. Every scored signal in your subscribed states across the retention window.

**Filters** at the top:
- **Status** — `new`, `reviewed`, `pursuing`, `dismissed`. Default view shows `new` only.
- **Tier** — filter by tier1_strong / tier1 / tier2.
- **State** — focus on one state.
- **Group** — focus on one keyword group (civil_infrastructure, broadband_infra, etc.).
- **Search** — keyword search across title and source name.

**Each signal card** shows:
- State, source name, and meeting/posting date
- Tier badge (Strong / Tier 1 / Tier 2)
- Title (the document or agenda item)
- Matched keywords (pills) — first 6 visible, "+N" overflow
- Status (right side)

**Click a card** to open the detail drawer. The drawer shows:
- Full title and metadata
- All matched keywords
- Excerpt — text around the first matched keyword (250 chars on each side)
- Source link — opens the original document in a new tab
- **Status buttons** — change status (new / reviewed / pursuing / dismissed)
- **Move to pursued pipeline** — snapshots the signal so it's preserved even if the source is later purged

**Status workflow:**
- *new* — hasn't been looked at yet
- *reviewed* — looked at but not pursuing
- *pursuing* — actively working it (also creates a row in Pursued Pipeline)
- *dismissed* — not relevant; hide from default view

Members and admins can change status. Viewers can only read.

---

## Profile

Your firm's description. Read by everyone; edited by admins.

**Fields:**
- **Description** — high-level firm description
- **Contact** — primary contact for OIP-related questions
- **Focus areas** — the disciplines you cover (civil engineering, broadband, federal compliance, etc.)
- **Service capabilities** — specific services you offer (planning, design, construction management, etc.)
- **Key funding programs** — federal/state programs you target (BEAD, Capital Projects Fund, etc.)
- **Target states** — states you're actively pursuing work in (informational; actual subscriptions are managed in Settings)

**To edit (admin only):**
1. Click **Edit profile** at the bottom
2. Make changes — fields support multi-line input where appropriate
3. Click **Save as new version**

Profile is versioned. Each save creates a new version; the previous version is archived but still queryable. This means changes are auditable — you can see when a focus area was added.

**Profile does not directly drive matching.** It's descriptive context. But it should reflect your current strategic posture, because your Sentinel keywords should follow from it.

---

## Business Objectives

Strategic targets and expansion areas. Read by everyone; edited by admins.

This page captures *what you're hunting for right now*. It's typically reviewed at the start of each pursuit-planning cycle and updated as priorities shift.

**Sections:**
- **Strategic targets** — specific opportunities or markets you're chasing this period
- **Expansion opportunities** — practice areas you're growing into
- **Evaluation criteria** — what makes an opportunity attractive (scale, geography, fit, etc.)

**Like Profile, Objectives don't directly match.** They guide which keywords belong in the Sentinel and at what tier. When you update objectives, ask: *do my sentinel keywords still encode this?* If you've decided to pursue hyperscale data center work, your sentinel needs `hyperscale`, `data center`, related vocabulary at tier 1.

---

## Sentinel

The keyword vocabulary. **This is what actually drives matching and scoring.**

**The page has two parts:**

### Keyword analytics (top)

Four summary tiles:
- **Total keywords** — how many keywords are in your active sentinel
- **Total matches** — sum of all keyword hits across signals
- **Zero-hit keywords** — keywords that haven't matched any signal (potential dead weight)
- **Strong predictors** — keywords with 3+ hits AND 50%+ strong rate

Below that, a sortable table with three sort options:

- **Hit count** — total signals where the keyword appeared
- **Strong rate** — of the signals this keyword matched, the % that were tier1_strong. Higher = the keyword fires on high-quality opportunities.
- **Co-occur rate** — of the signals this keyword matched, the % that also had a tier1_strong match in the same signal. Useful for finding keywords that "travel with" strong matches.

Use this to identify:
- **Dead weight** — keywords with zero hits over many cycles. Either remove them or drop to tier 4.
- **Workhorses** — high hit count + high strong rate = your most valuable keywords.
- **Noise** — high hit count + low strong rate = matching frequently but not on quality. Demote to tier 2.

### Keyword groups (below)

The actual editable vocabulary. Keywords are organized by group and tier. Each pill shows:
- The keyword
- Its tier (T1, T2, T3, T4)
- Inline hit count and a colored dot showing strong rate (green ≥50%, amber ≥25%, gray below)

**To edit (admin only):**
1. Click **Edit keywords**
2. Use the tier dropdown on each pill to change a keyword's tier
3. Use the × button to remove a keyword
4. Use **Bulk add** to paste in many new keywords at once (one per line; defaults to tier 1, group "general" — re-tier and re-group after)
5. Click **Save as new version** when done. This deactivates the current sentinel and makes your edited version active.

After saving, click **Re-score against current sentinel** to apply the new vocabulary to existing signals. The re-score:
- Only affects this OIP — other tenants and OIPs are unaffected
- Does not touch raw signals or Storage data
- Does not affect items in your pursued pipeline (those are snapshotted)

**Tier change quick-reference:**
- Promote tier 3 → tier 1 when you've validated a keyword reliably surfaces real opportunities
- Demote tier 1 → tier 2 when a keyword fires too often on weak matches
- Demote tier 1 → tier 4 (watchlist) when you've decided NOT to pursue what the keyword indicates
- Park new ideas in tier 3 to monitor without committing

---

## Pursued pipeline

Signals you've decided to actively pursue. Distinct from the Market Review list because:

- **They're snapshotted.** Even if the source document is later purged from retention, your pursued copy persists with all the original matched-keyword context.
- **They have pipeline stages.** Track an opportunity from `identified` through `qualifying`, `pursuing`, and to `won` or `lost`.
- **They're never auto-purged.** While Market Review respects the retention window, pursued items stay forever.

**To pursue a signal:**
1. From Market Review, click a signal
2. In the drawer, click **Move to pursued pipeline**
3. The signal appears in `/pursued` under the `pursuing` stage by default

**To advance pipeline stage:**
1. Open `/pursued`
2. Click the stage button on any item
3. The item moves to the new stage immediately

Members and admins can pursue signals and update stages. Viewers can read.

---

## Settings

Three sub-pages.

### Subscriptions

What states this OIP scrapes.

- **Tier** — your current subscription tier and the state limits (e.g., starter = 1–3 states, growth = 4–7, enterprise = 8+)
- **States** — toggle states on/off; the system enforces tier limits
- **Available tiers** — see what other tiers offer; contact support to upgrade

Adding a state means it'll be included in the next cycle. Removing a state stops new scrapes for it but keeps existing data.

### Team

Members and pending invites.

**To invite a teammate (admin only):**
1. Click **+ Invite team member**
2. Enter their business email
3. Choose role:
   - **Viewer** — read-only across the OIP
   - **Member** — can update signal status, add notes, move to pursued
   - **Admin** — everything members can do, plus edit profile, sentinel, subscriptions, and invite others
4. Click **Send invite**

The invitee receives an email with a magic link. They click it, set a password, and are added to the tenant. The invite expires in 14 days.

### Run history

Recent scrape and worker runs. Useful for:
- Confirming the last cycle completed successfully
- Diagnosing missing data ("did Wisconsin scrape last week?")
- Auditing re-score events

Each row shows: timestamp, state, status (success/failed/skipped), docs scraped, signals emitted, duration.

---

## Roles

| Capability | Owner | Admin | Member | Viewer |
|-|-|-|-|-|
| View dashboard, signals, profile, sentinel | ✓ | ✓ | ✓ | ✓ |
| Update signal status (reviewed/pursuing/dismissed) | ✓ | ✓ | ✓ | |
| Move signals to pursued pipeline | ✓ | ✓ | ✓ | |
| Update pursued pipeline stages | ✓ | ✓ | ✓ | |
| Edit profile and objectives | ✓ | ✓ | | |
| Edit sentinel keywords | ✓ | ✓ | | |
| Trigger re-score | ✓ | ✓ | | |
| Manage subscriptions (states) | ✓ | ✓ | | |
| Invite/manage team members | ✓ | ✓ | | |
| Delete tenant | ✓ | | | |

Each user has one role per tenant. If you have access to multiple OIPs (e.g. HDR Broadband and HDR Civil), your role is the same across them — roles are tenant-level, not OIP-level.

---

## Common workflows

**Weekly review (every Monday morning, 15 minutes):**
1. Open the home dashboard. Note the top-10 pursuits.
2. Click into Market Review. Filter by status: new.
3. Triage each new signal: dismiss the noise, mark the maybes as reviewed, move the real opportunities to pursued.
4. Open the Pursued page. Update stages on any items where progress has been made.

**Quarterly tune-up (every 90 days, 30 minutes):**
1. Open Sentinel. Review the analytics.
2. Sort by hit count ascending — see zero-hit keywords. Decide whether to remove or keep as tier 4.
3. Sort by strong rate descending — see your workhorses. Are they still relevant?
4. Sort by strong rate ascending (filter to tier 1) — see noise. Demote to tier 2.
5. Click Re-score after edits. Wait one cycle and check the analytics again.

**Onboarding a new team member:**
1. Settings → Team → + Invite
2. Email them the link to this guide
3. After they accept, walk them through Market Review and Pursued workflows
4. They can self-serve from there

---

## Glossary

- **OIP** — Opportunity Intelligence Platform. One configuration of (firm, vertical, sentinel, profile, objectives). A tenant can have multiple OIPs.
- **Tenant** — an organization (e.g., HDR Inc.). All your OIPs live under one tenant.
- **Vertical** — the industry/market focus (SLED = State, Local, Education, Government).
- **Signal** — a single document captured by the scraper. Lives in `signals` table.
- **Scored signal / OIP signal** — a signal that's been evaluated against your sentinel and matched at least one keyword. Lives in `oip_signals`.
- **Pursued signal** — a signal you've actively decided to chase. Snapshotted to survive purges.
- **Sentinel** — your keyword vocabulary. Versioned.
- **Tier** — the priority of a keyword (1 primary, 2 secondary, 3 exploratory, 4 watchlist).
- **Group** — the practice area a keyword belongs to (civil_infrastructure, broadband_infra, etc.).
- **Cycle** — one weekly run across a state grouping (NE, SE, MW, SW, W).
- **Re-score** — re-evaluate existing scored signals against your current sentinel, without re-scraping.

---

*Last updated: this guide ships with the OIP frontend. Click any in-app **Help** icon to jump back here.*
