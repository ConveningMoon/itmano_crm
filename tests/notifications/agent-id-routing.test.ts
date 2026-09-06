import { describe, it, expect } from 'vitest'

// Pure routing logic: given a notification type, what agent_id does the
// notification receive? Lead-linked types carry the lead's agent_id.
// Administrative types (no lead) are always null → owner-only.

const LEAD_LINKED_TYPES = [
  'hot_lead',
  'contact_form_question',
  'event_submission',
  'contact_us',
  'email_replied',
  'lead_deleted',
]

const ADMIN_TYPES = ['event_added', 'event_deleted', 'lm_added', 'lm_deleted']

function notificationAgentId(
  type: string,
  leadAgentId: string | null,
): string | null {
  if (LEAD_LINKED_TYPES.includes(type)) return leadAgentId
  return null
}

describe('notification agent_id routing', () => {
  it('lead-linked types carry the lead agent_id', () => {
    for (const type of LEAD_LINKED_TYPES) {
      expect(notificationAgentId(type, 'agent-adriana')).toBe('agent-adriana')
    }
  })

  it('lead-linked types with null agent_id stay null', () => {
    expect(notificationAgentId('hot_lead', null)).toBeNull()
  })

  it('admin types always return null regardless of lead agent', () => {
    for (const type of ADMIN_TYPES) {
      expect(notificationAgentId(type, 'agent-adriana')).toBeNull()
    }
  })
})
