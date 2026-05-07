// User Guide content. Section keys map to anchor IDs used by ?help= deep links.
// To update: edit the markdown text below; rebuild and redeploy.
//
// Format: each top-level section is a string; the renderer parses headings (#, ##, ###),
// lists, tables, and bold/italic/code inline. Keep the structure simple to keep the
// renderer simple. See HelpPage in App.jsx.

export const USER_GUIDE = `# OIP User Guide

A guide to using WinQuest's Opportunity Intelligence Platform — what every screen does, how the matching engine works, and what you control as a user.

This guide applies to all roles: **owners** and **admins** can edit configuration; **members** can manage signal workflow; **viewers** can read but not change anything.

## How matching works

The OIP runs a weekly scrape across the procurement and capital-planning sources you've subscribed to (city councils, school districts, state agencies). Every document it captures is a **signal**. Signals are then scored against your sentinel — the keyword vocabulary you've defined — and the matches are what you see in the app.

Three pieces of configuration drive what gets matched and how it ranks:

**Profile** describes your firm — what you do, what services you offer, what programs you care about. It's the human-readable answer to *who are we?*. The profile doesn't directly drive the regex matching, but it shapes the keyword vocabulary you build in the Sentinel and gives context for everyone reading the dashboard. Think of it as the **firm description**.

**Business Objectives** describe what you're trying to win — strategic targets, expansion areas, capability adjacencies. This is the answer to *what are we hunting for right now?*. Objectives inform which keywords belong in your sentinel and at what tier. Think of them as the **hunt brief**.

**Sentinel** is the keyword vocabulary that actually does the matching. Each keyword has a tier (1, 2, 3, or 4) and a group (civil_infrastructure, broadband_infra, etc.). When a signal's text contains a keyword, that's a match. When it contains *multiple* tier-1 keywords from different groups, that's a **tier1_strong** match — the highest signal quality.

The flow is conceptual → operational:

> Profile says "we're a civil engineering firm with a growing broadband practice."
> Objectives say "we want to win middle-mile broadband design work in upstate NY."
> Sentinel encodes that as keywords: \`middle mile\`, \`BEAD\`, \`fiber\`, \`broadband\`, \`network design\` (all tier 1, group \`broadband_infra\`).
> Now when a signal contains 2+ of those, it scores as tier1_strong — and you see it on the home page.

You can edit Profile and Objectives without changing what gets matched (descriptive only). Editing the **Sentinel** changes what matches — because that's the regex. After editing the sentinel, click **Re-score** to apply the new vocabulary to existing signals.

## Sentinel tiers

Keywords live in four tiers. The tier controls how much weight a match carries.

**Tier 1 — Primary**
The keywords that, when matched, are likely indicators of a real opportunity for you. These are the workhorses. A single tier-1 match qualifies a signal as \`tier1\`. Multiple tier-1 matches across different groups qualifies it as \`tier1_strong\` — the highest tier.
*Examples for HDR:* \`middle mile\`, \`BEAD\`, \`master plan\`, \`engineering services\`, \`bridge replacement\`.

**Tier 2 — Secondary**
Augmenting keywords. They support a primary match but don't elevate a signal on their own. Useful for nuance — a tier-2 keyword might be common procurement language ("contract renewal", "RFP") that's relevant only when paired with a tier-1 match.
*Examples for HDR:* \`contract renewal\`, \`change order\`, \`value engineering\`.

**Tier 3 — Exploratory**
Keywords you're testing. They surface in the table but don't currently drive scoring. Use this for new vocabulary you're considering — see how often it would hit before promoting it to tier 1 or 2.
*Examples:* \`microwave\` (does it correlate with telecom work?), \`decarbonization\` (worth tracking?).

**Tier 4 — Watchlist**
Keywords you want to remember exist but explicitly do NOT want firing. Use this for terms you've decided are off-strategy ("school bus contracts", "lead remediation"). They're documented so the team knows the decision was made consciously, not forgotten.

**The practical rule:** start everything in tier 1 if you think it should match. Demote to tier 2 if it produces too many weak hits. Park in tier 3 if you're uncertain. Move to tier 4 only when you've actively decided not to pursue it.

After moving keywords between tiers, click **Re-score** on the Sentinel page. Existing signals get re-evaluated against the new sentinel; nothing in your pursued pipeline is affected.

## The weekly cycle

The OIP runs on a weekly cadence:

- **Saturday 02:00** — Scrape runs across all states with active subscriptions in the cycle group
- **Saturday 02:30–04:00** — Scoring auto-triggers when scrapes complete; new signals get matched against your current sentinel
- **Sunday – Friday** — You review the weekly update, the new signals in Market Review, and decide which to pursue
- **Thursday 23:59** — *Edit cutoff*. Sentinel or profile edits saved before this time will be reflected in the next run
- **Saturday 02:00** — Next cycle begins

Edits made after Thursday cutoff still take effect, but you'll need to manually click **Re-score** on the Sentinel page to apply the new vocabulary to the prior week's signals.

If a state's scrape fails (rare), the cycle continues without it. Run History on Settings shows you which states succeeded and which failed.

## Home dashboard

The home view is your weekly briefing — what should I act on this week?

**Status strip** — five quick numbers: active signals, strong-tier hits, entities tracked, run cadence, next scheduled run.

**Top 10 Pursuit Targets** — the entities most worth your attention this week, ranked by:
1. Strong hits (most important) — entities that triggered multiple tier-1 keywords in single signals
2. Total signals — overall activity volume
3. Distinct keyword groups — entities whose signals span multiple practice areas (cross-cutting opportunity)

Each row shows quality (Strong / Active / Emerging), timeline (Immediate / Soon / Plan in place), and an auto-generated rationale.

Click "View signals" to drill into that entity's signals in Market Review.

## Weekly Update

A short editorial summary of the most recent run: total scored signals, strong-tier hits, top 3 entities with brief descriptions. Use this view as your "what's new" check-in — the lightweight alternative to scanning Market Review.

## Market Review

The full signals list. Every scored signal in your subscribed states across the retention window.

**Filters:** status (default: new), tier, state, group, keyword search.

**Each signal card** shows state, source, date, tier badge, title, matched keyword pills, and current status.

**Click a card** to open the detail drawer with full title, all matched keywords, excerpt around the first match, source link, status buttons, and "move to pursued pipeline."

**Status workflow:**
- *new* — hasn't been looked at yet
- *reviewed* — looked at but not pursuing
- *pursuing* — actively working it (also creates a Pursued Pipeline row)
- *dismissed* — not relevant; hidden from default view

## Profile

Your firm's description. Read by everyone; edited by admins.

**Fields:** description, contact, focus areas, service capabilities, key funding programs, target states.

**To edit:** click *Edit profile* (admin only). Each save creates a new version; previous versions are archived.

Profile does not directly drive matching — it's descriptive context. But it should reflect your strategic posture, because your Sentinel keywords should follow from it.

## Business Objectives

Strategic targets and expansion areas. Read by everyone; edited by admins.

This page captures *what you're hunting for right now*. It's typically reviewed at the start of each pursuit-planning cycle.

**Sections:** strategic targets, expansion opportunities, evaluation criteria.

Like Profile, Objectives don't directly match — they guide which keywords belong in the Sentinel and at what tier.

## Sentinel

The keyword vocabulary. **This is what actually drives matching and scoring.**

### Keyword analytics (top of page)

Four summary tiles: total keywords, total matches, zero-hit keywords (potential dead weight), strong predictors.

A sortable table with three sort options:
- **Hit count** — total signals where the keyword appeared
- **Strong rate** — % of those signals that were tier1_strong. Higher = the keyword fires on high-quality opportunities.
- **Co-occur rate** — % of those signals that also had a tier1_strong match in the same signal. Useful for finding keywords that "travel with" strong matches.

Use this to identify dead weight (zero hits → remove or move to tier 4), workhorses (high hits + high strong rate → your best keywords), and noise (high hits + low strong rate → demote to tier 2).

### Keyword groups (below)

The actual editable vocabulary, organized by group and tier. Each pill shows the keyword, tier, hit count, and a colored dot encoding strong rate (green ≥50%, amber ≥25%, gray below).

**To edit (admin only):**
1. Click *Edit keywords*
2. Use tier dropdown to change tier; × to remove
3. Use *Bulk add* to paste many new keywords at once
4. Click *Save as new version* — deactivates current sentinel, makes edited version active

After saving, click *Re-score against current sentinel* to apply the new vocabulary. The re-score:
- Only affects this OIP — other tenants and OIPs are unaffected
- Does not touch raw signals or Storage data
- Does not affect items in your pursued pipeline (those are snapshotted)

## Pursued pipeline

Signals you've decided to actively pursue. Distinct from Market Review because:
- They're snapshotted — even if the source document is purged, your pursued copy persists with the original matched-keyword context
- They have pipeline stages — track from \`identified\` through \`qualifying\`, \`pursuing\`, \`won\`, or \`lost\`
- They're never auto-purged

**To pursue:** open a signal in Market Review, click *Move to pursued pipeline*. The signal appears in /pursued under the *pursuing* stage by default.

**To advance stage:** open /pursued, click the stage button on any item.

## Settings

### Subscriptions

What states this OIP scrapes.

- *Tier* — your current subscription tier and the state limits
- *States* — toggle on/off; the system enforces tier limits

Adding a state: included in the next cycle. Removing a state: stops new scrapes but keeps existing data.

### Team

Members and pending invites.

**To invite (admin only):**
1. Click *+ Invite team member*
2. Enter business email + role (Viewer / Member / Admin)
3. Click *Send invite*

The invitee receives a magic link, sets a password, and is added to the tenant. Invites expire in 14 days.

### Run history

Recent scrape and worker runs. Use this to confirm last cycle completed, diagnose missing data, audit re-score events.

## Roles

| Capability | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| View dashboard, signals, profile, sentinel | ✓ | ✓ | ✓ | ✓ |
| Update signal status | ✓ | ✓ | ✓ | |
| Move to pursued / update pipeline stages | ✓ | ✓ | ✓ | |
| Edit profile, objectives, sentinel | ✓ | ✓ | | |
| Trigger re-score | ✓ | ✓ | | |
| Manage subscriptions / team | ✓ | ✓ | | |

Each user has one role per tenant. If you have access to multiple OIPs, your role is the same across them — roles are tenant-level.

## Common workflows

**Weekly review (Monday morning, ~15 minutes):**
1. Open home dashboard. Note the top-10 pursuits.
2. Open Market Review. Filter to status: new.
3. Triage: dismiss noise, mark maybes as reviewed, move real opportunities to pursued.
4. Open Pursued. Update stages where progress was made.

**Quarterly tune-up (every 90 days, ~30 minutes):**
1. Open Sentinel analytics.
2. Sort by hit count ascending — see zero-hit keywords. Remove or move to tier 4.
3. Sort by strong rate descending — see workhorses. Confirm still relevant.
4. Sort by strong rate ascending (filter tier 1) — see noise. Demote to tier 2.
5. Click Re-score. Check analytics again next cycle.

**Onboarding a new team member:**
1. Settings → Team → + Invite
2. Email them the link to this guide
3. After they accept, walk them through Market Review and Pursued workflows

## Glossary

- **OIP** — Opportunity Intelligence Platform. One configuration of (firm, vertical, sentinel, profile, objectives).
- **Tenant** — an organization (e.g., HDR Inc.). All your OIPs live under one tenant.
- **Vertical** — the industry/market focus (SLED = State, Local, Education, Government).
- **Signal** — a single document captured by the scraper.
- **Scored signal / OIP signal** — a signal that matched at least one of your keywords.
- **Pursued signal** — a signal you've actively decided to chase. Snapshotted.
- **Sentinel** — your keyword vocabulary. Versioned.
- **Tier** — keyword priority (1 primary, 2 secondary, 3 exploratory, 4 watchlist).
- **Group** — practice area a keyword belongs to.
- **Cycle** — one weekly run across a state grouping (NE, SE, MW, SW, W).
- **Re-score** — re-evaluate existing scored signals against your current sentinel without re-scraping.
`

// Anchor map: section title (lowercase, simplified) → in-app help target id.
// Used by ?help= deep links from contextual ? icons throughout the app.
export const HELP_ANCHORS = {
  'matching':       'how-matching-works',
  'tiers':          'sentinel-tiers',
  'cycle':          'the-weekly-cycle',
  'home':           'home-dashboard',
  'weekly':         'weekly-update',
  'market':         'market-review',
  'profile':        'profile',
  'objectives':     'business-objectives',
  'sentinel':       'sentinel',
  'pursued':        'pursued-pipeline',
  'settings':       'settings',
  'subscriptions':  'settings',
  'team':           'settings',
  'roles':          'roles',
  'workflows':      'common-workflows',
  'glossary':       'glossary',
}
