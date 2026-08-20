import { z } from 'zod'
import { ROUTES, type RouteSpec } from './registry'
import { ErrorSchema } from './schemas/common'
import { LIMITS } from './rate-limit'
import { DEADLINES } from './deadline'

const BASE_PATH = '/agent/v1'

// reason: JSON Schema es una estructura abierta y recursiva; tiparla aquí
// obligaría a castear en cada nodo sin ganar seguridad real.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

function jsonSchema(schema: z.ZodTypeAny): Json {
  const out = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Json
  delete out.$schema
  return out
}

/** Respuestas de error que puede devolver cualquier ruta. */
function respuestasDeError(escritura: boolean): Json {
  const base: Record<string, string> = {
    '400': 'invalid_arguments — parámetros o cuerpo inválidos, o cursor de otra consulta.',
    '401': 'unauthorized — falta el header, o el token es inválido, está vencido o revocado.',
    '403': 'insufficient_scope — el token no tiene el scope necesario.',
    '404': 'not_found — no existe, o pertenece a otro tenant. Indistinguibles a propósito.',
    '429': 'rate_limited — límite excedido. Incluye Retry-After.',
    '500': 'upstream_error — fallo de la base de datos.',
    '504': 'timeout — la petición superó su presupuesto de tiempo.',
  }
  if (escritura) {
    base['409'] = 'idempotency_key_reuse (misma key, otro cuerpo) o idempotency_key_in_flight (petición aún en curso).'
    base['422'] = 'unprocessable — semánticamente inválido: correo duplicado, agente inexistente.'
  }
  return Object.fromEntries(Object.entries(base).map(([codigo, descripcion]) => [
    codigo,
    { description: descripcion, content: { 'application/json': { schema: jsonSchema(ErrorSchema) } } },
  ]))
}

function operacion(ruta: RouteSpec, ejemplo: unknown): Json {
  const esEscritura = ruta.scope === 'write'

  const parametros: Json[] = [
    ...(ruta.pathParams ?? []).map(p => ({
      name: p.name, in: 'path', required: true,
      description: p.description, schema: { type: 'string' },
    })),
    ...(ruta.query ?? []).map(q => ({
      name: q.name, in: 'query', required: false,
      description: q.description, schema: jsonSchema(q.schema),
    })),
  ]

  if (esEscritura) {
    parametros.push({
      name: 'Idempotency-Key', in: 'header', required: false,
      description:
        'Repetir la misma key con el MISMO cuerpo devuelve la respuesta guardada y no repite el efecto ' +
        '(header Idempotency-Replayed: true). Con un cuerpo DISTINTO devuelve 409 idempotency_key_reuse. Caduca a las 24 h.',
      schema: { type: 'string' },
    })
  }

  return {
    operationId: ruta.operationId,
    summary:     ruta.summary,
    ...(ruta.description ? { description: ruta.description } : {}),
    tags: [ruta.path.split('/')[1] || 'meta'],
    'x-itmano-agent-tool': ruta.agentTool,
    'x-itmano-scope':      ruta.scope,
    'x-itmano-deadline-ms': DEADLINES[ruta.path === '/whoami' || ruta.path === '/metadata'
      ? 'meta' : esEscritura ? 'write' : 'read'],
    security: [{ bearerAuth: [] }],
    ...(parametros.length ? { parameters: parametros } : {}),
    ...(ruta.body ? {
      requestBody: {
        required: true,
        content: { 'application/json': { schema: jsonSchema(ruta.body) } },
      },
    } : {}),
    responses: {
      // 201 sólo para POST, que crea. PATCH actualiza y devuelve 200.
      [ruta.method === 'post' ? '201' : '200']: {
        description: 'OK',
        headers: {
          'X-RateLimit-Limit':     { schema: { type: 'string' }, description: 'Límite de la ventana de 60 s.' },
          'X-RateLimit-Remaining': { schema: { type: 'string' }, description: 'Peticiones restantes.' },
          'X-RateLimit-Reset':     { schema: { type: 'string' }, description: 'Epoch en segundos del reinicio.' },
        },
        content: {
          'application/json': {
            schema: jsonSchema(ruta.response),
            ...(ejemplo !== undefined ? { example: ejemplo } : {}),
          },
        },
      },
      ...respuestasDeError(esEscritura),
    },
  }
}

/**
 * Construye el documento OpenAPI 3.1 a partir del registro de rutas.
 *
 * Los schemas salen de zod con `z.toJSONSchema`, que emite draft 2020-12 — el
 * mismo dialecto que usa OpenAPI 3.1, así que no hace falta ninguna librería de
 * conversión. Las marcas `x-itmano-pii` viajan desde los `.meta()` de cada campo.
 *
 * `ejemplos` mapea `exampleKey` → respuesta real del tenant demo.
 */
export function buildOpenApiDocument(
  ejemplos: Record<string, unknown> = {},
  servidor?: string,
): Json {
  const paths: Json = {}

  for (const ruta of ROUTES) {
    const completa = `${BASE_PATH}${ruta.path}`
    paths[completa] ??= {}
    paths[completa][ruta.method] = operacion(
      ruta, ruta.exampleKey ? ejemplos[ruta.exampleKey] : undefined)
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'ITMANO CRM — superficie de agente',
      version: '1.0.0',
      description: [
        'Superficie HTTP para agentes externos sobre el CRM de ITMANO.',
        '',
        '**El token determina el tenant.** No se acepta `tenant_id` como parámetro en ninguna ruta.',
        'Un registro de otro tenant devuelve **404, nunca 403**: no se filtra existencia.',
        '',
        '**Esta superficie no expone `DELETE` en ninguna versión**, y **ninguna ruta envía un email**.',
        'Las dos cosas están cerradas por tests que recorren el árbol de código.',
        '',
        '**Convenciones.** Los ids son cadenas opacas — `leads.id` y `agents.id` son `text` por legado,',
        'así que no asumas uuid. Los timestamps van en ISO 8601 UTC con sufijo `Z`. El dinero se',
        'expresa como `{ amount: string, currency: string }` con decimal en cadena, nunca coma flotante.',
        'Los códigos de enum van en español snake_case porque así están en la base; la etiqueta legible',
        'está en `/metadata`.',
        '',
        '**Campos personales.** Cada propiedad que contiene datos personales lleva `x-itmano-pii: true`',
        'en su schema. Úsalo para redactar logs en vez de mantener una lista aparte.',
        '',
        '**Catálogo de herramientas.** Cada operación lleva `x-itmano-agent-tool`. Las marcadas `false`',
        'no deben registrarse como herramientas de un agente: `/contacts` devuelve las mismas personas',
        'que `/leads` y las contaría dos veces.',
        '',
        `**Paginación.** Cursor opaco, keyset, nunca offset. \`next_cursor\` es \`null\` en la última página.`,
        '',
        `**Rate limit.** ${LIMITS.all} peticiones/min por token y ${LIMITS.write} escrituras/min.`,
      ].join('\n'),
    },
    ...(servidor ? { servers: [{ url: servidor }] } : {}),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http', scheme: 'bearer',
          description: 'Token de agente: `Authorization: Bearer itmano_agent_<entorno>_<secreto>`.',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  }
}
