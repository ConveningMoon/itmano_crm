# Phase 3 — Auth Setup: Manual Steps

These are the one-time manual steps for getting Magic Link auth working in production.
They must be completed by Dylan after the `phase3/auth-hardening` PR is merged.

---

## Step 1 — Update Supabase Site URL

Magic Link emails contain a redirect URL. If the Site URL is `localhost:3000`, clicking
the link in production will redirect to localhost instead of `app.itmano.com`.

**Path in Supabase Dashboard:**
Authentication → URL Configuration → Site URL

**Set to:**
```
https://app.itmano.com
```

Save.

---

## Step 2 — Add Redirect URLs

Supabase only allows redirects to URLs on this allowlist. Both production and local dev
must be present.

**Path in Supabase Dashboard:**
Authentication → URL Configuration → Redirect URLs → Add URL

**Add these two entries:**
```
https://app.itmano.com/**
http://localhost:3000/**
```

The `/**` wildcard covers all sub-paths (e.g. `https://app.itmano.com/auth/callback?next=/dashboard`).

Save.

---

## Step 3 — Verify the change

1. Open an incognito window
2. Navigate to `https://app.itmano.com/login`
3. Enter `adrysofirealestate@gmail.com` (or your own email)
4. Click **Enviar enlace de acceso**
5. Check your inbox — the link in the email must contain `app.itmano.com`, not `localhost`
6. Click the link — should redirect to `https://app.itmano.com/dashboard`

If the link still points to `localhost`: the Site URL change did not save or is still
propagating. Wait 1 minute and retry.

---

## Step 4 — Re-run the user_profiles seed (if needed)

If either Adriana or Dylan had never logged in before the migration ran, their
`auth.users` row didn't exist and the seed skipped them. After their first Magic Link
login, re-run migration 012 via the Supabase MCP tool:

```sql
-- Verify state first
SELECT up.id, up.role, up.tenant_id, au.email
FROM user_profiles up
JOIN auth.users au ON au.id = up.id
ORDER BY au.email;
```

If a row is missing, re-apply `supabase/migrations/012_seed_user_profiles.sql`
using `mcp__supabase__apply_migration`. The `ON CONFLICT DO UPDATE` makes it safe.

---

## Rate limiting

### First line of defense — UI cooldown

The login form disables the send button for 60 seconds after each click. The button
shows a live countdown: "Reintentar en 59s...", "...58s...", etc. This prevents
accidental double-sends and casual abuse.

The cooldown is client-side only and resets on page refresh — this is intentional.
A refreshing attacker still hits the server-side limits below.

### Second line of defense — Supabase Auth server-side limits

Supabase Auth applies these limits by default (Free and Pro tiers):

| Limit | Value |
|---|---|
| OTP emails per hour per email address | 4 |
| OTP emails per hour per IP | 30 |

A user who refreshes and clicks repeatedly will get a Supabase error ("Email rate limit
exceeded") well before causing meaningful damage. The error surfaces in the login form
as a red message.

### If abuse becomes a real problem

Options in order of effort:

1. **Cloudflare Turnstile / hCaptcha** — invisible or low-friction challenge on the
   login form. Free tier available. No UX impact for legitimate users.
2. **Custom IP rate limiting in middleware** — count OTP requests per IP in a Redis
   or Supabase table, reject at the edge before hitting Supabase Auth.
3. **Supabase Pro upgrade** — unlocks configurable rate limits and auth logs with
   more granularity. Justified anyway at the second paying tenant.

None of these are needed now. Revisit if Adriana reports spam attempts.
