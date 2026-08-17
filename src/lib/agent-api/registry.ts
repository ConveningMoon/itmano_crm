import { z } from 'zod'
import { LeadSchema, ContactSchema, StageSchema } from './schemas/lead'
import { DealSchema, PIPELINE } from './schemas/deal'
import { PageSchema } from './schemas/common'
import { CreateLeadSchema, UpdateLeadSchema, CreateNoteSchema, CreateDraftSchema, NoteSchema, DraftSchema } from './schemas/write'
import { DEFAULT_LIMIT, MAX_LIMIT } from './cursor'

/**
 * Inventario de rutas. Es la ÚNICA fuente del generador de OpenAPI: si una ruta
 * no está aquí, no aparece en el contrato.
 *
 * `agentTool` decide si la operación entra en el catálogo de herramientas de un
 * agente conversacional. `/contacts` va en false a propósito: devuelve las
 * mismas personas que `/leads`, y un planner que viera las dos las contaría dos
 * veces. Se marca en el documento como `x-itmano-agent-tool` para que el
 * consumidor pueda filtrarlo por programa, sin leer prosa.
 */
export interface RouteSpec {
  method: 'get' | 'post' | 'patch'
  path: string
  operationId: string
  summary: string
  description?: string
  scope: 'read' | 'write'
  agentTool: boolean
  /** Nombre del ejemplo que el generador busca en el tenant demo. */
  exampleKey?: string
  query?: { name: string; schema: z.ZodTypeAny; description: string }[]
  pathParams?: { name: string; description: string }[]
  body?: z.ZodTypeAny
  response: z.ZodTypeAny
  idempotent?: boolean
}

const cursorParams = [
  { name: 'limit',  schema: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    description: `Elementos por página. Máximo ${MAX_LIMIT}; por encima devuelve 400, no trunca.` },
  { name: 'cursor', schema: z.string().optional(),
    description: 'Cursor opaco de la página anterior. Sólo válido con los MISMOS filtros que lo generaron.' },
]

const WhoamiSchema = z.object({
  tenant:      z.object({ id: z.string(), name: z.string() }),
  scopes:      z.array(z.string()),
  api_version: z.string(),
  environment: z.string(),
  token:       z.object({ expires_at: z.string() }),
})

const ValorEtiqueta = z.object({ value: z.string(), label: z.string() })

const MetadataSchema = z.object({
  stages:            z.array(ValorEtiqueta),
  quality_bands:     z.array(ValorEtiqueta),
  urgencies:         z.array(ValorEtiqueta),
  pipelines:         z.array(ValorEtiqueta),
  owners:            z.array(z.object({
    id: z.string(), name: z.string(), email: z.string(), active: z.boolean(),
  })),
  channels:          z.array(z.object({ id: z.string(), name: z.string(), channel_type: z.string() })),
  property_statuses: z.array(z.string()),
  fit_dimensions:    z.object({
    buy:     z.array(z.string()),
    sell:    z.array(z.string()),
    buckets: z.record(z.string(), z.array(z.string())),
  }),
  currency:      z.string(),
  locales:       z.array(z.string()),
  custom_fields: z.array(z.never()).meta({
    description: 'SIEMPRE vacío: este CRM no tiene campos personalizados. Se declara para que no haya que adivinarlo.',
  }),
})

const SearchSchema = z.object({
  data: z.array(z.object({
    type:  z.enum(['lead', 'property', 'deal']),
    id:    z.string(),
    label: z.string().meta({ 'x-itmano-pii': true }),
  })),
})

export const ROUTES: RouteSpec[] = [
  {
    method: 'get', path: '/whoami', operationId: 'whoami',
    summary: 'Identidad del token',
    description: 'Tenant, scopes, versión y vencimiento. No toca ningún dato de negocio: sirve para verificar el cableado.',
    scope: 'read', agentTool: true, exampleKey: 'whoami', response: WhoamiSchema,
  },
  {
    method: 'get', path: '/metadata', operationId: 'getMetadata',
    summary: 'Enums vivos del CRM',
    description: 'Etapas, bandas, urgencias, agentes, canales y buckets de fit. Evita hardcodear vocabulario del CRM.',
    scope: 'read', agentTool: true, exampleKey: 'metadata', response: MetadataSchema,
  },
  {
    method: 'get', path: '/leads', operationId: 'listLeads',
    summary: 'Listar leads',
    scope: 'read', agentTool: true, exampleKey: 'leads',
    query: [
      { name: 'stage', schema: StageSchema.optional(), description: 'Etapa del embudo. `status` se acepta como alias.' },
      { name: 'owner', schema: z.string().optional(), description: 'agents.id del responsable.' },
      { name: 'created_after', schema: z.string().optional(), description: 'ISO 8601. Devuelve los creados DESPUÉS de esa marca.' },
      { name: 'q', schema: z.string().optional(), description: 'Busca en nombre, apellido y correo.' },
      ...cursorParams,
    ],
    response: PageSchema(LeadSchema),
  },
  {
    method: 'get', path: '/leads/{id}', operationId: 'getLead',
    summary: 'Obtener un lead',
    description: 'Un id de otro tenant devuelve 404, nunca 403: no se filtra existencia.',
    scope: 'read', agentTool: true, exampleKey: 'lead',
    pathParams: [{ name: 'id', description: 'Id opaco del lead. NO es un uuid.' }],
    response: LeadSchema,
  },
  {
    method: 'get', path: '/contacts', operationId: 'listContacts',
    summary: 'Listar contactos (proyección de leads)',
    description: 'MISMAS filas y MISMOS ids que /leads, con forma de ficha de contacto. No es una entidad aparte: no la uses junto a /leads o contarás dos veces a la misma persona.',
    scope: 'read', agentTool: false, exampleKey: 'contacts',
    query: cursorParams, response: PageSchema(ContactSchema),
  },
  {
    method: 'get', path: '/contacts/{id}', operationId: 'getContact',
    summary: 'Obtener un contacto',
    scope: 'read', agentTool: false, exampleKey: 'contact',
    pathParams: [{ name: 'id', description: 'El mismo id que el lead.' }],
    response: ContactSchema,
  },
  {
    method: 'get', path: '/deals', operationId: 'listDeals',
    summary: 'Listar procesos de compra',
    description: '`amount` es siempre null: purchase_processes no tiene importe propio. Los campos tomados del lead llevan prefijo `lead_`.',
    scope: 'read', agentTool: true, exampleKey: 'deals',
    query: [
      { name: 'lead_stage', schema: StageSchema.optional(), description: 'Etapa del lead dueño, no del proceso.' },
      { name: 'pipeline', schema: z.literal(PIPELINE).optional(), description: `Único pipeline del CRM: "${PIPELINE}".` },
      { name: 'min_lead_budget', schema: z.coerce.number().optional(), description: 'Presupuesto mínimo declarado por el lead.' },
      { name: 'close_before', schema: z.string().optional(), description: 'YYYY-MM-DD. EXCLUYE los procesos sin fecha de cierre.' },
      ...cursorParams,
    ],
    response: PageSchema(DealSchema),
  },
  {
    method: 'get', path: '/deals/{id}', operationId: 'getDeal',
    summary: 'Obtener un proceso de compra',
    scope: 'read', agentTool: true, exampleKey: 'deal',
    pathParams: [{ name: 'id', description: 'uuid del proceso.' }],
    response: DealSchema,
  },
  {
    method: 'get', path: '/search', operationId: 'search',
    summary: 'Búsqueda transversal',
    description: 'Localiza leads, propiedades y procesos. Devuelve tipo, id y etiqueta; el detalle se pide a su endpoint.',
    scope: 'read', agentTool: true, exampleKey: 'search',
    query: [
      { name: 'q', schema: z.string(), description: 'Texto a buscar. Obligatorio.' },
      { name: 'limit', schema: z.coerce.number().int().min(1).max(25).default(10), description: 'Máximo por tipo. Tope 25.' },
    ],
    response: SearchSchema,
  },
  {
    method: 'post', path: '/leads', operationId: 'createLead',
    summary: 'Crear un lead',
    description: '`owner` es obligatorio: leads.agent_id es NOT NULL y el CRM no tiene estado "sin asignar". NO inscribe en ninguna secuencia ni envía nada.',
    scope: 'write', agentTool: true, idempotent: true, exampleKey: 'lead',
    body: CreateLeadSchema, response: LeadSchema,
  },
  {
    method: 'patch', path: '/leads/{id}', operationId: 'updateLead',
    summary: 'Mover etapa o responsable',
    description: 'ÚNICA ruta que mueve la etapa de un lead. Toda transición queda registrada en el historial por un trigger.',
    scope: 'write', agentTool: true, idempotent: true, exampleKey: 'lead',
    pathParams: [{ name: 'id', description: 'Id opaco del lead.' }],
    body: UpdateLeadSchema, response: LeadSchema,
  },
  {
    method: 'post', path: '/notes', operationId: 'createNote',
    summary: 'Adjuntar una nota',
    description: 'Se guarda como evento de 0 puntos: queda en la bitácora sin alterar el score.',
    scope: 'write', agentTool: true, idempotent: true, exampleKey: 'note',
    body: CreateNoteSchema, response: NoteSchema,
  },
  {
    method: 'post', path: '/emails/draft', operationId: 'createEmailDraft',
    summary: 'Crear un borrador de email',
    description: 'CREA Y DEVUELVE UN BORRADOR. No envía. Ninguna ruta de esta superficie tiene acceso a un transporte de email.',
    scope: 'write', agentTool: true, idempotent: true, exampleKey: 'draft',
    body: CreateDraftSchema, response: DraftSchema,
  },
]
