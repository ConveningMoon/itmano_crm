import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import type { LeadTag } from '@/lib/leads/tags'

// Cobertura de las secuencias disparadas por etiqueta (117).
//
// La pregunta que responde esta lectura es la del panel "Por etiqueta" de
// /emails: para cada etiqueta que debe mandar correos, ¿existe su secuencia en
// cada idioma que el equipo atiende? El hueco es información: si falta la
// versión en inglés, los leads en inglés no reciben nada y nadie se enteraría
// —el disparo es silencioso por diseño, porque mandar en otro idioma sería peor.
//
// Los idiomas del equipo salen de `agents.languages`, igual que los correos de
// cierre (058): son los idiomas en los que alguien puede sostener la
// conversación que el correo abre.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TagSequenceRef {
  id:             string
  name:           string
  active:         boolean
  stepCount:      number
  activeRunCount: number
}

export interface TagSequenceSlot {
  language: string
  // null = el hueco: esta etiqueta no tiene secuencia en este idioma.
  sequence: TagSequenceRef | null
}

export interface TagSequenceCoverage {
  tag:   LeadTag
  slots: TagSequenceSlot[]
}

// Idiomas que el equipo atiende de verdad: la unión de los declarados por sus
// agentes activos. Si nadie declaró nada, español — es el idioma por defecto del
// producto y deja el panel usable en vez de vacío.
export async function getTenantLanguages(tenantId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('agents')
    .select('language, languages')
    .eq('tenant_id', tenantId)
    .eq('active', true)

  const valid = SUPPORTED_LANGUAGE_CODES as readonly string[]
  const set = new Set<string>()
  for (const a of (data ?? []) as any[]) {
    for (const l of (a.languages ?? []) as string[]) if (valid.includes(l)) set.add(l)
    if (a.language && valid.includes(a.language)) set.add(a.language as string)
  }
  if (set.size === 0) set.add('es')

  // Orden estable: el de SUPPORTED_LANGUAGE_CODES, no el de llegada.
  return valid.filter(l => set.has(l))
}

export async function getTagSequenceCoverage(tenantId: string | null): Promise<TagSequenceCoverage[]> {
  if (!tenantId) return []

  const supabase = createAdminClient()

  const [{ data: tagRows }, { data: seqRows }, languages] = await Promise.all([
    supabase
      .from('lead_tags')
      .select('id, name, slug, color, description, position, requires_sequence')
      .eq('tenant_id', tenantId)
      .order('position')
      .order('created_at'),
    supabase
      .from('email_sequences')
      .select('id, name, language, active, trigger_tag_id')
      .eq('tenant_id', tenantId)
      .not('trigger_tag_id', 'is', null),
    getTenantLanguages(tenantId),
  ])

  const sequences = (seqRows ?? []) as any[]
  const seqIds    = sequences.map(s => s.id as string)

  // Pasos activos y corridas activas de todas las secuencias de un tirón: una
  // consulta por secuencia serían dos queries por fila del panel.
  const [{ data: stepRows }, { data: runRows }] = await Promise.all([
    seqIds.length > 0
      ? supabase.from('email_sequence_steps').select('sequence_id').eq('active', true).in('sequence_id', seqIds)
      : Promise.resolve({ data: [] as any[] }),
    seqIds.length > 0
      ? supabase.from('lead_sequence_runs').select('sequence_id').eq('status', 'active').in('sequence_id', seqIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const stepCount = new Map<string, number>()
  for (const r of (stepRows ?? []) as any[]) {
    stepCount.set(r.sequence_id, (stepCount.get(r.sequence_id) ?? 0) + 1)
  }
  const runCount = new Map<string, number>()
  for (const r of (runRows ?? []) as any[]) {
    runCount.set(r.sequence_id, (runCount.get(r.sequence_id) ?? 0) + 1)
  }

  const byTag = new Map<string, any[]>()
  for (const s of sequences) {
    const tid = s.trigger_tag_id as string
    if (!byTag.has(tid)) byTag.set(tid, [])
    byTag.get(tid)!.push(s)
  }

  const coverage: TagSequenceCoverage[] = []

  for (const t of (tagRows ?? []) as any[]) {
    const tagSequences = byTag.get(t.id as string) ?? []
    // El panel lista las etiquetas que DEBEN mandar correos y, además, cualquiera
    // que ya tenga una secuencia: si alguien la marcó y luego desmarcó la
    // etiqueta, su secuencia no puede quedar invisible.
    if (!t.requires_sequence && tagSequences.length === 0) continue

    // Los idiomas del equipo más los que ya tienen secuencia. Un idioma que el
    // equipo dejó de atender pero que tiene contenido escrito sigue a la vista.
    const langs = [...new Set([
      ...languages,
      ...tagSequences.map(s => s.language as string),
    ])]
    const order = SUPPORTED_LANGUAGE_CODES as readonly string[]
    langs.sort((a, b) => order.indexOf(a) - order.indexOf(b))

    coverage.push({
      tag: {
        id:               t.id as string,
        name:             t.name as string,
        slug:             t.slug as string,
        color:            t.color as string,
        description:      (t.description ?? null) as string | null,
        position:         (t.position ?? 0) as number,
        requiresSequence: !!t.requires_sequence,
      },
      slots: langs.map(language => {
        const s = tagSequences.find(x => x.language === language)
        return {
          language,
          sequence: s
            ? {
                id:             s.id as string,
                name:           s.name as string,
                active:         !!s.active,
                stepCount:      stepCount.get(s.id as string) ?? 0,
                activeRunCount: runCount.get(s.id as string) ?? 0,
              }
            : null,
        }
      }),
    })
  }

  return coverage
}
