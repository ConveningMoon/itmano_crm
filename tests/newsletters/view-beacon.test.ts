import { describe, it, expect } from 'vitest'
import { parseViewPayload } from '@/app/api/newsletters/view/payload'

describe('parseViewPayload', () => {
  it('acepta un uuid de edición', () => {
    expect(parseViewPayload('{"editionId":"7f1c1e2a-0000-4000-8000-000000000001"}'))
      .toBe('7f1c1e2a-0000-4000-8000-000000000001')
  })

  it('rechaza cualquier otra cosa sin lanzar', () => {
    // El beacon no se puede reintentar: un payload roto se descarta en
    // silencio, nunca tumba el request.
    for (const malo of ['', 'no-json', '{}', '{"editionId":"x"}', '{"editionId":null}']) {
      expect(parseViewPayload(malo)).toBeNull()
    }
  })
})
