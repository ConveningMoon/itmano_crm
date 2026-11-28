import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tope de publicación por plan: createProperty/updateProperty consultan
// assertEntitlement(…,'publishProperty') sólo cuando la propiedad PASA a
// publicarse; Crear con IA consulta 'aiPropertyIntake' antes de llamar a la IA.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/subscriptions/entitlements-server', () => ({ assertEntitlement: vi.fn() }))
vi.mock('@/lib/services/ai-limit', () => ({ assertAiWithinLimit: vi.fn(async () => null) }))
vi.mock('@/lib/services/ai-usage', () => ({ recordAiUsage: vi.fn() }))
const anthropicCtor = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { anthropicCtor() } } }))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertEntitlement } from '@/lib/subscriptions/entitlements-server'
import { createProperty, updateProperty, type PropertyInput } from '@/app/(dashboard)/properties/actions'
import { generatePropertyFromPdf } from '@/app/(dashboard)/properties/ai-actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>
const mockAssert = assertEntitlement as unknown as ReturnType<typeof vi.fn>

const ESENCIAL_BLOCK = {
  ok: false,
  error: 'Tu plan Esencial no incluye propiedades en tu sitio web. Growth las incluye.',
}

function fakeDb(existing: Record<string, unknown> | null = null) {
  const inserts: unknown[] = []
  const q: Record<string, unknown> = {}
  Object.assign(q, {
    select: () => q, eq: () => q, update: () => q,
    maybeSingle: async () => ({ data: existing, error: null }),
    single: async () => ({ data: { id: 'new-1' }, error: null }),
    insert: (row: unknown) => { inserts.push(row); return q },
    then: (res: (v: unknown) => void) => res({ data: null, error: null }),
  })
  return { client: { from: () => q }, inserts }
}

const base = {
  address: '1 Main St', property_type: 'residential', published_to_web: true,
  name: 'Casa', slug: 'casa', neighborhood: 'Centro', state: 'VA',
  image_url: 'https://example.com/a.jpg',
  content_languages: ['es'], descriptions: { es: 'Descripción' },
} as unknown as PropertyInput

beforeEach(() => {
  mockCtx.mockReset(); mockAdmin.mockReset(); mockAssert.mockReset(); anthropicCtor.mockReset()
  mockCtx.mockResolvedValue({ role: 'agent_owner', tenant_id: 't1', user_id: 'u1' })
})

describe('publicar propiedades', () => {
  it('esencial no puede publicar y el mensaje ofrece Growth', async () => {
    const db = fakeDb()
    mockAdmin.mockReturnValue(db.client)
    mockAssert.mockResolvedValue(ESENCIAL_BLOCK)
    const res = await createProperty(base)
    expect(mockAssert).toHaveBeenCalledWith('t1', 'publishProperty', { isSuperAdmin: false })
    expect(res).toEqual(ESENCIAL_BLOCK)
    expect(res.ok === false && res.error).toMatch(/Growth/)
    expect(db.inserts).toHaveLength(0)
  })

  it('crear sin publicar no consulta el tope', async () => {
    mockAdmin.mockReturnValue(fakeDb().client)
    mockAssert.mockResolvedValue(ESENCIAL_BLOCK)
    await createProperty({ ...base, published_to_web: false })
    expect(mockAssert).not.toHaveBeenCalled()
  })

  it('editar una propiedad ya publicada nunca consulta el tope', async () => {
    mockAdmin.mockReturnValue(fakeDb({ tenant_id: 't1', created_by_user_id: 'u1', published_to_web: true }).client)
    mockAssert.mockResolvedValue(ESENCIAL_BLOCK)
    await updateProperty('p1', base)
    expect(mockAssert).not.toHaveBeenCalled()
  })

  it('pasar de no publicada a publicada sí consulta el tope y bloquea', async () => {
    mockAdmin.mockReturnValue(fakeDb({ tenant_id: 't1', created_by_user_id: 'u1', published_to_web: false }).client)
    mockAssert.mockResolvedValue(ESENCIAL_BLOCK)
    const res = await updateProperty('p1', base)
    expect(mockAssert).toHaveBeenCalledWith('t1', 'publishProperty', { isSuperAdmin: false })
    expect(res).toEqual(ESENCIAL_BLOCK)
  })
})

describe('Crear con IA', () => {
  it('crear con IA bloqueado en Esencial no llama a la IA', async () => {
    const blocked = { ok: false, error: 'Crear propiedades con IA desde un PDF está incluido desde el plan Growth.' }
    mockAssert.mockResolvedValue(blocked)
    process.env.ANTHROPIC_API_KEY = 'test'
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }))
    const res = await generatePropertyFromPdf(fd)
    expect(mockAssert).toHaveBeenCalledWith('t1', 'aiPropertyIntake')
    expect(res).toEqual(blocked)
    expect(anthropicCtor).not.toHaveBeenCalled()
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('sin tenant resoluble devuelve el error y no sigue (el gate no falla abierto)', async () => {
    mockCtx.mockResolvedValue({ role: 'super_admin', tenant_id: null, user_id: 'u1' })
    process.env.ANTHROPIC_API_KEY = 'test'
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }))
    const res = await generatePropertyFromPdf(fd)
    expect(res.ok).toBe(false)
    expect(mockAssert).not.toHaveBeenCalled()
    expect(anthropicCtor).not.toHaveBeenCalled()
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('hub de super_admin (sin tenant en contexto) no gatea contra un tenant arbitrario', async () => {
    mockCtx.mockResolvedValue({ role: 'super_admin', tenant_id: null, user_id: 'u1' })
    mockAssert.mockResolvedValue({ ok: false, error: 'bloqueado' })
    process.env.ANTHROPIC_API_KEY = 'test'
    const fd = new FormData()
    fd.set('tenant_id', 'primer-tenant-de-la-lista')
    fd.set('file', new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }))
    // Sigue hacia la IA (el doble no implementa el cliente): sólo importa el gate.
    await generatePropertyFromPdf(fd).catch(() => null)
    expect(mockAssert).not.toHaveBeenCalled()
  })

  it('super_admin actuando como tenant sí pasa por el gate de ese tenant', async () => {
    mockCtx.mockResolvedValue({ role: 'super_admin', tenant_id: 't9', user_id: 'u1' })
    const blocked = { ok: false, error: 'bloqueado' }
    mockAssert.mockResolvedValue(blocked)
    process.env.ANTHROPIC_API_KEY = 'test'
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }))
    expect(await generatePropertyFromPdf(fd)).toEqual(blocked)
    expect(mockAssert).toHaveBeenCalledWith('t9', 'aiPropertyIntake')
  })
})
