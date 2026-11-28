import { MIN_CLOSES_FOR_EVIDENCE } from './calibration'

// ── Salud del scoring de un tenant ───────────────────────────────────────────
//
// Convierte los conteos de `scoring_health(tenant_id)` en un veredicto que se
// lee de un vistazo: ¿el score de este tenant distingue a sus leads? Y si no,
// por qué. La idea es que nadie tenga que revisar la lista de reglas para darse
// cuenta de que algo no funciona: el Centro de control lo dice solo.
//
// Módulo PURO.

/** Un canal de la cartera activa (o los leads sin canal, con channelId null). */
export interface ChannelHealth {
  channelId:          string | null
  name:               string | null
  channelType:        string | null
  /** El canal inscribe en una secuencia a los leads que llegan. */
  channelHasSequence: boolean
  leads:              number
  withFit:            number
  /** Leads en el puntaje donde empata más gente (`modeScore`). */
  atMode:             number
  /** Leads que pasaron alguna vez por una secuencia (activa, pausada o terminada). */
  inSequence:         number
  /** Sin perfil y sin secuencia: no tienen de dónde sumar puntos. */
  stuck:              number
  /** La fuente hace preguntas de filtrado (false para los leads sin canal). */
  asksFitQuestions:   boolean
  /** Leads de los últimos 90 días de esta fuente, en cualquier etapa. */
  recentLeads:        number
  recentWithFit:      number
}

export interface ScoringHealthRaw {
  activeLeads:      number
  activeWithFit:    number
  distinctScores:   number
  topTie:           number
  /** Puntaje con más leads empatados; null sin cartera activa. */
  modeScore:        number | null
  recentLeads:      number
  recentWithFit:    number
  /** Leads de fuentes con preguntas de filtrado (ver src/lib/sources/fit-questions.ts). */
  recentFormLeads:   number
  recentFormWithFit: number
  activeFormLeads:   number
  activeFormWithFit: number
  channels:         ChannelHealth[]
  closes:           number
  closesWithFit:    number
  manualActions90d: number
  overrides:        number
  bands: {
    p20: number; p40: number; p60: number; p80: number
    activeLeads: number
    degenerate:  boolean
    computedAt:  string
  } | null
}

export type HealthLevel = 'info' | 'atencion' | 'problema'

/** Cómo se están calculando hoy las bandas de calidad del tenant. */
export type BandMode = 'quintiles' | 'fijos_pocos_leads' | 'fijos_sin_senal' | 'sin_calcular'

export interface HealthFinding {
  code:   'bandas_sin_senal' | 'empate_amplio' | 'sin_nutricion' | 'poco_perfil' | 'pocos_leads' | 'sin_acciones' | 'sin_cartera'
  level:  HealthLevel
  title:  string
  detail: string
  /** Desglose opcional (uno por canal), para no meterlo todo en una frase. */
  items?: string[]
}

export interface ScoringHealth {
  raw:       ScoringHealthRaw
  /** El peor nivel entre los hallazgos; 'info' si todo está bien. */
  level:     HealthLevel
  bandMode:  BandMode
  /** % de leads de fuentes con filtrado (recientes, o activos si no hay recientes) con perfil. */
  fitCoverage: number | null
  /** Sobre cuántos leads se calculó fitCoverage. */
  fitCoverageBase: number
  /** Qué leads forman la base: los de 90 días o, si no entró ninguno, los activos. */
  fitCoverageScope: 'recientes' | 'activos'
  calibration: { closesWithFit: number; needed: number; ready: boolean }
  findings:  HealthFinding[]
}

/** Mínimo de leads activos para que los quintiles signifiquen algo (igual que leads_list). */
export const MIN_LEADS_FOR_QUINTILES = 20

/** Leads atascados (sin perfil ni secuencia) a partir de los cuales un canal se señala. */
export const MIN_STUCK_PER_CHANNEL = 5

/** Leads mínimos de una fuente con filtrado para juzgar su cobertura de perfil. */
export const MIN_LEADS_PER_SOURCE = 5

/** Parte de la cartera activa empatada en un puntaje a partir de la cual se explica el empate. */
export const WIDE_TIE_SHARE = 0.5

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function parseChannel(v: unknown): ChannelHealth {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    channelId:          str(o.channel_id),
    name:               str(o.name),
    channelType:        str(o.channel_type),
    channelHasSequence: o.channel_has_sequence === true,
    leads:              num(o.leads),
    withFit:            num(o.with_fit),
    atMode:             num(o.at_mode),
    inSequence:         num(o.in_sequence),
    stuck:              num(o.stuck),
    asksFitQuestions:   o.asks_fit_questions === true,
    recentLeads:        num(o.recent_leads),
    recentWithFit:      num(o.recent_with_fit),
  }
}

/** Nombre legible de un canal; los leads sin canal suelen ser importados o creados a mano. */
export function channelLabel(c: Pick<ChannelHealth, 'channelId' | 'name'>): string {
  if (c.channelId === null) return 'Sin canal (importados o creados a mano)'
  return c.name ?? 'Canal sin nombre'
}

/** Une una lista en español: "a", "a y b", "a, b y c". */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/** Lee el JSON de `scoring_health` sin confiar en su forma. */
export function parseScoringHealth(json: unknown): ScoringHealthRaw {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const b = (o.bands && typeof o.bands === 'object' ? o.bands : null) as Record<string, unknown> | null
  return {
    activeLeads:      num(o.active_leads),
    activeWithFit:    num(o.active_with_fit),
    distinctScores:   num(o.distinct_scores),
    topTie:           num(o.top_tie),
    modeScore:        typeof o.mode_score === 'number' && Number.isFinite(o.mode_score) ? o.mode_score : null,
    recentLeads:      num(o.recent_leads),
    recentWithFit:    num(o.recent_with_fit),
    recentFormLeads:   num(o.recent_form_leads),
    recentFormWithFit: num(o.recent_form_with_fit),
    activeFormLeads:   num(o.active_form_leads),
    activeFormWithFit: num(o.active_form_with_fit),
    channels:         Array.isArray(o.channels) ? o.channels.map(parseChannel) : [],
    closes:           num(o.closes),
    closesWithFit:    num(o.closes_with_fit),
    manualActions90d: num(o.manual_actions_90d),
    overrides:        num(o.overrides),
    bands: b ? {
      p20: num(b.p20), p40: num(b.p40), p60: num(b.p60), p80: num(b.p80),
      activeLeads: num(b.active_leads),
      degenerate:  b.degenerate === true,
      computedAt:  typeof b.computed_at === 'string' ? b.computed_at : '',
    } : null,
  }
}

const RANK: Record<HealthLevel, number> = { info: 0, atencion: 1, problema: 2 }

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export function assessScoringHealth(raw: ScoringHealthRaw): ScoringHealth {
  const findings: HealthFinding[] = []

  // ── Modo de las bandas ──────────────────────────────────────────────────
  let bandMode: BandMode
  if (!raw.bands) bandMode = 'sin_calcular'
  else if (raw.bands.activeLeads < MIN_LEADS_FOR_QUINTILES) bandMode = 'fijos_pocos_leads'
  else if (raw.bands.degenerate) bandMode = 'fijos_sin_senal'
  else bandMode = 'quintiles'

  // De dónde sale el empate: sin esto la alerta dice qué pasa pero no qué
  // tocar. Los tres canales con más leads en el puntaje repetido bastan.
  const origen = raw.channels
    .filter(c => c.atMode > 0)
    .sort((a, b) => b.atMode - a.atMode)
    .slice(0, 3)
    .map(c => `${channelLabel(c)} (${c.atMode})`)
  const deDonde = origen.length > 0 ? `Vienen sobre todo de ${joinEs(origen)}. ` : ''
  const puntaje = raw.modeScore === null ? '' : ` (${raw.modeScore} puntos)`
  const empate = pct(raw.topTie, raw.activeLeads)

  if (raw.activeLeads === 0) {
    findings.push({
      code: 'sin_cartera', level: 'info',
      title: 'Sin cartera activa',
      detail: 'No hay leads en Nuevo o Nutrición, así que no hay nada que clasificar todavía.',
    })
  } else if (bandMode === 'fijos_sin_senal') {
    // Desde la migración 20261128130000 sólo pasa si NADIE se separa del
    // grueso: un empate grande con leads claramente por encima ya no lo es.
    findings.push({
      code: 'bandas_sin_senal', level: 'problema',
      title: 'La calidad no distingue entre leads',
      detail: `${empate}% de la cartera activa tiene exactamente el mismo puntaje${puntaje} y ningún lead se separa `
        + `claramente del resto. ${deDonde}`
        + 'Mientras sea así se usan los cortes fijos, que no inventan diferencias que no existen.',
    })
  } else if (bandMode === 'fijos_pocos_leads') {
    findings.push({
      code: 'pocos_leads', level: 'info',
      title: 'Cortes fijos por ahora',
      detail: `Con menos de ${MIN_LEADS_FOR_QUINTILES} leads activos no se reparte la cartera en quintiles: se usan cortes fijos (80, 60, 35, 15).`,
    })
  } else if (bandMode === 'quintiles' && raw.topTie >= raw.activeLeads * WIDE_TIE_SHARE) {
    // Las bandas funcionan (los de arriba se separan), pero media cartera
    // comparte puntaje. Si el empate viene de fuentes que sólo registran, es lo
    // esperable mientras no interactúen; si viene de fuentes que filtran, algo
    // no está llegando.
    const desdeRegistro = raw.channels.filter(c => !c.asksFitQuestions).reduce((s, c) => s + c.atMode, 0)
    const esperable = desdeRegistro * 2 >= raw.topTie
    findings.push({
      code: 'empate_amplio', level: esperable ? 'info' : 'atencion',
      title: 'Media cartera empatada',
      detail: `${empate}% de la cartera activa comparte el mismo puntaje${puntaje}. ${deDonde}`
        + 'Las bandas igual separan a los que están por encima; los empatados quedan juntos en la banda más baja que tocan '
        + (esperable
          ? 'hasta que interactúen con los correos. Es normal en registros sin preguntas de filtrado.'
          : 'hasta que algo los diferencie. Revisa que esas fuentes estén recibiendo las respuestas de filtrado.'),
    })
  }

  // ── Leads sin forma de sumar ────────────────────────────────────────────
  // Una fuente que sólo registra (la asistencia a un evento, por ejemplo) no
  // pregunta perfil a propósito: la señal de sus leads tiene que venir
  // después, de los correos (clics, respuestas, otro recurso). Si además no
  // están en ninguna secuencia, se quedan para siempre con el puntaje del
  // registro. Las fuentes que filtran se juzgan abajo, por su perfil.
  const atascados = raw.channels.filter(c => !c.asksFitQuestions && c.stuck >= MIN_STUCK_PER_CHANNEL)
  if (atascados.length > 0) {
    const total = atascados.reduce((s, c) => s + c.stuck, 0)
    const sinSecuencia = atascados.filter(c => c.channelId !== null && !c.channelHasSequence).map(channelLabel)
    findings.push({
      code: 'sin_nutricion', level: 'atencion',
      title: 'Leads sin forma de sumar puntos',
      detail: `${total} leads activos de fuentes sin preguntas de filtrado no han pasado por una secuencia de correo. `
        + 'Sin correos no pueden hacer clic, responder ni pedir otro recurso, así que se quedan con el puntaje '
        + 'con el que entraron. Inscríbelos en una secuencia'
        + (sinSecuencia.length > 0 ? ` y asigna una a ${joinEs(sinSecuencia)} para los que lleguen después.` : '.'),
      items: atascados.map(c =>
        `${channelLabel(c)}: ${c.stuck} de ${c.leads}`
        + (c.channelId === null ? '' : c.channelHasSequence ? ' · la fuente tiene secuencia, pero no entraron' : ' · la fuente no tiene secuencia'),
      ),
    })
  }

  // ── Perfil declarado ────────────────────────────────────────────────────
  // Sólo en las fuentes marcadas con preguntas de filtrado (Fuentes → Editar).
  // Las que sólo registran no cuentan: no preguntan a propósito. Los leads
  // recientes dicen si el problema sigue ocurriendo; si no entró ninguno en 90
  // días, la cartera activa es lo único que hay.
  const fitCoverageScope = raw.recentFormLeads > 0 ? 'recientes' : 'activos'
  const base = fitCoverageScope === 'recientes' ? raw.recentFormLeads : raw.activeFormLeads
  const conPerfil = fitCoverageScope === 'recientes' ? raw.recentFormWithFit : raw.activeFormWithFit
  const fitCoverage = base > 0 ? pct(conPerfil, base) : null

  // Fuente por fuente: una que dice filtrar y llega casi sin perfil es un
  // formulario roto (o con las preguntas opcionales), aunque el total salga bien.
  const rotas = raw.channels
    .filter(c => c.asksFitQuestions)
    .map(c => {
      const total = fitCoverageScope === 'recientes' ? c.recentLeads : c.leads
      const con   = fitCoverageScope === 'recientes' ? c.recentWithFit : c.withFit
      return { c, total, con, cobertura: pct(con, total) }
    })
    .filter(x => x.total >= MIN_LEADS_PER_SOURCE && x.cobertura < 60)
    .sort((a, b) => a.cobertura - b.cobertura)

  const nivelTotal: HealthLevel | null =
    fitCoverage === null || base < 5 ? null : fitCoverage < 30 ? 'problema' : fitCoverage < 60 ? 'atencion' : null
  if (nivelTotal || rotas.length > 0) {
    const ventana = fitCoverageScope === 'recientes' ? 'de los últimos 90 días' : 'activos'
    findings.push({
      code: 'poco_perfil', level: nivelTotal ?? 'atencion',
      title: nivelTotal ? 'Pocos leads con perfil' : 'Una fuente con filtrado llega sin perfil',
      detail: (nivelTotal
        ? `Sólo ${conPerfil} de ${base} leads ${ventana} de fuentes con preguntas de filtrado tienen perfil (cuándo compra, cómo paga, presupuesto…). `
        : 'En conjunto las fuentes con filtrado traen perfil, pero no todas. ')
        + 'Revisa que esos formularios envíen las respuestas o que no sean opcionales; '
        + 'si una fuente no pregunta a propósito, márcala como «solo registro» en Fuentes.',
      items: rotas.length > 0
        ? rotas.map(x => `${channelLabel(x.c)}: ${x.con} de ${x.total} con perfil`)
        : undefined,
    })
  }

  // ── Acciones del agente ─────────────────────────────────────────────────
  if (raw.activeLeads > 0 && raw.manualActions90d === 0) {
    findings.push({
      code: 'sin_acciones', level: 'info',
      title: 'Nadie registra acciones a mano',
      detail: 'En 90 días no se registró ninguna visita, cita ni propuesta. Esa parte del modelo no suma: la calidad sale sólo del perfil y la actividad.',
    })
  }

  const level = findings.reduce<HealthLevel>((max, f) => (RANK[f.level] > RANK[max] ? f.level : max), 'info')

  return {
    raw,
    level,
    bandMode,
    fitCoverage,
    fitCoverageBase: base,
    fitCoverageScope,
    calibration: {
      closesWithFit: raw.closesWithFit,
      needed:        MIN_CLOSES_FOR_EVIDENCE,
      ready:         raw.closesWithFit >= MIN_CLOSES_FOR_EVIDENCE,
    },
    findings,
  }
}

export const BAND_MODE_LABEL: Record<BandMode, string> = {
  quintiles:         'Quintiles de la cartera',
  fijos_pocos_leads: 'Cortes fijos (pocos leads)',
  fijos_sin_senal:   'Cortes fijos (sin señal)',
  sin_calcular:      'Sin calcular todavía',
}

export const HEALTH_LEVEL_LABEL: Record<HealthLevel, string> = {
  info:     'Funciona',
  atencion: 'Mejorable',
  problema: 'Requiere atención',
}
