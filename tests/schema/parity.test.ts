import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readdirSync } from 'node:fs'
import path from 'node:path'

// Node < 22 no trae WebSocket global y createClient lo exige al construirse.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket

// Paridad entre el repo y las bases, y entre las bases entre si.
//
// Esta sesion encontro tres derivas distintas y ninguna dio la cara sola: la 065
// aplicada en produccion sin dejar archivo, `lead_magnets` viva solo en el
// sandbox, y refresh_quality_bands rota durante semanas porque el cron loguea el
// error y sigue. El patron comun es que una base y el repo se separan en
// silencio. Esto lo convierte en un test.
//
// Dos comprobaciones:
//   1. Todo lo aplicado tiene archivo en supabase/migrations/. Corre siempre.
//   2. Sandbox y produccion tienen el mismo esquema. Solo si se dan las
//      credenciales del segundo proyecto (PARITY_*); si no, se salta.

const URL_A = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY_A = process.env.SUPABASE_SERVICE_ROLE_KEY
const URL_B = process.env.PARITY_SUPABASE_URL
const KEY_B = process.env.PARITY_SUPABASE_SERVICE_ROLE_KEY

interface Snapshot {
  migraciones: { version: string; name: string }[]
  tablas:      Record<string, string>
  policies:    Record<string, string>
  funciones:   Record<string, string>
}

function ref(url: string): string {
  return new URL(url).hostname.split('.')[0]
}

async function snapshot(url: string, key: string): Promise<Snapshot> {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
  const { data, error } = await client.rpc('schema_snapshot')
  if (error) {
    throw new Error(
      `schema_snapshot() falló en ${ref(url)}: ${error.message}. ` +
      '¿Está aplicada la migración 100 en ese proyecto?'
    )
  }
  return data as unknown as Snapshot
}

/** Slug de una migración: sin prefijo numérico y sin extensión. */
function slug(nombre: string): string {
  return nombre.replace(/\.sql$/, '').replace(/^\d+_/, '')
}

function slugsDelRepo(): Set<string> {
  const dir = path.resolve(__dirname, '../../supabase/migrations')
  return new Set(readdirSync(dir).filter(f => f.endsWith('.sql')).map(slug))
}

// Migraciones aplicadas cuyo SQL vive en el repo bajo otro archivo. No son fugas:
// se comprobó una por una que su efecto está cubierto.
const APLICADAS_SIN_ARCHIVO_PROPIO: Record<string, string> = {
  response_time_excludes_manual:      'consolidada dentro de 084_response_time_stats.sql',
  status_default_for_stage_bridge:    'consolidada dentro de 082_stage_column.sql',
  add_email_replied_notification_type:'mismo SQL que 037_notification_type_email_replied.sql',
  // Esas tres sólo están registradas en producción. Con CI apuntando al sandbox
  // no llegan a evaluarse, pero NO son código muerto: vuelven a hacer falta en
  // cuanto URL_A apunte a producción. Verificado contra las dos bases el 2026-09-03.

  // Las de feat/agent-api (lead_sequence_runs y agent_api) se retiraron el
  // 2026-09-03: sus archivos ya están en main (006 y 103), así que la excepción
  // no llegaba a evaluarse y el comentario afirmaba lo contrario de lo que pasa.

  // La de la 111 (newsletter_autor_y_seo) se retiró en este merge: su archivo
  // entra al repo con esta misma rama, así que la excepción dejaba de evaluarse
  // y el test vuelve a vigilar esa migración de verdad.
}

// Objetos que están en un proyecto y no en el otro. La causa puede ser una rama
// sin mergear, o una migración ya mergeada que sólo se aplicó a uno de los dos.
// Vaciar la entrada al aplicarla a ambos.
const SOLO_EN_UN_PROYECTO: Record<string, string> = {
  // Las nueve excepciones de la 103 (agent_api) se retiraron el 2026-09-03: la
  // migración ya está aplicada a los DOS proyectos, así que el test vuelve a
  // vigilar esas tablas, esa policy y esas funciones de verdad.

  // Las excepciones de feat/newsletters (105, 106 y 107) se retiraron el
  // 2026-08-25: las tres migraciones están aplicadas a los DOS proyectos, así
  // que ya no hay nada que excusar y el test vuelve a vigilarlas de verdad.

  // La excepción de la 109 (caché del dossier) se retiró el 2026-08-26: está
  // aplicada a los DOS proyectos, así que el test vuelve a vigilarla de verdad.

  // La excepción de la 110 (newsletters sin series) se retiró el 2026-08-31:
  // está aplicada a los DOS proyectos, así que el test vuelve a vigilar esas
  // dos tablas de verdad.

  // La excepción de la 111 (autor y SEO) se retiró el 2026-09-03: está
  // aplicada a los DOS proyectos, así que el test vuelve a vigilar esas dos
  // tablas de verdad.

  // Las ocho excepciones de la 112 (drop del motor de carruseles) se retiraron el
  // 2026-09-03: la migración está aplicada a los DOS proyectos, así que ya no hay
  // nada que excusar y el test vuelve a vigilar esas tablas de verdad.
}

// Divergencias reales pendientes de cerrar. Vacía a propósito: si algo entra
// aquí, es deuda, no una excepción permanente. Se cierran aplicando a producción
// la versión del repo (la que corre en el sandbox).
//
// Las tres que había —una tilde en el texto de notificación de
// recompute_lead_score y dos helpers de test de la 008— se alinearon en
// producción en vez de declararlas.
const DIVERGENCIAS_PENDIENTES: Record<string, string> = {}

const IGNORADAS = { ...SOLO_EN_UN_PROYECTO, ...DIVERGENCIAS_PENDIENTES }

describe('paridad: lo aplicado en la base está en el repo', () => {
  it('ninguna migración aplicada se quedó sin archivo', async () => {
    if (!URL_A || !KEY_A) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

    const snap    = await snapshot(URL_A, KEY_A)
    const enRepo  = slugsDelRepo()

    const huerfanas = snap.migraciones
      .map(m => slug(m.name))
      .filter(s => !enRepo.has(s) && !(s in APLICADAS_SIN_ARCHIVO_PROPIO))

    // Un fallo aquí significa que alguien aplicó SQL a la base sin dejar el
    // archivo: el repo ya no puede reconstruir el esquema. Recupéralo con
    // `select statements from supabase_migrations.schema_migrations where name = '...'`.
    expect(
      [...new Set(huerfanas)],
      `Migraciones aplicadas en ${ref(URL_A)} sin archivo en supabase/migrations/`
    ).toEqual([])
  })
})

const hayDosProyectos = Boolean(URL_A && KEY_A && URL_B && KEY_B)

describe.skipIf(!hayDosProyectos)('paridad: sandbox y producción tienen el mismo esquema', () => {
  async function ambos() {
    const [a, b] = await Promise.all([
      snapshot(URL_A!, KEY_A!),
      snapshot(URL_B!, KEY_B!),
    ])
    return { a, b, refA: ref(URL_A!), refB: ref(URL_B!) }
  }

  /** Claves cuya huella difiere, o que existen sólo en uno de los dos. */
  function divergencias(
    tipo: string,
    a: Record<string, string>,
    b: Record<string, string>,
  ): string[] {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...claves]
      .filter(k => a[k] !== b[k])
      .map(k => `${tipo}:${k}`)
      .filter(k => !(k in IGNORADAS))
      .sort()
  }

  it('las tablas y sus columnas coinciden', async () => {
    const { a, b, refA, refB } = await ambos()
    expect(
      divergencias('tabla', a.tablas, b.tablas),
      `Columnas distintas entre ${refA} y ${refB}`
    ).toEqual([])
  })

  it('las policies de RLS coinciden', async () => {
    const { a, b, refA, refB } = await ambos()
    // Lo más caro de que se separe: una policy que protege en un proyecto y en
    // el otro no, sin que ningún test lo note.
    expect(
      divergencias('policy', a.policies, b.policies),
      `Policies distintas entre ${refA} y ${refB}`
    ).toEqual([])
  })

  it('las funciones coinciden', async () => {
    const { a, b, refA, refB } = await ambos()
    expect(
      divergencias('funcion', a.funciones, b.funciones),
      `Funciones distintas entre ${refA} y ${refB}`
    ).toEqual([])
  })
})
