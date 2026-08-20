// La chuleta del contrato de plantilla, para que el editor la pueda enseñar.
//
// Es documentación, sí, pero no una lista escrita a mano que se quede vieja:
// `tests/studio/reference.test.ts` cruza cada grupo contra lo que el motor
// EMITE de verdad para un escenario completo. Si alguien añade una clave a
// `values.ts` y no la documenta aquí, ese test falla.
//
// Vive en `templates/` y no en la carpeta de la página porque describe el
// contrato, no la interfaz — y así el test puede llegar a ella sin tocar React.

export interface ClaveDocumentada {
  clave: string
  /** Qué pinta, en una línea. */
  que:   string
}

export interface GrupoDeClaves {
  titulo: string
  /** Cómo se escribe en el HTML: {{clave}}, {{&clave}} o una clase. */
  forma:  string
  claves: ClaveDocumentada[]
}

export const IMAGENES: GrupoDeClaves = {
  titulo: 'Imágenes',
  forma:  '{{clave}} dentro de src',
  claves: [
    { clave: 'hero',       que: 'La foto principal' },
    { clave: 'thumb1',     que: 'Miniatura 1 del mosaico' },
    { clave: 'thumb2',     que: 'Miniatura 2' },
    { clave: 'thumb3',     que: 'Miniatura 3' },
    { clave: 'agentPhoto', que: 'Retrato del agente, ya recortado en círculo' },
    { clave: 'logo',       que: 'Logo del cliente, teñido con su color' },
  ],
}

export const TEXTOS: GrupoDeClaves = {
  titulo: 'Textos',
  forma:  '{{clave}}',
  claves: [
    { clave: 'badge',     que: 'El encabezado de la receta: NUEVA DISPONIBLE, VENDIDA…' },
    { clave: 'headline',  que: 'El titular, en texto plano' },
    { clave: 'price',     que: 'La cifra. Sólo la publica una venta' },
    { clave: 'address',   que: 'La dirección; en un evento, el lugar' },
    { clave: 'phone',     que: 'El teléfono del agente' },
    { clave: 'cta',       que: 'Cómo apuntarse. Sólo en eventos' },
    { clave: 'agentName', que: 'El nombre del agente' },
    { clave: 'when',      que: 'Fecha y hora juntas' },
    { clave: 'whenDay',   que: 'Sólo la fecha — un cartel se lee mejor partido' },
    { clave: 'whenTime',  que: 'Sólo la hora' },
  ],
}

export const SPECS: GrupoDeClaves = {
  titulo: 'Especificaciones',
  forma:  '{{clave}}, cada una con SU icono dentro',
  claves: [
    { clave: 'statSqft',      que: 'La superficie' },
    { clave: 'statBedrooms',  que: 'Las habitaciones' },
    { clave: 'statBathrooms', que: 'Los baños' },
    { clave: 'stat1',         que: 'La primera que haya, sea cual sea. Sin icono' },
    { clave: 'stat2',         que: 'La segunda' },
    { clave: 'stat3',         que: 'La tercera' },
  ],
}

export const FRAGMENTOS: GrupoDeClaves = {
  titulo: 'Fragmentos ya marcados',
  forma:  '{{&clave}} — se inserta sin escapar',
  claves: [
    {
      clave: 'headlineRitmo',
      que:   'El titular con una palabra de cada dos en .palabra-fuerte',
    },
  ],
}

export const VARIABLES: GrupoDeClaves = {
  titulo: 'Colores y lienzo',
  forma:  'var(--nombre) en el CSS',
  claves: [
    { clave: 'brand',      que: 'El color de marca del cliente' },
    { clave: 'brand-dark', que: 'Ese color oscurecido, para la segunda banda' },
    { clave: 'ink',        que: 'El color del texto sobre fondo claro' },
    { clave: 'surface',    que: 'El fondo claro de la pieza' },
    { clave: 'logo',       que: 'Con el que se tiñe el logo' },
    { clave: 'on-brand',   que: 'Texto legible SOBRE el color de marca' },
    { clave: 'on-dark',    que: 'Texto legible sobre el color oscurecido' },
    { clave: 'on-photo',   que: 'Texto legible sobre una foto velada' },
    { clave: 'w',          que: 'El ancho del lienzo' },
    { clave: 'h',          que: 'El alto del lienzo' },
  ],
}

/**
 * Las clases que el motor pone en el `<html>` según los datos.
 *
 * Son el mecanismo para escribir CSS por caso —`html.sin-precio .titular{}`—, y
 * se aplican en producción sobre los datos reales, no sobre un escenario de
 * prueba. Es lo que sustituye al `photoHeight(blocks)` que tenía el editorial.
 */
export const CLASES_DE_ESTADO: ClaveDocumentada[] = [
  { clave: 'sin-hero',        que: 'No hay foto principal' },
  { clave: 'sin-foto-agente', que: 'El agente no tiene retrato' },
  { clave: 'sin-logo',        que: 'El cliente no tiene logo' },
  { clave: 'sin-precio',      que: 'La receta no publica cifra' },
  { clave: 'sin-cuando',      que: 'No hay fecha' },
  { clave: 'sin-direccion',   que: 'No hay dirección' },
  { clave: 'sin-telefono',    que: 'No hay teléfono' },
  { clave: 'sin-cta',         que: 'No hay registro' },
  { clave: 'sin-agente',      que: 'No hay nombre de agente' },
  { clave: 'sin-specs',       que: 'No hay especificaciones' },
  { clave: 'fotos-N',         que: 'Cuántas fotos hay contando el hero: de 0 a 4' },
  { clave: 'datos-N',         que: 'Cuántos bloques de texto hay que leer: de 1 a 6' },
]

export const GRUPOS: GrupoDeClaves[] = [IMAGENES, TEXTOS, SPECS, FRAGMENTOS, VARIABLES]

/** Dónde vive este diseño en el repo, para abrirlo en un IDE de verdad. */
export function rutaEnElRepo(clave: string): { html: string; css: string } {
  const base = `src/lib/studio/templates/seed/${clave || '<clave>'}`
  return { html: `${base}/template.html`, css: `${base}/template.css` }
}
