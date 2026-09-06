#!/usr/bin/env node
/**
 * Siembra el tenant demo de la superficie /agent/v1.
 *
 *   node scripts/seed-agent-demo.mjs
 *
 * Idempotente: todos los ids son deterministas y se hace upsert, así que
 * resembrar no duplica nada. Los datos son 100% sintéticos y todos los correos
 * van a @example.com, que es un dominio reservado que no acepta correo.
 *
 * Dos cierres de seguridad, ambos ANTES de escribir nada:
 *   1. Aborta si el proyecto destino es el de producción.
 *   2. Aborta si el tenant destino no es el demo.
 */
import { config as dotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

for (const archivo of ['.env.test.local', '.env.development.local', '.env.local']) {
  dotenv({ path: archivo })
}

const PRODUCCION = 'kvmjlrvlnhiarrqxulkr'
const TENANT     = 'tenant-conduit-demo'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SVC) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
if (ref === PRODUCCION) {
  console.error(`ABORTADO: ${ref} es el proyecto de PRODUCCIÓN. Este seed sólo corre en sandbox.`)
  process.exit(1)
}

console.log(`Sembrando ${TENANT} en el proyecto ${ref}\n`)

const db = createClient(SUPABASE_URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

// ── Generador determinista ────────────────────────────────────────────────────
// Sin aleatoriedad real: dos ejecuciones producen exactamente los mismos datos,
// que es lo que permite comparar el export JSON entre corridas.
let semilla = 20260812
const rnd = () => {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
  return semilla / 0x7fffffff
}
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const elegir = (xs) => xs[entre(0, xs.length - 1)]

const HOY = new Date('2026-08-12T00:00:00Z')
function haceDias(dias, horaBase) {
  const d = new Date(HOY)
  d.setUTCDate(d.getUTCDate() - dias)
  d.setUTCHours(horaBase, entre(0, 59), entre(0, 59), 0)
  return d.toISOString()
}

// ── Datos sintéticos ──────────────────────────────────────────────────────────

const NOMBRES = [
  'Camila', 'Mateo', 'Valentina', 'Sebastián', 'Isabella', 'Tomás', 'Renata', 'Emilio',
  'Julieta', 'Bruno', 'Antonella', 'Joaquín', 'Martina', 'Facundo', 'Regina', 'Álvaro',
  'Paloma', 'Nicolás', 'Sofía', 'Gael', 'Ximena', 'Iker', 'Lucía', 'Thiago',
  'Amaya', 'Dante', 'Catalina', 'Rodrigo', 'Elena', 'Marco',
]
const APELLIDOS = [
  'Arriaga', 'Bermúdez', 'Cifuentes', 'Del Valle', 'Escalante', 'Fonseca', 'Gallardo',
  'Herrera', 'Iriarte', 'Jaramillo', 'Kuroda', 'Lozano', 'Mendieta', 'Narváez',
  "O'Farrell", 'Peñalosa', 'Quiroga', 'Rivadeneira', 'Solórzano', 'Tejeda',
]

const AGENTES = [
  { id: 'demo-agent-01', name: 'Renata Solís',    email: 'renata.solis@example.com',    ini: 'RS', color: '#2F6F4E' },
  { id: 'demo-agent-02', name: 'Óscar Villalba',  email: 'oscar.villalba@example.com',  ini: 'OV', color: '#8A5A2B' },
  { id: 'demo-agent-03', name: 'Nadia Contreras', email: 'nadia.contreras@example.com', ini: 'NC', color: '#3B5B8C' },
  { id: 'demo-agent-04', name: 'Hugo Bastida',    email: 'hugo.bastida@example.com',    ini: 'HB', color: '#7A3B5C' },
  { id: 'demo-agent-05', name: 'Ivette Maldonado', email: 'ivette.maldonado@example.com', ini: 'IM', color: '#4A6B2F' },
]

const CANALES = [
  { slug: 'guia-compradores',    name: 'Guía para compradores',    tipo: 'lead_magnet' },
  { slug: 'valoracion-vivienda', name: 'Valoración de vivienda',   tipo: 'lead_magnet' },
  { slug: 'jornada-puertas',     name: 'Jornada de puertas abiertas', tipo: 'event' },
  { slug: 'contacto-web',        name: 'Contacto desde la web',    tipo: 'contact_form' },
  { slug: 'referidos',           name: 'Programa de referidos',    tipo: 'lead_magnet' },
  { slug: 'seminario-inversion', name: 'Seminario de inversión',   tipo: 'event' },
]

const CIUDADES = ['Norfolk', 'Virginia Beach', 'Chesapeake', 'Suffolk', 'Hampton', 'Portsmouth']
const CALLES   = ['Bayberry', 'Ravenwood', 'Colonial', 'Ashmont', 'Windmere', 'Kingsley', 'Larchmont']

const ETAPAS = ['nuevo', 'nutricion', 'en_proceso', 'cerrado', 'perdido']

// 60 etapas repartidas a mano. 16 + 12 = 28 candidatos a proceso de compra:
// suficientes para 25 procesos y dejar cerrados sin proceso.
const PLAN_ETAPAS = [
  ...Array(12).fill('nuevo'),
  ...Array(14).fill('nutricion'),
  ...Array(16).fill('en_proceso'),
  ...Array(12).fill('cerrado'),
  ...Array(6).fill('perdido'),
]

// Eventos que sí puntúan, según lead_score_rules.
const EVENTOS_POSITIVOS = [
  { type: 'form_baseline',       desc: 'Primer formulario completado' },
  { type: 'email_clicked',       desc: 'Clic en un email de la secuencia' },
  { type: 'email_replied',       desc: 'Respondió a un email' },
  { type: 'contact_us_question', desc: 'Pregunta desde el formulario de contacto' },
  { type: 'event_submission',    desc: 'Inscripción a un evento' },
  { type: 'second_lm',           desc: '2º lead magnet descargado' },
  { type: 'visit_attended',      desc: 'Asistió a la visita' },
  { type: 'proposal_sent',       desc: 'Propuesta enviada' },
]

function perfilFit(i) {
  const comprador = i % 3 !== 0
  return comprador
    ? {
        timeline:     elegir(['under_3_months', '3_6_months', '6_12_months', 'over_12_explorando']),
        financing:    elegir(['cash', 'preapproved', 'in_process', 'not_started']),
        budget_tier:  elegir(['premium', 'mid', 'entry']),
        agent_status: elegir(['sin_agente', 'con_agente']),
        geo_fit:      elegir(['zona_principal', 'zona_secundaria']),
      }
    : {
        sell_motivation: elegir(['alta', 'media', 'baja']),
        timeline:        elegir(['under_3_months', '3_6_months', '6_12_months']),
        listing_status:  elegir(['no_listado_sin_agente', 'ya_listado_con_agente']),
        geo_fit:         elegir(['zona_principal', 'zona_secundaria']),
      }
}

// ── Escritura ─────────────────────────────────────────────────────────────────

async function paso(nombre, fn) {
  const { error } = await fn()
  if (error) {
    console.error(`  ✗ ${nombre}: ${error.message}`)
    process.exit(1)
  }
  console.log(`  ✓ ${nombre}`)
}

// 1. Tenant
await paso('tenant', () => db.from('tenants').upsert({
  id: TENANT,
  name: 'Costa Verde Realty',
  slug: 'costa-verde-realty',
  currency: 'USD',
  primary_color: '#2F6F4E',
  description: 'Agencia inmobiliaria sintética para demostraciones. No corresponde a ningún negocio real.',
  // Apagado a propósito: POST /leads no debe llamar a Claude ni costar dinero.
  ai_lead_scoring_enabled: false,
  budget_entry_max: 250000,
  budget_premium_min: 600000,
  primary_areas: ['Norfolk', 'Virginia Beach'],
  secondary_areas: ['Chesapeake', 'Suffolk'],
}, { onConflict: 'id' }))

// 2. Agentes
await paso('5 agentes', () => db.from('agents').upsert(
  AGENTES.map(a => ({
    id: a.id, tenant_id: TENANT, name: a.name, email: a.email,
    language: 'es', languages: ['es', 'en'],
    avatar_initials: a.ini, accent_color: a.color, active: true,
  })), { onConflict: 'id' }))

// 3. Canales — todos SIN secuencia enganchada: capa 2 de las garantías de no-envío.
await paso('6 canales sin secuencia', () => db.from('acquisition_channels').upsert(
  CANALES.map((c, i) => ({
    tenant_id: TENANT,
    // El formato está fijado por check: ^chn_[a-z0-9]{12}$
    public_id: `chn_demo${String(i + 1).padStart(8, '0')}`,
    channel_type: c.tipo, name: c.name, slug: c.slug,
    active: true, email_sequence_id: null,
    agent_id: AGENTES[i % AGENTES.length].id,
  })), { onConflict: 'public_id' }))

// 4. Propiedades
await paso('10 propiedades', () => db.from('properties').upsert(
  Array.from({ length: 10 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    tenant_id: TENANT,
    address: `${entre(100, 9800)} ${elegir(CALLES)} ${elegir(['Ln', 'Ct', 'Ave'])}`,
    city: elegir(CIUDADES), state: 'VA',
    property_type: elegir(['residential', 'townhouse', 'condo', 'multifamily']),
    status: elegir(['available', 'in_process', 'sold']),
    list_price: entre(180, 950) * 1000,
    bedrooms: entre(2, 5), bathrooms: entre(1, 4),
    sqft: entre(900, 4200), year_built: entre(1960, 2024),
    published_to_web: i < 6,
  })), { onConflict: 'id' }))

// 5. Leads
const leads = []
const eventos = []

for (let i = 0; i < 60; i++) {
  const id = `demo-lead-${String(i + 1).padStart(3, '0')}`
  const nombre = NOMBRES[i % NOMBRES.length]
  const apellido = APELLIDOS[(i * 7) % APELLIDOS.length]

  // Reparto FIJO, no aleatorio: hacen falta al menos 26 leads en en_proceso o
  // cerrado para poder colgar 25 procesos y dejar además un cerrado sin proceso.
  // El paso 23 es coprimo con 60, así que baraja las etapas a lo largo de todo
  // el rango de fechas en vez de dejarlas agrupadas por antigüedad.
  const etapa = PLAN_ETAPAS[(i * 23) % 60]

  // 180 días de antigüedad con jitter de día y hora: nada creado el mismo día.
  const dias = Math.floor((i / 60) * 180) + entre(0, 3)
  const creado = haceDias(180 - dias, entre(8, 19))

  // Casos raros pedidos: uno sin teléfono, uno sin presupuesto.
  const sinTelefono   = i === 11
  const sinPresupuesto = i === 17

  leads.push({
    id, tenant_id: TENANT,
    agent_id: AGENTES[i % AGENTES.length].id,
    first_name: nombre,
    last_name: apellido,
    email: `${nombre}.${apellido}`.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z.]/g, '') + `.${i + 1}@example.com`,
    phone: sinTelefono ? null : `+1 757 555 ${String(entre(1000, 9999))}`,
    language: elegir(['es', 'en']),
    stage: etapa,
    fit_profile: perfilFit(i),
    // budget_amount es GENERATED desde metadata->'budget_amount', y sólo cuenta
    // si el JSON es un number.
    metadata: sinPresupuesto ? {} : { budget_amount: entre(15, 95) * 10000 },
    traffic_source: elegir(['direct', 'ads_meta', 'ads_google', 'organic_social', 'referral']),
    // CAPA 3 de las garantías: bloqueados con la ÚNICA razón que respeta también
    // send-purchase-email.ts. Además es la etiqueta honesta: example.com rebota.
    email_blocked: true,
    email_blocked_reason: 'hard_bounce',
    created_at: creado,
    peak_score: 0, current_score: 0,
  })

  // lead_created para todos: 0 puntos, pero dispara recompute_lead_score y así
  // el fit se materializa aunque el lead no tenga más actividad.
  eventos.push({
    lead_id: id, tenant_id: TENANT, type: 'lead_created',
    description: 'Lead registrado (siembra demo)', points: 0,
    dedup_key: `${id}:created`, created_at: creado,
  })

  // Actividad variada para que las bandas de calidad tengan de dónde salir.
  const cuantos = entre(0, 4)
  for (let e = 0; e < cuantos; e++) {
    const ev = elegir(EVENTOS_POSITIVOS)
    eventos.push({
      lead_id: id, tenant_id: TENANT, type: ev.type, description: ev.desc, points: 0,
      dedup_key: `${id}:${ev.type}:${e}`,
      created_at: haceDias(entre(1, 170), entre(9, 20)),
    })
  }
}

// Caso raro: queja de spam → force_perdido, score 0, etapa perdido.
const LEAD_SPAM = 'demo-lead-042'
eventos.push({
  lead_id: LEAD_SPAM, tenant_id: TENANT, type: 'email_spam_complaint',
  description: 'Marcó un correo como spam', points: 0,
  dedup_key: `${LEAD_SPAM}:spam`, created_at: haceDias(40, 11),
})

await paso('60 leads', () => db.from('leads').upsert(leads, { onConflict: 'id' }))

// El índice único de lead_events es PARCIAL (WHERE dedup_key IS NOT NULL) y
// PostgREST no puede apuntar a un índice parcial en on_conflict. Para conservar
// la idempotencia se borran primero los eventos DE ESTE TENANT y se reinsertan.
await paso('limpiar eventos previos', () =>
  db.from('lead_events').delete().eq('tenant_id', TENANT))
await paso(`${eventos.length} eventos`, () =>
  db.from('lead_events').insert(eventos))

// 6. Procesos de compra — 25, colgando de leads en en_proceso o cerrado.
const candidatos = leads.filter(l => ['en_proceso', 'cerrado'].includes(l.stage))

// Caso raro pedido: un lead CERRADO que no tiene proceso — el deal que
// esperarías encontrar y no está. Se aparta antes de repartir los 25.
const SIN_PROCESO = candidatos.find(l => l.stage === 'cerrado')
const conProceso = candidatos.filter(l => l !== SIN_PROCESO).slice(0, 25)

const procesos = conProceso.map((l, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  tenant_id: TENANT,
  lead_id: l.id,
  address: `${entre(100, 9800)} ${elegir(CALLES)} ${elegir(['Ln', 'Ct', 'Ave'])}, ${elegir(CIUDADES)} VA`,
  loan_type: elegir(['conventional', 'fha', 'va', 'cash']),
  // Caso raro: dos procesos sin fecha de cierre, que close_before debe excluir.
  closing_date: i < 2 ? null : haceDias(-entre(5, 120), 12).slice(0, 10),
  notes: i % 4 === 0 ? 'Inspección pendiente de agendar.' : null,
  completed_at: l.stage === 'cerrado' ? haceDias(entre(5, 60), 15) : null,
  // CAPA 1: los tres flags en true. La Stage 3 del cron sólo recoge los no
  // enviados, así que no hay nada que pueda mandar.
  email_start_sent: true, email_preclose_sent: true, email_completed_sent: true,
}))

await paso('25 procesos de compra', () =>
  db.from('purchase_processes').upsert(procesos, { onConflict: 'id' }))

// ── Verificación de las garantías ─────────────────────────────────────────────

console.log('\nComprobando las garantías de no-envío:')

const checks = [
  ['leads desprotegidos', await db.from('leads').select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT).or('email_blocked.is.false,email_blocked_reason.neq.hard_bounce')],
  ['procesos con envío pendiente', await db.from('purchase_processes').select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT).or('email_start_sent.is.false,email_preclose_sent.is.false,email_completed_sent.is.false')],
  ['secuencias de email', await db.from('email_sequences').select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT)],
  ['canales con secuencia', await db.from('acquisition_channels').select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT).not('email_sequence_id', 'is', null)],
  ['corridas de secuencia', await db.from('lead_sequence_runs').select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT)],
]

let fallo = false
for (const [nombre, res] of checks) {
  const n = res.count ?? 0
  console.log(`  ${n === 0 ? '✓' : '✗'} ${nombre}: ${n}`)
  if (n !== 0) fallo = true
}

const { count: totalLeads } = await db.from('leads')
  .select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT)
const { count: totalProcesos } = await db.from('purchase_processes')
  .select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT)
const { data: noExample } = await db.from('leads')
  .select('email').eq('tenant_id', TENANT).not('email', 'like', '%@example.com')

console.log(`\n  leads: ${totalLeads} · procesos: ${totalProcesos}`)
console.log(`  ${(noExample ?? []).length === 0 ? '✓' : '✗'} correos fuera de @example.com: ${(noExample ?? []).length}`)
console.log(`  · lead cerrado sin proceso: ${SIN_PROCESO?.id ?? '(ninguno)'}`)

if (fallo || (noExample ?? []).length > 0) {
  console.error('\nLa siembra dejó garantías sin cumplir.')
  process.exit(1)
}

console.log('\nListo.')
