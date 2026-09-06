import { describe, it, expect } from 'vitest'

// ─── Pure guard logic extracted for unit testing ──────────────────────────────
// These functions mirror the decision logic in the email-blocking guards
// without importing server-only modules (which require DB / Resend at import
// time). The same pattern as tests/purchase-emails/purchase-email-logic.test.ts.

// mirrors: processSequenceRun / sendSequenceEmail — "should we skip this send?"
function shouldBlockSequenceEmail(emailBlocked: boolean): boolean {
  return emailBlocked === true
}

// mirrors: sendPurchaseEmail — only hard_bounce blocks transactional emails
function shouldBlockPurchaseEmail(
  emailBlocked: boolean,
  reason: string | null,
): boolean {
  return emailBlocked === true && reason === 'hard_bounce'
}

// mirrors: cancel reason string built in processSequenceRun
function blockedCancelReason(emailBlockedReason: string | null): string {
  return `email_blocked_${emailBlockedReason ?? 'email_blocked'}`
}

// mirrors: bulk enrollment filter in addLeadsToSequence
function partitionByBlock(
  leadIds:    string[],
  blockedSet: Set<string>,
): { toEnroll: string[]; blocked: string[] } {
  return {
    toEnroll: leadIds.filter(id => !blockedSet.has(id)),
    blocked:  leadIds.filter(id =>  blockedSet.has(id)),
  }
}

// ─── shouldBlockSequenceEmail ─────────────────────────────────────────────────

describe('shouldBlockSequenceEmail — sequence send / enrollment guard', () => {
  it('blocks when email_blocked is true', () => {
    expect(shouldBlockSequenceEmail(true)).toBe(true)
  })

  it('allows when email_blocked is false', () => {
    expect(shouldBlockSequenceEmail(false)).toBe(false)
  })
})

// ─── shouldBlockPurchaseEmail ─────────────────────────────────────────────────

describe('shouldBlockPurchaseEmail — transactional email guard', () => {
  it('blocks for hard_bounce: the address does not exist', () => {
    expect(shouldBlockPurchaseEmail(true, 'hard_bounce')).toBe(true)
  })

  it('does NOT block for unsubscribed: purchase emails are transactional', () => {
    expect(shouldBlockPurchaseEmail(true, 'unsubscribed')).toBe(false)
  })

  it('does NOT block for spam_complaint: lead is already lost upstream', () => {
    expect(shouldBlockPurchaseEmail(true, 'spam_complaint')).toBe(false)
  })

  it('does NOT block when email_blocked is false regardless of reason', () => {
    expect(shouldBlockPurchaseEmail(false, 'hard_bounce')).toBe(false)
    expect(shouldBlockPurchaseEmail(false, null)).toBe(false)
  })
})

// ─── blockedCancelReason ──────────────────────────────────────────────────────

describe('blockedCancelReason — cancelled_reason value written to lead_sequence_runs', () => {
  it('formats unsubscribed correctly', () => {
    expect(blockedCancelReason('unsubscribed')).toBe('email_blocked_unsubscribed')
  })

  it('formats hard_bounce correctly', () => {
    expect(blockedCancelReason('hard_bounce')).toBe('email_blocked_hard_bounce')
  })

  it('formats spam_complaint correctly', () => {
    expect(blockedCancelReason('spam_complaint')).toBe('email_blocked_spam_complaint')
  })

  it('falls back safely when reason is null', () => {
    expect(blockedCancelReason(null)).toBe('email_blocked_email_blocked')
  })
})

// ─── partitionByBlock ─────────────────────────────────────────────────────────

describe('partitionByBlock — bulk enrollment skips blocked leads', () => {
  it('separates blocked from enrollable leads', () => {
    const blocked = new Set(['lead-b', 'lead-d'])
    const { toEnroll, blocked: out } = partitionByBlock(
      ['lead-a', 'lead-b', 'lead-c', 'lead-d'],
      blocked,
    )
    expect(toEnroll).toEqual(['lead-a', 'lead-c'])
    expect(out).toEqual(['lead-b', 'lead-d'])
  })

  it('enrolls all when no leads are blocked', () => {
    const { toEnroll, blocked } = partitionByBlock(['lead-a', 'lead-b'], new Set())
    expect(toEnroll).toEqual(['lead-a', 'lead-b'])
    expect(blocked).toHaveLength(0)
  })

  it('enrolls none when all leads are blocked', () => {
    const blocked = new Set(['lead-a', 'lead-b'])
    const { toEnroll, blocked: out } = partitionByBlock(['lead-a', 'lead-b'], blocked)
    expect(toEnroll).toHaveLength(0)
    expect(out).toEqual(['lead-a', 'lead-b'])
  })

  it('handles an empty leadIds array', () => {
    const { toEnroll, blocked } = partitionByBlock([], new Set(['lead-x']))
    expect(toEnroll).toHaveLength(0)
    expect(blocked).toHaveLength(0)
  })
})
