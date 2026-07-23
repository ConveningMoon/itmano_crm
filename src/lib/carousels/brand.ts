// Sistema de diseño v2 de los carruseles, COMO CÓDIGO (es el producto/el motor,
// no dato del tenant). Paleta, lienzo, layout, íconos de línea y las reglas de
// copy que se inyectan en el prompt. La identidad por agente (handle, agencia)
// vive en la tabla carousel_brand_profiles, no aquí.

// ── Paleta estricta v2 ───────────────────────────────────────────────────────
export const PALETTE = {
  navy:     '#1B2A41', // títulos, texto dominante
  navySoft: '#33415A', // subtítulos
  gold:     '#BE9A54', // label/gancho, divisores, íconos, partículas
  goldDim:  '#D8C393', // partículas tenues
  cream:    '#FBF6EE', // fondo base
  creamDeep:'#F3EADD', // sombreado de textura
  stone:    '#8A8172', // acento neutro (gris piedra)
} as const

// ── Lienzo 4:5 vertical (Instagram) ──────────────────────────────────────────
export const CANVAS = { width: 1080, height: 1350 } as const
export const MARGIN = 96 // margen de seguridad para texto

// ── Fuentes empaquetadas (OFL, en ./fonts) ───────────────────────────────────
// Spectral (serif editorial, pesos estáticos) + Marcellus (display elegante de
// un peso). Se rasterizan a paths con opentype.js, así el render es determinista
// y no depende de fuentes del sistema en Vercel.
export const FONT_FILES = {
  title:    'Spectral-ExtraBold.ttf', // título grande dominante (navy)
  subtitle: 'Spectral-Medium.ttf',    // apoyo/subtítulo
  body:     'Spectral-Regular.ttf',   // líneas de impacto, pasos
  label:    'Marcellus-Regular.ttf',  // gancho dorado + footer @handle (mayúsculas)
} as const

export type FontRole = keyof typeof FONT_FILES

// ── Íconos de línea fina (data slides) ───────────────────────────────────────
// Inner SVG en coordenadas 0..100. El compositor los envuelve en un <g> con
// fill:none, stroke:gold, stroke-linecap/join redondos. Uno solo por slide,
// nunca varios (regla v2). El copy elige la clave; fallback: sin ícono.
export const ICONS: Record<string, string> = {
  house:    '<path d="M16 48 L50 20 L84 48"/><path d="M26 44 L26 82 L74 82 L74 44"/><path d="M43 82 L43 60 L57 60 L57 82"/>',
  key:      '<circle cx="34" cy="42" r="14"/><path d="M44 52 L78 86"/><path d="M66 74 L74 66"/><path d="M58 66 L66 58"/>',
  coin:     '<circle cx="50" cy="50" r="30"/><path d="M50 32 L50 68"/><path d="M60 40 C60 34 42 34 42 42 C42 50 58 50 58 58 C58 66 40 66 40 60"/>',
  chart:    '<path d="M24 24 L24 80 L82 80"/><path d="M32 68 L48 52 L60 62 L80 34"/><path d="M70 34 L80 34 L80 44"/>',
  calendar: '<rect x="22" y="26" width="56" height="52" rx="4"/><path d="M22 40 L78 40"/><path d="M36 20 L36 32"/><path d="M64 20 L64 32"/><path d="M34 54 L46 54"/><path d="M54 54 L66 54"/>',
  document: '<path d="M30 20 L60 20 L74 34 L74 82 L30 82 Z"/><path d="M60 20 L60 34 L74 34"/><path d="M40 50 L64 50"/><path d="M40 62 L64 62"/>',
  location: '<path d="M50 84 C50 84 74 60 74 42 A24 24 0 1 0 26 42 C26 60 50 84 50 84 Z"/><circle cx="50" cy="42" r="9"/>',
  trend:    '<path d="M22 70 L44 48 L58 60 L80 30"/><path d="M66 30 L80 30 L80 44"/>',
  clock:    '<circle cx="50" cy="50" r="30"/><path d="M50 32 L50 50 L64 60"/>',
  family:   '<circle cx="36" cy="38" r="10"/><circle cx="64" cy="38" r="10"/><path d="M22 78 C22 60 34 54 36 54 C38 54 50 60 50 78"/><path d="M50 78 C50 60 62 54 64 54 C66 54 78 60 78 78"/>',
  shield:   '<path d="M50 20 L78 30 L78 52 C78 70 64 80 50 84 C36 80 22 70 22 52 L22 30 Z"/><path d="M40 50 L48 58 L64 40"/>',
  scale:    '<path d="M50 24 L50 80"/><path d="M30 80 L70 80"/><path d="M24 36 L76 36"/><path d="M24 36 L16 54 L32 54 Z"/><path d="M76 36 L68 54 L84 54 Z"/>',
} as const

export const ICON_KEYS = Object.keys(ICONS)

// ── Reglas de copy v2 (se inyectan en el system prompt de Claude) ─────────────
// Resumen operativo del documento "Sistema de creación de carruseles v2". No es
// texto para el usuario final; es la instrucción de generación.
export const V2_COPY_RULES = `SISTEMA DE DISEÑO Y COPY v2 (obligatorio):
- El TEXTO es el protagonista. Un solo mensaje dominante por slide. Nunca tablas ni varias cifras en un mismo slide; si hay varios datos, repártelos en varios slides.
- Jerarquía por slide: (1) label/gancho pequeño arriba, dorado, tono "secreto/chisme"; (2) TÍTULO grande, SIEMPRE el elemento más grande y dominante, más grande que el gancho; (3) apoyo/subtítulo mediano debajo.
- Sin puntos al final de las oraciones dentro de los slides. Cada slide conecta con el siguiente como una sola narrativa continua (usa "→", preguntas que abren el siguiente slide).
- Tildes y "ñ" SIEMPRE correctas.
- Emojis permitidos con moderación para reforzar curiosidad (🤫 🔑 🏡 💰), nunca saturar.
- Tono "secreto/chisme": "lo que los noticieros no te dicen", "lo que nadie está conectando", "la razón que nadie te explicó".
- Portada (slide 1): el título es lo más viral/llamativo del carrusel. Si el gancho involucra algo reconocible (celebridad, evento, marca, ley con nombre, ciudad), NÓMBRALO explícitamente en el título — lo específico genera curiosidad, lo genérico no engancha.
- Estructura de 8 slides: 1) portada gancho+título; 2) dato/hecho inicial; 3) el giro/contradicción; 4) explicación/por qué; 5) tres líneas cortas de impacto (usa "lines", sin ícono); 6) conexión emocional/práctica (foto editorial); 7) tres pasos accionables (numerados en "lines"); 8) cierre/CTA con invitación a comentar palabra clave + seguir + guardar.
- Imágenes mínimas: SOLO portada, slide emocional (6) y cierre (8) llevan foto editorial (image_prompt). Los slides de dato/texto usan fondo procedural (image_prompt = null) y, si aporta, UN ícono de línea (campo "icon").
- Footer @handle en todos los slides (lo pone el motor); la agencia solo en portada y cierre (lo pone el motor). No los repitas en el copy.
- Caption: gancho de 1–2 líneas + resumen fluido (no lista mecánica) de lo que cubre el carrusel + CTA (comentar palabra clave + seguir + guardar) + EXACTAMENTE 5 hashtags relevantes.`

// Regla dura anti-invención de datos (crítica de cumplimiento).
export const DATA_INTEGRITY_RULE = `REGLA DURA DE DATOS: nunca inventes cifras, estadísticas, testimonios ni citas. Si el carrusel usa un dato (tasas, inventario, precios, tendencias), debe venir de una fuente real y citable (NAR, Zillow, Freddie Mac, REIN, Virginia Housing, una noticia real). Si no tienes una fuente real para un número, NO uses el número: reescribe el slide en términos cualitativos. Prefiere ángulos de curiosidad/estrategia/cultura sobre cifras cuando no haya fuente.`

// Regla dura de cumplimiento de imagen (personas reales).
export const IMAGE_COMPLIANCE_RULE = `Los image_prompt NUNCA deben pedir una foto o retrato reconocible de una persona real, famosa o figura pública. Si el tema involucra a una celebridad o su casa, el prompt describe una escena/arquitectura INSPIRADA en el estilo (una mansión de lujo editorial, un estadio, etc.), jamás un intento de parecido de la persona. Sin rostros identificables reales. Máximo 1000 caracteres por prompt.`

// Íconos disponibles, para listarlos en el prompt.
export const ICON_HINT = `Claves de ícono disponibles (elige a lo sumo una por data slide, o null): ${ICON_KEYS.join(', ')}.`

// ── Pilares de contenido (para rotar el ángulo y no repetir) ─────────────────
// Tomados del sistema v2 de Adriana (fuentes de temas). El copy clasifica cada
// carrusel en uno; al generar se pide rotar a un pilar distinto del reciente.
export const CAROUSEL_PILLARS = [
  'market_data', 'pop_culture', 'gossip_curiosity', 'law_policy', 'financial_strategy', 'cultural_family', 'other',
] as const
export type CarouselPillar = typeof CAROUSEL_PILLARS[number]

export const PILLAR_LABELS: Record<string, string> = {
  market_data:        'Datos de mercado',
  pop_culture:        'Cultura pop',
  gossip_curiosity:   'Chisme / curiosidad',
  law_policy:         'Ley / política',
  financial_strategy: 'Estrategia financiera',
  cultural_family:    'Cultural / familiar',
  other:              'Otro',
}

// Guía de pilares para el prompt de copy (con ejemplos del doc v2).
export const PILLAR_HINT = `PILARES DE CONTENIDO (para variar el ángulo, no repetir siempre el mismo tipo):
- market_data: datos duros de mercado (tasas, inventario, precios) — con moderación.
- pop_culture: tendencia popular NO financiera conectada creativamente (artista, serie, evento deportivo, Mundial 2026, noticia de celebridad).
- gossip_curiosity: historia de "chisme"/curiosidad genuina ("lo que nadie te dice").
- law_policy: ley o política pública explicada simple.
- financial_strategy: estrategia financiera poco conocida (house hopping, 15 vs 30 años…).
- cultural_family: diferencias culturales/familiares (casa multigeneracional, Familia Mortgage).
Clasifica el carrusel con UNO de estos valores en el campo "pillar".`
