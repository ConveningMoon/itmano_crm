import 'server-only'
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set')
}

// Send-only client — restricted key scoped to outbound sends.
export const resend = new Resend(process.env.RESEND_API_KEY)

// Read client for inbound/receiving API (requires a key with read permissions).
// Set RESEND_INBOUND_API_KEY in Vercel to a full-access key; falls back to the
// send key so the code compiles, but receiving.get() will 401 until configured.
export const resendInbound = new Resend(
  process.env.RESEND_INBOUND_API_KEY ?? process.env.RESEND_API_KEY
)
