import { z } from 'zod'
import { STAGES, QUALITY_BANDS, URGENCIES } from '@/lib/scoring/priority'
import { MoneySchema, PII } from './common'

// Los códigos de enum van en español snake_case porque así están en la base;
// la etiqueta legible se publica en /metadata.
export const StageSchema   = z.enum(STAGES)
export const QualitySchema = z.enum(QUALITY_BANDS)
export const UrgencySchema = z.enum(URGENCIES)

export const ScoreSchema = z.object({
  total:      z.number().int(),
  fit:        z.number().int(),
  engagement: z.number().int(),
  manual:     z.number().int(),
}).meta({ description: 'clamp(0..100) de fit + engagement + manual.' })

export const LeadSchema = z.object({
  id:         z.string().meta({ description: 'Id opaco. NO es un uuid: leads.id es text por legado.' }),
  first_name: z.string().meta({ ...PII }),
  last_name:  z.string().nullable().meta({ ...PII }),
  email:      z.string().meta({ ...PII }),
  phone:      z.string().nullable().meta({ ...PII }),
  language:   z.string().nullable().meta({ ...PII }),
  notes:      z.string().nullable().meta({ ...PII }),

  stage:         StageSchema.meta({ description: 'Etapa del embudo. La mueve el agente, nunca el sistema.' }),
  quality_band:  QualitySchema.nullable().meta({ description: 'Quintil de la cartera activa del tenant.' }),
  urgency:       UrgencySchema.nullable(),
  owner:         z.string().nullable().meta({ description: 'agents.id. Un agente NO es un usuario de login.' }),

  score:  ScoreSchema,
  budget: MoneySchema.meta({ ...PII, description: 'Presupuesto declarado por el lead.' }),

  created_at: z.string(),
  updated_at: z.string().nullable(),
})

export type Lead = z.infer<typeof LeadSchema>

/**
 * Proyección de persona sobre la MISMA fila de `leads`: mismos ids, sin scoring,
 * etapa ni presupuesto. Existe para consumidores que solo quieren la ficha de
 * contacto; queda marcada fuera del catálogo de herramientas del agente para
 * que no cuente dos veces a la misma persona.
 */
export const ContactSchema = LeadSchema.pick({
  id: true, first_name: true, last_name: true, email: true,
  phone: true, language: true, owner: true, created_at: true,
})

export type Contact = z.infer<typeof ContactSchema>
