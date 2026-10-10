import { describe, it, expect, vi, beforeEach } from 'vitest'

// Cliente de Supabase falso: cada consulta registra cuándo empieza y cuándo
// termina, para comprobar que perfil y fila de agente salen en la misma ola.
type Fila = Record<string, unknown> | null
const estado: {
  perfil: Fila
  agente: Fila
  eventos: string[]
} = { perfil: null, agente: null, eventos: [] }

function consulta(tabla: string, fila: () => Fila) {
  estado.eventos.push(`inicio:${tabla}`)
  return new Promise(resolve => {
    setTimeout(() => {
      estado.eventos.push(`fin:${tabla}`)
      const data = fila()
      resolve({ data, error: data ? null : { message: 'sin filas' } })
    }, 5)
  })
}

function builder(tabla: string) {
  const fila = () => (tabla === 'user_profiles' ? estado.perfil : estado.agente)
  const b = {
    select: () => b,
    eq: () => b,
    single: () => consulta(tabla, fila),
    // maybeSingle no da error con cero filas.
    maybeSingle: () => consulta(tabla, fila).then(r => ({ ...(r as object), error: null })),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: 'u-1', email: 'u1@example.com' } }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (tabla: string) => builder(tabla),
  }),
}))

const seleccionado = vi.fn()
vi.mock('@/lib/auth/admin-tenant', () => ({ getSelectedTenant: () => seleccionado() }))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) },
}))

const { getCurrentTenantContext } = await import('@/lib/auth/tenant-context')

beforeEach(() => {
  estado.perfil = null
  estado.agente = null
  estado.eventos = []
  seleccionado.mockResolvedValue(null)
})

describe('getCurrentTenantContext', () => {
  it('agent: perfil y fila de agente salen en la misma ola', async () => {
    estado.perfil = { tenant_id: 't-a', role: 'agent' }
    estado.agente = { id: 'ag-1', tenant_id: 't-a' }

    const ctx = await getCurrentTenantContext()

    expect(ctx).toMatchObject({ role: 'agent', tenant_id: 't-a', agent_id: 'ag-1', acting_as_tenant: false })
    // La consulta de agentes arranca antes de que termine la del perfil.
    expect(estado.eventos.indexOf('inicio:agents')).toBeLessThan(estado.eventos.indexOf('fin:user_profiles'))
  })

  it('agent cuya fila es de otro tenant: provisión inválida, como antes', async () => {
    estado.perfil = { tenant_id: 't-a', role: 'agent' }
    estado.agente = { id: 'ag-1', tenant_id: 't-b' }
    await expect(getCurrentTenantContext()).rejects.toThrow(/no linked agents row/)
  })

  it('agent sin fila de agente: provisión inválida', async () => {
    estado.perfil = { tenant_id: 't-a', role: 'agent' }
    await expect(getCurrentTenantContext()).rejects.toThrow(/no linked agents row/)
  })

  it('agent_owner: agent_id null aunque exista una fila con su uid', async () => {
    estado.perfil = { tenant_id: 't-a', role: 'agent_owner' }
    estado.agente = { id: 'ag-owner', tenant_id: 't-a' }
    const ctx = await getCurrentTenantContext()
    expect(ctx).toMatchObject({ role: 'agent_owner', tenant_id: 't-a', agent_id: null })
  })

  it('super_admin con tenant seleccionado actúa como ese tenant', async () => {
    estado.perfil = { tenant_id: null, role: 'super_admin' }
    seleccionado.mockResolvedValue({ id: 't-sel', name: 'Sel' })
    const ctx = await getCurrentTenantContext()
    expect(ctx).toMatchObject({ role: 'super_admin', tenant_id: 't-sel', agent_id: null, acting_as_tenant: true })
  })

  it('sin perfil: vuelve al login', async () => {
    await expect(getCurrentTenantContext()).rejects.toThrow('REDIRECT /login?error=sin-acceso')
  })
})
