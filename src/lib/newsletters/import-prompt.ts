import { CONTENT_LIMITS } from './content'
import { NEWSLETTER_CATEGORIES } from './category'

// El contrato de importación: la edición escrita por la IA del propio cliente.
//
// Por qué existe: generar con nuestra IA cuesta entre $0,60 y $0,90 por edición
// y lo paga ITMANO. Quien ya tiene su propia suscripción de IA —y a estas
// alturas es casi todo el mundo— puede redactar allí y traer el resultado, sin
// que a nosotros nos cueste un céntimo ni a él un paso de más.
//
// Las IMÁGENES quedan fuera a propósito. Un JSON no puede traer un archivo, y
// aceptar URLs ajenas significaría publicar bajo la marca del cliente una
// imagen alojada en un servidor que no controlamos: puede caerse, cambiar o
// convertirse en otra cosa. La portada y las imágenes se ponen después, en el
// editor, con el mismo selector de siempre.
//
// Puro y client-safe: el modal lo pinta sin pedir nada al servidor.

/**
 * El texto que el usuario copia y pega en SU IA, junto a lo que quiera pedirle.
 *
 * Se genera desde `CONTENT_LIMITS`, la misma constante que valida el servidor.
 * Escribir los topes a mano aquí es exactamente cómo este documento y el
 * validador se separan — y quien paga esa separación es el usuario, que recibe
 * un "no válido" sobre un JSON que siguió al pie de la letra lo que le dijimos.
 */
export function buildImportPrompt(): string {
  const fence = '```'
  return [
    'Cuando termines, devuélveme el resultado como UN objeto JSON válido y nada más:',
    'sin explicaciones antes ni después, sin bloque de código, sin comentarios.',
    'Esta es la estructura exacta que necesito:',
    '',
    `${fence}json`,
    '{',
    '  "title": "el titular de la edición",',
    '  "dek": "una entradilla de una o dos frases (opcional)",',
    '  "language": "es",',
    '  "dataAsOf": "2026-08-27",',
    '  "category": "informativo",',
    '  "sources": [',
    '    { "id": "s1", "title": "Nombre del medio u organismo", "url": "https://..." }',
    '  ],',
    '  "blocks": [',
    '    { "type": "heading", "level": 2, "text": "Un subtítulo" },',
    '    { "type": "paragraph", "text": "Un párrafo de texto.", "sourceIds": ["s1"] },',
    '    { "type": "stat", "label": "Qué mide el dato", "value": "415.000 $ (+5,1% interanual)", "sourceIds": ["s1"] },',
    '    { "type": "list", "style": "bullet", "items": ["Primer punto", "Segundo punto"] },',
    '    { "type": "quote", "text": "Una cita.", "attribution": "Quién la dijo" },',
    '    { "type": "callout", "tone": "info", "text": "Un aviso destacado." }',
    '  ]',
    '}',
    fence,
    '',
    '### Reglas',
    `· "blocks" es obligatorio y lleva entre 1 y 40 bloques, en el orden en que se leerán.`,
    '· Los tipos válidos son exactamente esos seis. Cualquier otro se rechaza.',
    '· "level" sólo admite 2 o 3. "style" sólo "bullet" o "number".',
    '· "tone" sólo "info" o "warning".',
    '· "language" es un código de dos letras: es, en, pt…',
    '· "dataAsOf" es la fecha a la que se refieren los datos, en formato AAAA-MM-DD. Opcional.',
    `· "category" es opcional y admite exactamente estos valores: ${NEWSLETTER_CATEGORIES.join(', ')}.`,
    '  Si no la incluyes, se usa "informativo".',
    '',
    '### Fuentes',
    '· "sources" es OPCIONAL. Si la incluyes, cada entrada necesita "id", "title" y "url".',
    '· Un bloque cita fuentes con "sourceIds", usando los ids de esa lista.',
    '· Si citas un id que no está en "sources", la edición no se podrá publicar.',
    '  Es preferible no citar nada a citar algo que no existe.',
    '',
    '### Límites de longitud (en caracteres)',
    `· title: ${CONTENT_LIMITS.editionTitle} · dek: ${CONTENT_LIMITS.editionDek}`,
    `· heading: ${CONTENT_LIMITS.heading} · paragraph: ${CONTENT_LIMITS.paragraph}`,
    `· stat.label: ${CONTENT_LIMITS.statLabel} · stat.value: ${CONTENT_LIMITS.statValue}`,
    `· cada item de list: ${CONTENT_LIMITS.listItem}`,
    `· quote: ${CONTENT_LIMITS.quote} · attribution: ${CONTENT_LIMITS.quoteAttribution}`,
    `· callout: ${CONTENT_LIMITS.callout}`,
    'Pasarse de un límite hace que la edición entera se rechace, así que ajústate.',
    '',
    '### Imágenes',
    'NO incluyas imágenes ni bloques de tipo "image": la portada y las imágenes se',
    'eligen después, ya dentro del sistema.',
  ].join('\n')
}
