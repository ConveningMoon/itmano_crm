import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Node < 22 no trae WebSocket global y createClient lo exige al construirse.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket

// Grants explícitos en `public`.
//
// Desde el 2026-10-30 Supabase deja de conceder privilegios por defecto a las
// tablas y secuencias nuevas de `public`. Una tabla creada sin GRANT no existe
// para la Data API, ni siquiera para service_role: el admin client recibe
// "permission denied" y el fallo sólo aparece en la ruta que la consulta.
// Este test lo convierte en un fallo de CI en el mismo PR que crea la tabla.
//
// La regla vive en docs/agents/environments.md (Migraciones): toda tabla o
// secuencia nueva de `public` lleva sus GRANT en la misma migración que su RLS.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type Rol = 'anon' | 'authenticated' | 'service_role'

interface ObjetoConGrants {
  nombre:      string
  tipo:        'tabla' | 'secuencia'
  rls:         boolean
  tabla_duena: string | null
  es_identity: boolean
  privilegios: Record<Rol, string[]>
}

const CRUD = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']

// Tablas a las que `authenticated` no debe poder ni leer: sólo las toca el
// servidor con service_role. Vacía hoy; una entrada aquí documenta una decisión,
// no tapa un olvido.
const SOLO_SERVICE_ROLE: Record<string, string> = {}

// Tablas de `public` sin RLS. Vacía a propósito: AGENTS.md exige RLS en toda
// tabla de datos de aplicación.
const SIN_RLS: Record<string, string> = {}

/** Lista legible de lo que falta. Vacía si todo está en orden. */
function faltantes(objetos: ObjetoConGrants[]): string[] {
  const tablas = new Map(objetos.filter(o => o.tipo === 'tabla').map(o => [o.nombre, o]))
  const errores: string[] = []

  for (const t of tablas.values()) {
    if (!t.rls && !(t.nombre in SIN_RLS)) errores.push(`${t.nombre}: sin RLS`)

    const sr = CRUD.filter(p => !t.privilegios.service_role.includes(p))
    if (sr.length) errores.push(`${t.nombre}: service_role sin ${sr.join(', ')}`)

    if (!(t.nombre in SOLO_SERVICE_ROLE) && !t.privilegios.authenticated.includes('SELECT')) {
      errores.push(`${t.nombre}: authenticated sin SELECT`)
    }
  }

  for (const s of objetos.filter(o => o.tipo === 'secuencia')) {
    // Una columna identity no exige USAGE sobre su secuencia: basta el INSERT
    // sobre la tabla. Un serial o un nextval() explícito sí.
    if (s.es_identity) continue

    const duena = s.tabla_duena ? tablas.get(s.tabla_duena) : undefined
    const roles: Rol[] = duena
      ? (['authenticated', 'service_role'] as const).filter(r => duena.privilegios[r].includes('INSERT'))
      : ['service_role']

    for (const rol of roles) {
      if (!s.privilegios[rol].includes('USAGE')) {
        errores.push(`${s.nombre}: ${rol} sin USAGE${duena ? ` (inserta en ${duena.nombre})` : ''}`)
      }
    }
  }

  return errores.sort()
}

function tabla(nombre: string, privilegios: Partial<Record<Rol, string[]>>, rls = true): ObjetoConGrants {
  return {
    nombre, tipo: 'tabla', rls, tabla_duena: null, es_identity: false,
    privilegios: { anon: [], authenticated: [], service_role: [], ...privilegios },
  }
}

describe('grants: el verificador detecta una tabla sin GRANT', () => {
  it('una tabla creada después del 2026-10-30 sin GRANT falla para los dos roles', () => {
    expect(faltantes([tabla('nueva', {})])).toEqual([
      'nueva: authenticated sin SELECT',
      'nueva: service_role sin SELECT, INSERT, UPDATE, DELETE',
    ])
  })

  it('el patrón de 116_lead_tags (authenticated sin UPDATE) es válido', () => {
    expect(faltantes([
      tabla('lead_tag_assignments', { authenticated: ['DELETE', 'INSERT', 'SELECT'], service_role: CRUD }),
    ])).toEqual([])
  })

  it('una tabla sin RLS falla aunque tenga grants', () => {
    expect(faltantes([tabla('abierta', { authenticated: CRUD, service_role: CRUD }, false)]))
      .toEqual(['abierta: sin RLS'])
  })

  it('un serial exige USAGE a cada rol que inserta en su tabla; un identity no', () => {
    const t = tabla('con_serial', { authenticated: CRUD, service_role: CRUD })
    const secuencia = (es_identity: boolean): ObjetoConGrants => ({
      nombre: 'con_serial_id_seq', tipo: 'secuencia', rls: false, tabla_duena: 'con_serial', es_identity,
      privilegios: { anon: [], authenticated: [], service_role: ['USAGE'] },
    })
    expect(faltantes([t, secuencia(false)]))
      .toEqual(['con_serial_id_seq: authenticated sin USAGE (inserta en con_serial)'])
    expect(faltantes([t, secuencia(true)])).toEqual([])
  })
})

describe.skipIf(!URL || !KEY)('grants: las tablas de public tienen sus GRANT', () => {
  it('service_role y authenticated pueden usar cada tabla y secuencia de public', async () => {
    const client = createClient(URL!, KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: ws },
    })
    const { data, error } = await client.rpc('table_grants_snapshot')
    if (error) {
      throw new Error(
        `table_grants_snapshot() falló: ${error.message}. ` +
        '¿Está aplicada la migración 20261011055823_table_grants_snapshot en ese proyecto?'
      )
    }

    const objetos = data as unknown as ObjetoConGrants[]
    expect(objetos.length, 'table_grants_snapshot() no devolvió tablas').toBeGreaterThan(0)

    // Un fallo aquí casi siempre es una migración nueva sin sus GRANT. Añádelos
    // en una migración correctiva, junto a `enable row level security`:
    //   grant select, insert, update, delete on public.<tabla> to authenticated;
    //   grant select, insert, update, delete on public.<tabla> to service_role;
    expect(faltantes(objetos), 'Tablas o secuencias de public sin los GRANT esperados').toEqual([])
  })
})
