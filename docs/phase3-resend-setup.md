# Phase 3 — Resend Setup: Manual Steps

These are the one-time manual steps required before the Resend integration goes live.
Code changes are in PR `phase3/resend-setup`. These steps must be completed before
the PR is merged and before running the smoke test.

---

## Step 1 — Verify the sending domain in Resend

1. Open [Resend Dashboard → Domains](https://resend.com/domains)
2. Click **Add Domain**
3. Enter `mail.ajrealestateva.com`
4. Resend will show DNS records (MX, TXT, DKIM). Add them to the DNS provider for
   `ajrealestateva.com` (wherever A&J manages their domain — GoDaddy, Namecheap, etc.)
5. Click **Verify** once the records propagate (can take 5–30 min)
6. Status must show **Verified** before any send goes out

> The smoke test `from` address is `test@mail.ajrealestateva.com`. Sends will fail
> with a 403 if the domain is not verified.

---

## Step 2 — Add the API key to Vercel

1. Open [Resend Dashboard → API Keys](https://resend.com/api-keys)
2. The key in `.env.local` is already generated. Copy it.
3. In Vercel → Project → Settings → Environment Variables, add:
   - **Name:** `RESEND_API_KEY`
   - **Value:** the `re_xxx` key
   - **Environments:** Production, Preview, Development

---

## Step 3 — Register the webhook endpoint in Resend

1. Open [Resend Dashboard → Webhooks](https://resend.com/webhooks)
2. Click **Add Endpoint**
3. **Endpoint URL:** `https://app.itmano.com/api/webhooks/resend`
4. Subscribe to these events:
   - `email.sent`
   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.bounced`
   - `email.complained`
   - `email.failed`
   - `email.suppressed`
   - `email.received`
5. Save

> **Note:** `email.unsubscribed` does NOT exist for transactional emails in Resend
> (it only fires for Audience-based campaigns). Do not subscribe to it — it will
> never fire for our sends.

---

## Step 4 — Copy the webhook signing secret to Vercel

1. On the webhook detail page, click **Signing Secret** → **Reveal**
2. Copy the value (starts with `whsec_`)
3. Add it to `.env.local`:
   ```
   RESEND_WEBHOOK_SECRET=whsec_xxx
   ```
4. In Vercel → Project → Settings → Environment Variables, add:
   - **Name:** `RESEND_WEBHOOK_SECRET`
   - **Value:** the `whsec_xxx` value
   - **Environments:** Production, Preview, Development

---

## Step 5 — Smoke test: verify sends — completed

The original one-use public endpoint was removed after the provider was
verified. If delivery must be tested again, use Resend's dashboard or a local
script with an explicitly approved recipient. Do not expose `CRON_SECRET` to a
general-purpose send endpoint.

---

## Step 6 — Smoke test: verify webhook signature

1. In Resend Dashboard → Webhooks → your endpoint → **Send test event**
2. Choose any event type (e.g. `email.delivered`)
3. Check Vercel logs (`vercel logs --follow` or Vercel Dashboard → Functions):
   - You should see `[resend-webhook] received event: { ... }` logged
   - HTTP status must be `200`
4. If you get `401`: the `RESEND_WEBHOOK_SECRET` in Vercel doesn't match the one
   Resend shows on the webhook detail page. Re-copy and redeploy.

---

## Step 7 — Delete the test endpoint — completed

The smoke-test endpoint was removed after verification. Do not recreate a
public route that accepts arbitrary recipients or HTML. For future provider
diagnostics, use a local script or a deliberately constrained admin tool with
an allowlist, audit trail, and rate limiting.

---

## Note — Unsubscribe handling (future PR)

`email.unsubscribed` does not exist for transactional email in Resend. Unsubscribe
must be handled via a one-click link in each email template that calls our own endpoint:

```
GET /api/unsubscribe?lead=<lead_id>&token=<hmac_token>
```

- The `token` is an HMAC-SHA256 of `lead_id` signed with a `UNSUBSCRIBE_SECRET` env var.
- The template variable `{{ unsubscribe_url }}` is injected at send time by the
  sequence orchestrator (it knows the `lead_id`).
- The endpoint verifies the token, cancels active sequence runs
  (`cancelled_reason = 'unsubscribed'`), writes an `email.unsubscribed` event to
  `lead_events` (triggering the −50 scoring rule), and renders a confirmation page.

This endpoint is implemented in a future Phase 3 PR, not in `phase3/resend-setup`.

---

## Environment variable summary

| Variable | Where to get it | Vercel env |
|---|---|---|
| `RESEND_API_KEY` | Resend → API Keys | ✅ add |
| `RESEND_WEBHOOK_SECRET` | Resend → Webhooks → Signing Secret | ✅ add |
| `CRON_SECRET` | Already in `.env.local` | ✅ already set (Phase 2) |
