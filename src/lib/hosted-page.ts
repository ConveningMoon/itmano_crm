// Páginas alojadas por ITMANO (migración 060) — config compartida.
// Client-safe (sin server-only): la consumen el constructor en /sources, las
// páginas públicas (hosted) y el proxy (mapa de subdominios).

import { z } from 'zod'
import { QUALIFYING_DIMENSIONS } from '@/lib/hosted-questions'

// ── Subdominios ───────────────────────────────────────────────────────────────
// CNAMEs a registrar en el DNS de itmano.com → cname.vercel-dns.com y agregar
// como dominios del proyecto en Vercel. El proxy reescribe por host:
//   lm | events | forms → /hp/<path>   ·   properties → /web/<path>   ·   news → /nl/<path>

export const HOSTED_SUBDOMAIN_REWRITE: Record<string, string> = {
  lm:         '/hp',
  events:     '/hp',
  forms:      '/hp',
  properties: '/web',
  news:       '/nl',
}

const SUBDOMAIN_BY_CHANNEL_TYPE: Record<string, string> = {
  lead_magnet:  'lm',
  event:        'events',
  contact_form: 'forms',
}

const HOSTED_BASE_DOMAIN = 'itmano.com'

/** URL pública de la página alojada de un canal. */
export function hostedChannelUrl(channelType: string, tenantSlug: string, channelSlug: string): string {
  const sub = SUBDOMAIN_BY_CHANNEL_TYPE[channelType] ?? 'forms'
  return `https://${sub}.${HOSTED_BASE_DOMAIN}/${tenantSlug}/${channelSlug}`
}

/** URL pública del catálogo de propiedades del tenant. */
export function hostedPropertiesUrl(tenantSlug: string): string {
  return `https://properties.${HOSTED_BASE_DOMAIN}/${tenantSlug}`
}

/** URL pública de una newsletter: portada del tenant, o una edición suya. */
export function hostedNewsletterUrl(tenantSlug: string, editionSlug?: string): string {
  const path = [tenantSlug, editionSlug].filter(Boolean).join('/')
  return `https://news.${HOSTED_BASE_DOMAIN}/${path}`
}

// ── Config de la página (acquisition_channels.hosted_page) ───────────────────

export const HostedQuestionSchema = z.object({
  key:      z.string().trim().min(1).max(60),
  label:    z.string().trim().min(1, 'La pregunta necesita un texto.').max(200),
  type:     z.enum(['text', 'select']),
  options:  z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  required: z.boolean().default(false),
  // Pregunta de CALIFICACIÓN: su clave es una dimensión del modelo y sus
  // opciones NO se guardan aquí — se derivan del perfil de negocio al
  // renderizar (ver hosted-questions.ts). Por eso cambiar los rangos o las
  // zonas en Ajustes corrige el formulario solo: no hay copia que actualizar.
  //
  // Sin este campo la pregunta es libre, como hasta ahora: se guarda y se
  // muestra en el CRM, pero no puntúa.
  dimension: z.enum(QUALIFYING_DIMENSIONS).optional(),
  // Etiquetas visibles de `options`, en el mismo orden. Sólo las rellena el
  // resolutor de preguntas de calificación: el visitante ve "Hasta $300.000" y
  // lo que viaja al CRM es "300000".
  optionLabels: z.array(z.string().max(160)).max(12).optional(),
})

// Tarjeta de beneficio (sección "lo que contiene" — mismo patrón que el
// template JSON del proyecto LeadMagnets de A&J, versión simplificada).
export const HostedBenefitSchema = z.object({
  title: z.string().trim().min(1).max(90),
  desc:  z.string().trim().max(220).optional().default(''),
})

// Testimonio real de un cliente (los escribe el agente — la IA nunca los inventa).
export const HostedTestimonialSchema = z.object({
  name:      z.string().trim().min(1).max(80),
  location:  z.string().trim().max(120).optional().default(''),
  quote:     z.string().trim().min(1).max(500),
  photo_url: z.string().trim().max(600).optional().default(''),
})

// Datos del evento presencial (solo canales tipo `event`).
export const HostedEventSchema = z.object({
  date:              z.string().trim().max(60).optional().default(''),  // "Sábado 12 de octubre"
  time:              z.string().trim().max(60).optional().default(''),  // "10:00 AM"
  location:          z.string().trim().max(200).optional().default(''), // lugar / dirección
  short_description: z.string().trim().max(600).optional().default(''),
})

export const HostedPageConfigSchema = z.object({
  enabled:         z.boolean().default(false),
  // Idioma de los labels fijos del formulario. Ya no se elige en el constructor:
  // lo detecta la IA desde la descripción (o queda 'es' por defecto).
  language:        z.enum(['es', 'en', 'pt']).default('es'),
  headline:        z.string().trim().min(3, 'El título es obligatorio.').max(140),
  subheadline:     z.string().trim().max(300).optional().default(''),
  bullets:         z.array(z.string().trim().min(1).max(160)).max(6).default([]),
  cta_label:       z.string().trim().max(60).optional().default(''),
  success_message: z.string().trim().max(400).optional().default(''),
  ask_phone:       z.boolean().default(false),
  questions:       z.array(HostedQuestionSchema).max(10).default([]),
  // Template extendido (lead magnets sobre todo) — todo opcional.
  badge:           z.string().trim().max(90).optional().default(''),   // eyebrow del hero
  microcopy:       z.string().trim().max(140).optional().default(''),  // bajo el CTA ("100% gratis…")
  // Portada del MATERIAL (la imagen del PDF/guía que se muestra flotando).
  cover_image_url:      z.string().trim().max(600).optional().default(''),
  // Imagen de FONDO de la página (hero). Independiente de la portada; si está
  // vacía, el hero cae a la portada para no romper páginas ya publicadas.
  background_image_url: z.string().trim().max(600).optional().default(''),
  benefits_title:    z.string().trim().max(140).optional().default(''),
  benefits_subtitle: z.string().trim().max(400).optional().default(''),
  benefits:        z.array(HostedBenefitSchema).max(6).default([]),
  form_title:      z.string().trim().max(140).optional().default(''),  // encabezado de la sección del formulario
  form_subtitle:   z.string().trim().max(300).optional().default(''),
  agent_intro: z.object({
    name:      z.string().trim().max(80).optional().default(''),
    title:     z.string().trim().max(120).optional().default(''),
    paragraph: z.string().trim().max(800).optional().default(''),
    quote:     z.string().trim().max(300).optional().default(''),
    photo_url: z.string().trim().max(600).optional().default(''),
    whatsapp_url:  z.string().trim().max(200).optional().default(''),
    instagram_url: z.string().trim().max(200).optional().default(''),
  }).optional(),
  testimonials_title: z.string().trim().max(140).optional().default(''),
  testimonials:       z.array(HostedTestimonialSchema).max(6).default([]),
  final_cta_title:     z.string().trim().max(140).optional().default(''),
  final_cta_paragraph: z.string().trim().max(400).optional().default(''),
  // Evento presencial (solo channel_type = 'event').
  event: HostedEventSchema.optional(),
})

export type HostedPageConfig  = z.infer<typeof HostedPageConfigSchema>
export type HostedQuestion    = z.infer<typeof HostedQuestionSchema>
export type HostedTestimonial = z.infer<typeof HostedTestimonialSchema>
export type HostedEvent       = z.infer<typeof HostedEventSchema>

export function parseHostedPage(raw: unknown): HostedPageConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = HostedPageConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

// ── Copy fijo por idioma (labels de campos personales y defaults) ─────────────

export const HOSTED_UI_COPY: Record<'es' | 'en' | 'pt', {
  firstName: string; lastName: string; email: string; phone: string
  submitDefault: string; successDefault: string; alreadySubmitted: string
  errorGeneric: string; requiredHint: string
}> = {
  es: {
    firstName: 'Nombre', lastName: 'Apellido', email: 'Email', phone: 'Teléfono',
    submitDefault: 'Enviar', successDefault: '¡Listo! Revisa tu correo.',
    alreadySubmitted: 'Ya habíamos recibido tus datos — revisa tu correo.',
    errorGeneric: 'No pudimos enviar el formulario. Inténtalo de nuevo.',
    requiredHint: 'Completa los campos obligatorios.',
  },
  en: {
    firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone',
    submitDefault: 'Submit', successDefault: 'Done! Check your inbox.',
    alreadySubmitted: 'We already had your details — check your inbox.',
    errorGeneric: 'We could not submit the form. Please try again.',
    requiredHint: 'Please fill in the required fields.',
  },
  pt: {
    firstName: 'Nome', lastName: 'Sobrenome', email: 'Email', phone: 'Telefone',
    submitDefault: 'Enviar', successDefault: 'Pronto! Confira seu email.',
    alreadySubmitted: 'Já tínhamos seus dados — confira seu email.',
    errorGeneric: 'Não foi possível enviar o formulário. Tente novamente.',
    requiredHint: 'Preencha os campos obrigatórios.',
  },
}
