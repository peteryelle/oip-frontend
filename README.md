# OIP Frontend

React + Vite + Supabase customer dashboard for the WinQuest Opportunity
Intelligence Platform. Single-file `src/App.jsx` contains all views;
mobile-first design, renders correctly on desktop and phone simultaneously.

## What's in this bundle

```
oip-frontend/
├── README.md                     # this file
├── package.json
├── vite.config.js
├── netlify.toml                  # SPA-fallback config
├── index.html
├── .env.example                  # configure with your Supabase keys
├── src/
│   ├── main.jsx                  # entry point
│   ├── App.jsx                   # all views in one file
│   ├── styles/global.css         # ported from your mockup + responsive
│   └── lib/
│       ├── supabase.js           # client setup
│       ├── auth.jsx              # AuthProvider + useAuth hook
│       ├── oip.jsx               # OipProvider + useOip hook
│       └── password.js           # password rule validator
└── supabase/
    ├── migrations/
    │   └── 005_tenant_invites.sql   # apply BEFORE first deploy
    └── functions/
        └── invite-email/index.ts    # deploy as Supabase Edge Function
```

## Views included

| Route | What it does |
|-|-|
| `/login` | Email + password login |
| `/forgot-password` | Magic-link reset |
| `/reset-password` | New password form (after magic link) |
| `/accept-invite` | Invitee sets initial password |
| `/` | OIP Dashboard (hero, stats, top-10 entities) |
| `/weekly` | Weekly Update — last cycle's significant signals |
| `/market` | Full signals list with filters and detail drawer |
| `/profile` | Profile (view + admin edit + version save) |
| `/objectives` | Strategic targets / expansion opportunities |
| `/sentinel` | Keyword editor (tier / group / version save / re-score) |
| `/pursued` | Pursued pipeline (signals snapshotted out of retention) |
| `/settings` | Settings landing |
| `/settings/team` | Team members + invitations |
| `/settings/subscriptions` | States + tier display |
| `/settings/runs` | Run history (scrape_runs + worker_jobs) |
| `/account` | Change password |

## Setup

### Prerequisites

- Node 18+
- Supabase project with schema migrations 001–004 already applied (worker schema)
- The OIP worker bundle deployed (so signals exist to display)

### Apply migration #5

In Supabase SQL Editor, paste and run the contents of:
```
supabase/migrations/005_tenant_invites.sql
```

This adds the `tenant_invites` table and the `create_tenant_invite` /
`claim_tenant_invite` RPC functions.

### Local dev

```bash
cd oip-frontend
npm install
cp .env.example .env
# Edit .env — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# (anon key, NOT service_role; the frontend ships this to the browser)
npm run dev
```

Open http://localhost:5173 . Sign in with a user you've created in the
Supabase Authentication dashboard (or accept an invite if one was sent).

### Auth setup — first user

Until invitations are flowing, you need at least one admin user. In the
Supabase dashboard:

1. **Authentication → Users → Add user** → enter your email + a temporary
   password. Set "Auto Confirm User" to true.
2. **SQL Editor**, run:

   ```sql
   insert into tenant_members (tenant_id, user_id, role)
   select t.id, u.id, 'owner'
   from tenants t, auth.users u
   where t.slug = 'hdrinc' and u.email = 'YOUR_EMAIL_HERE';
   ```

3. Sign in to the frontend with that email/password. You should see the
   HDR OIP dashboard.

### Deploy the invite-email Edge Function

The team-invitation flow uses a Supabase Edge Function to send emails via
Resend. Deploy it once:

```bash
# Install Supabase CLI if you haven't:
#   npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set the secrets the function reads
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set OPS_EMAIL_FROM="WinQuest OIP <invites@biq-i.com>"
supabase secrets set APP_URL="https://oip.biq-i.com"

# Deploy
supabase functions deploy invite-email
```

The frontend invokes this function automatically when an admin sends an
invite. If `RESEND_API_KEY` isn't set, the function will fail; the invite
row is still created in the DB, so the admin sees it in the team list,
but the email won't go out. Re-deploy with the key set to fix.

### Deploy to Netlify

```bash
# Link your repo to Netlify (one-time)
# In Netlify dashboard: New site from Git → connect repo → choose this folder

# Build settings:
#   Build command: npm run build
#   Publish directory: dist
#   (these are also in netlify.toml so it auto-detects)

# Environment variables (Netlify → Site settings → Environment variables):
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY

# Then in Supabase dashboard:
#   Authentication → URL Configuration → Site URL: https://YOUR-NETLIFY-URL.netlify.app
#   Add the same URL to Redirect URLs (for magic links to work)
```

Push to your main branch; Netlify auto-builds and deploys.

## Password rules

Per your specification:
- 8+ characters
- At least one letter
- At least one digit
- At least one special character (!, @, #, $, %, &, *, etc.)

Validation runs in the browser before submit. Supabase's server-side
minimum is set in dashboard → Authentication → Policies (set to 8 to match).

## Auth flows

**Sign in** — Email + password. Standard Supabase auth.

**Forgot password** — User enters email; Supabase sends a magic link;
clicking it lands them on `/reset-password` where they set a new password.

**Invite a teammate** — Admin clicks "Invite" on /settings/team. Calls
`create_tenant_invite` RPC. Frontend invokes the `invite-email` Edge
Function which generates a magic link and sends via Resend. Recipient
clicks the link, signs in, lands on `/accept-invite?token=...`, claims
the invite (creates `tenant_members` row), sets a password.

**Account / change password** — `/account` shows current email, allows
password change. Subject to the same password rules.

## Roles

- **viewer** — read-only
- **member** — can update signal status (new/reviewed/pursuing/dismissed),
  add notes, move to pursued pipeline
- **admin** — everything members can do, plus edit profile and sentinel,
  manage subscriptions, invite team
- **owner** — same as admin (currently)

Role checks happen in the UI (buttons hidden) and via RLS policies in
the DB (writes rejected if role is wrong).

## Top 10 entity ranking algorithm

The home dashboard ranks entities (BoardDocs district, Legistar body,
state agency source) by their `oip_signals` activity:

1. **Primary sort** — `tier1_strong` matches descending
2. **Secondary** — total scored signals descending
3. **Tertiary** — distinct keyword groups (cross-cutting matters)

`quality` label:
- `strong` — ≥3 strong-tier matches
- `active` — ≥4 total matches
- `emerging` — anything else with matches

`timeline` label:
- `immediate` — ≥2 strong matches
- `soon` — ≥3 total matches
- `plan` — anything else

Rationale text is auto-generated from matched groups. This is a v1
algorithm; refine in `App.jsx` → `makeRationale` and the sort comparator
in `HomePage`.

## Realtime updates

The home dashboard and market review subscribe to `postgres_changes` on
`oip_signals` filtered by the current OIP. New signals or status changes
appear without manual refresh. Subscription is cleaned up when the
component unmounts.

This requires Supabase Realtime to be enabled on the `oip_signals` table:
```sql
-- In Supabase SQL Editor, one-time:
alter publication supabase_realtime add table oip_signals;
```

## Mobile responsive

The CSS file ends with a `@media (max-width: 768px)` block that:
- Stacks the topbar vertically
- Reduces hero title size
- Switches the Top-10 table to card layout
- Stacks signal-card content vertically
- Stacks filter controls

All views are usable on mobile; the design is mobile-first per your spec.
Test in Chrome dev tools' device emulator or on an actual phone.

## What's NOT included (deferred)

- **Realtime on profile/sentinel changes** (the worker doesn't update these)
- **Email-template customization** (uses inline template in Edge Function)
- **Multi-language / i18n**
- **Custom-domain email setup** (instructions are in Resend's docs)
- **OIP creation UI** — new OIPs are still created via SQL or the loader
  scripts. Frontend assumes OIPs exist.

## Troubleshooting

**"No OIP available" on home** — your auth user has no row in
`tenant_members`. See the "first user" steps above.

**Password rules not enforcing on Supabase server** — go to dashboard →
Authentication → Policies → set min password length to 8.

**Magic links don't work** — check Authentication → URL Configuration. The
site URL and redirect URLs must include your Netlify domain (or
http://localhost:5173 for dev).

**Realtime isn't updating** — confirm `oip_signals` is in the
`supabase_realtime` publication (see SQL snippet above).

**"create_tenant_invite" returns "Not authorized"** — the calling user's
role in `tenant_members` is not `owner` or `admin`. Update directly in SQL
or grant via another admin.
