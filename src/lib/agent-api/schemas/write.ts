import { z } from 'zod'
import { STAGES } from '@/lib/scoring/priority'
import { PII } from './common'

const FormAnswer = z.object({
  key:      z.string().min(1).max(200),
  question: z.string().max(2000).optional(),
  value:    z.union([z.string().max(4000), z.number(), z.boolean()]),
  label:    z.string().max(4000).optional(),
})

export const CreateLeadSchema = z.object({
  first_name: z.string().min(1).max(100).meta({ ...PII }),
  // La columna es NOT NULL; se acepta ausente y se guarda '' como hace el intake.
  last_name:  z.string().max(100).default('').meta({ ...PII }),
  email:      z.string().email().max(255).meta({ ...PII }),
  phone:      z.string().max(30).optional().meta({ ...PII }),
  language:   z.enum(['es', 'en', 'pt']).default('es'),

  // Obligatorio: leads.agent_id es NOT NULL y el CRM no tiene estado "sin
  // asignar". Los ids válidos se publican en /metadata → owners.
  owner: z.string().min(1).max(64).meta({
    description: 'agents.id del agente responsable. Obligatorio: el CRM no admite leads sin dueño.',
  }),

  // Calificación. Se interpreta con el MISMO extractor que el intake, así que
  // un lead creado por el agente puntúa igual que uno que llegó por formulario.
  intent:        z.enum(['buy', 'invest', 'sell']).optional(),
  budget_amount: z.number().nonnegative().optional().meta({
    ...PII,
    description: 'Se guarda en metadata.budget_amount como número; leads.budget_amount se genera de ahí.',
  }),
  form_answers: z.array(FormAnswer).max(50).optional(),
  notes:        z.string().max(4000).optional().meta({ ...PII }),
})

export const UpdateLeadSchema = z.object({
  stage: z.enum(STAGES).optional(),
  owner: z.string().min(1).max(64).optional(),
}).refine(v => v.stage !== undefined || v.owner !== undefined, {
  message: 'Provide at least one of: stage, owner',
})

export const CreateNoteSchema = z.object({
  target_type: z.enum(['lead', 'contact', 'deal']).meta({
    description: 'contact resuelve al mismo lead; deal resuelve al lead dueño del proceso.',
  }),
  target_id: z.string().min(1).max(64),
  body:      z.string().min(1).max(4000).meta({ ...PII }),
})

export const CreateDraftSchema = z.object({
  lead_id: z.string().min(1).max(64),
  subject: z.string().min(1).max(500).meta({ ...PII }),
  body:    z.string().min(1).max(50000).meta({ ...PII }),
})

export const NoteSchema = z.object({
  id:         z.string(),
  lead_id:    z.string(),
  body:       z.string().meta({ ...PII }),
  created_at: z.string(),
})

export const DraftSchema = z.object({
  id:         z.string(),
  lead_id:    z.string(),
  subject:    z.string().meta({ ...PII }),
  body:       z.string().meta({ ...PII }),
  created_at: z.string(),
  status:     z.literal('draft').meta({
    description: 'Siempre "draft". Esta superficie no envía email en ninguna ruta.',
  }),
})
