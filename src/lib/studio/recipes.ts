import { z } from 'zod'
import { STYLE_KEYS } from './styles'
import { DEFAULT_PALETTE } from './palettes'
import { findTemplate } from './templates/registry'
import type { ActionResult } from './types'

// Validación por receta, PURA y sin dependencias de servidor: corre antes de
// gastar un token. Es el contrato que impide que una generación empiece con
// datos incompletos — el requisito central del Estudio: el formulario correcto
// para cada caso, completo, para evitar imprecisiones y desgaste de tokens.

/** Tope del titular. Lo comparte la UI para pintar el contador: un límite que
 *  el usuario no ve solo se descubre chocando con él. */
export const HEADLINE_MAX = 60

const HEX  = /^#[0-9a-fA-F]{6}$/

const hex = z.string().regex(HEX, 'Los colores deben ser hex de 6 dígitos')

const paletteSchema = z.union([
  // `logo` es un rol posterior: las piezas guardadas antes de que existiera solo
  // traen tres colores y tienen que poder recomponerse. Si falta, sigue al
  // primario — que es exactamente con lo que se teñía el logo entonces.
  z.object({ brand: hex, surface: hex, ink: hex, logo: hex.optional() })
    .transform(p => ({ ...p, logo: p.logo ?? p.brand })),
  // Legado: array de hex. El primero era el color de marca y el resto se
  // descartaba, así que se traduce a ese rol y los otros dos a sus defaults.
  z.array(hex).max(4).transform(arr => ({
    brand:   arr[0] ?? DEFAULT_PALETTE.brand,
    surface: DEFAULT_PALETTE.surface,
    ink:     DEFAULT_PALETTE.ink,
    logo:    arr[0] ?? DEFAULT_PALETTE.logo,
  })),
]).default(DEFAULT_PALETTE)
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Campos comunes a las cinco recetas.
const common = {
  source_mode:    z.enum(['generate', 'photo']).default('generate'),
  scene_notes:    z.string().trim().max(500).optional(),
  style:          z.enum(STYLE_KEYS as [string, ...string[]]),
  // Colores POR ROL. Antes era un array de hasta cuatro hex del que solo se usaba
  // el primero — nadie podía saber para qué servía cada uno porque casi ninguno
  // servía para nada. Se acepta también el formato viejo para que las piezas ya
  // guardadas se sigan recomponiendo.
  palette:        paletteSchema,
  aspect:         z.enum(['1:1', '4:5', '9:16']),
  has_reference:  z.boolean().default(false),
  reference_role: z.enum(['subject', 'style', 'composition']).optional(),
  property_id:    z.string().uuid().optional(),
  // El teléfono NO es un campo del formulario: sale de agents.phone del agente
  // elegido. Pedirlo a mano sería retranscribir un dato que el CRM ya tiene,
  // que es exactamente lo que el selector de propiedad viene a evitar.
  agent_id:       z.string().min(1).optional(),
  // El diseño elegido. Obligatorio en las recetas de casa (ver el superRefine):
  // sin él no hay dónde poner los datos.
  template:       z.string().min(1).optional(),
  // Titular de marketing. La etiqueta fija ("NUEVA DISPONIBLE") describe el
  // hecho; el titular vende. Sin él, los nueve diseños dirían siempre lo mismo.
  headline:       z.string().trim().max(HEADLINE_MAX, `El titular no puede pasar de ${HEADLINE_MAX} caracteres`).optional(),
}

const money = z.number({ error: 'La cifra es obligatoria' }).positive('La cifra debe ser mayor que cero')

// El mensaje del `.regex()` solo se emite si el valor ES un string: un campo
// ausente produce el error de tipo base ("expected string, received undefined"),
// que no le dice nada al usuario. Por eso el mensaje va también en el tipo.
const required = (message: string) => z.string({ error: message })

const openHouse = z.object({
  ...common,
  recipe:       z.literal('open_house'),
  address:      required('La dirección es obligatoria').trim().min(3, 'La dirección es obligatoria'),
  date:         required('La fecha es obligatoria').regex(DATE, 'La fecha es obligatoria'),
  time_start:   required('La hora de inicio es obligatoria').regex(TIME, 'La hora de inicio es obligatoria'),
  time_end:     required('La hora de cierre es obligatoria').regex(TIME, 'La hora de cierre es obligatoria'),
  refreshments: z.boolean().default(false),
})

const newListing = z.object({
  ...common,
  recipe:     z.literal('new_listing'),
  address:    required('La dirección es obligatoria').trim().min(3, 'La dirección es obligatoria'),
  price:      money,
  bedrooms:   z.number().int().nonnegative().optional(),
  bathrooms:  z.number().nonnegative().optional(),
  sqft:       z.number().int().positive().optional(),
})

const sold = z.object({
  ...common,
  recipe:     z.literal('sold'),
  address:    required('La dirección o la zona es obligatoria').trim().min(3, 'La dirección o la zona es obligatoria'),
  show_price: z.boolean().default(false),
  price:      money.optional(),
  note:       z.string().trim().max(60).optional(),
})

const event = z.object({
  ...common,
  recipe:     z.literal('event'),
  title:      required('El título es obligatorio').trim().min(3, 'El título es obligatorio'),
  event_type: z.enum(['seminario', 'webinar', 'casa_abierta_comunitaria', 'otro']).default('otro'),
  date:       required('La fecha es obligatoria').regex(DATE, 'La fecha es obligatoria'),
  time_start: required('La hora es obligatoria').regex(TIME, 'La hora es obligatoria'),
  venue:      required('El lugar es obligatorio').trim().min(2, 'El lugar es obligatorio'),
  is_free:    z.boolean().default(true),
  price:      money.optional(),
  signup:     z.string().trim().max(120).optional(),
})

const openPrompt = z.object({
  ...common,
  recipe: z.literal('open_prompt'),
  prompt: required('El prompt es obligatorio').trim().min(3, 'El prompt es obligatorio').max(800),
})

// Las recetas de casa son las únicas donde "usar la foto tal cual" tiene sentido.
const PHOTO_RECIPES = ['open_house', 'new_listing', 'sold']

const schema = z
  .discriminatedUnion('recipe', [openHouse, newListing, sold, event, openPrompt])
  .superRefine((v, ctx) => {
    // El template, SI viene, tiene que existir y servir para esta receta. Que
    // sea obligatorio o no NO se decide aquí: ver `requireTemplate` abajo.
    if (v.template) {
      const t = findTemplate(v.template)
      if (!t) {
        ctx.addIssue({ code: 'custom', path: ['template'], message: 'Ese diseño no existe' })
      } else if (!t.recipes.includes(v.recipe)) {
        ctx.addIssue({ code: 'custom', path: ['template'], message: 'Ese diseño no sirve para esta receta' })
      }
    }
    // Una imagen adjunta sin rol declarado es un deseo, no una instrucción: el
    // modelo no puede saber si es la casa, el clima o el encuadre.
    if (v.has_reference && !v.reference_role) {
      ctx.addIssue({ code: 'custom', path: ['reference_role'], message: 'Declara qué es la imagen de referencia' })
    }
    if (v.source_mode === 'photo') {
      if (!PHOTO_RECIPES.includes(v.recipe)) {
        ctx.addIssue({ code: 'custom', path: ['source_mode'], message: 'Usar la foto solo aplica a las recetas de casa' })
      }
      if (!v.property_id) {
        ctx.addIssue({ code: 'custom', path: ['property_id'], message: 'Elige la propiedad de la que sale la foto' })
      }
    }
    if (v.recipe === 'sold' && v.show_price && v.price === undefined) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Indica la cifra o desactiva mostrarla' })
    }
    if (v.recipe === 'event' && !v.is_free && v.price === undefined) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Indica la cifra o marca el evento como gratuito' })
    }
  })

export type StudioForm = z.infer<typeof schema>

/**
 * Valida el formulario. Devuelve el primer mensaje legible en vez de un árbol
 * de errores: la UI marca un campo a la vez y el mensaje va tal cual al usuario.
 */
export function parseStudioForm(input: unknown): ActionResult<StudioForm> {
  const r = schema.safeParse(input)
  if (r.success) return { ok: true, data: r.data }
  const first = r.error.issues[0]
  return { ok: false, error: first?.message ?? 'El formulario tiene datos inválidos' }
}

/**
 * Las piezas NUEVAS de casa se dibujan con un template. Esto es política de
 * producto y va aparte del esquema a propósito:
 *
 * las piezas creadas ANTES de los templates se hicieron con el compositor de
 * bandas y tienen `template` nulo. Recomponerlas o generar una variante vuelve a
 * pasar su `form_json` por `parseStudioForm` — si el esquema exigiera template,
 * esas piezas dejarían de poder recomponerse. Exigirlo solo al crear mantiene
 * el pasado utilizable sin abrir la puerta a piezas nuevas sin diseño.
 */
export function requireTemplate(form: StudioForm): { ok: false; error: string } | null {
  if (!PHOTO_RECIPES.includes(form.recipe)) return null
  if (form.template) return null
  return { ok: false, error: 'Elige un diseño' }
}
