import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHART_TEXT, GOLD_RAMP, STAGE_HEX } from '@/lib/charts/palette'

// La paleta del CRM vive en un solo archivo y se cambia a menudo. Estas pruebas
// fijan lo que no debe romperse al tocarla: las páginas públicas conservan su
// identidad y ningún token de texto cae por debajo del contraste legible.

// Sin CRLF: el repo se trabaja desde Windows y Mac.
const css = readFileSync(path.resolve(__dirname, '../../src/app/globals.css'), 'utf8').replace(/\r\n/g, '\n')

const REMAP: Record<string, string> = {
  '--accent-blue': '#E6CF9A', '--accent-teal': '#B8A37A', '--accent-pink': '#A89878',
  '--accent-green': '#F8E7BC', '--accent-coral': '#D98A78',
  '--status-new': '#F8E7BC', '--status-nurturing': '#DDB968', '--status-warm': '#DDB968',
  '--status-hot': '#F8E7BC', '--status-process-started': '#B08D45',
  '--status-process-completed': '#C9A96E', '--status-closed': '#C9A96E', '--status-lost': '#A89878',
  '--quality-media': '#B08D45',
}

const ORIGINAL: Record<string, string> = {
  '--accent-blue': '#5B8EC9', '--accent-teal': '#5AAFA0', '--accent-pink': '#B87BA3',
  '--accent-green': '#6BA368', '--accent-coral': '#C97B6B',
  '--status-new': '#5B8EC9', '--status-nurturing': '#C9A96E', '--status-warm': '#E07B3A',
  '--status-hot': '#E04040', '--status-process-started': '#9B72CF',
  '--status-process-completed': '#6BA368', '--status-closed': '#4A9B6B', '--status-lost': '#C97B6B',
  '--destructive': '#C97B6B', '--quality-media': '#C9A96E',
}

const SURFACES = ['#111215', '#16181C', '#1C1F24']

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `falta el bloque ${selector}`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('\n}', start))
}

function tokenValue(source: string, token: string): string | undefined {
  return source.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1].trim()
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('tokens de color', () => {
  it('el CRM usa la paleta dorada', () => {
    const root = block(':root')
    for (const [token, value] of Object.entries(REMAP)) {
      expect(tokenValue(root, token), token).toBe(value)
    }
  })

  it('marketing y login conservan los colores originales', () => {
    const publicScope = block('.mk-root,\n.brand-original')
    for (const [token, value] of Object.entries(ORIGINAL)) {
      expect(tokenValue(publicScope, token), token).toBe(value)
    }
  })

  it('todo token de texto mantiene 4.5:1 sobre las superficies oscuras', () => {
    for (const [token, value] of Object.entries(REMAP)) {
      for (const surface of SURFACES) {
        expect(contrast(value, surface), `${token} sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('correcto y advertencia se distinguen', () => {
    expect(contrast(REMAP['--accent-green'], '#C9A96E')).toBeGreaterThanOrEqual(1.5)
  })

  it('la rampa de las gráficas coincide con los tokens', () => {
    const root = block(':root')
    GOLD_RAMP.forEach((hex, i) => expect(tokenValue(root, `--gold-${i + 1}`)).toBe(hex))
  })

  it('STAGE_HEX coincide con los tokens --status-*', () => {
    const root = block(':root')
    const tokenOf = {
      nuevo: '--status-new', nutricion: '--status-nurturing', en_proceso: '--status-process-started',
      cerrado: '--status-closed', perdido: '--status-lost',
    } as const
    for (const [stage, token] of Object.entries(tokenOf)) {
      expect(STAGE_HEX[stage as keyof typeof tokenOf], stage).toBe(tokenValue(root, token))
    }
  })

  it('CHART_TEXT coincide con --text-muted y --text-secondary', () => {
    const root = block(':root')
    expect(CHART_TEXT.muted).toBe(tokenValue(root, '--text-muted'))
    expect(CHART_TEXT.secondary).toBe(tokenValue(root, '--text-secondary'))
  })

  it('--status-hot no se usa para errores: sólo donde significa calidad alta', () => {
    const srcRoot = path.resolve(__dirname, '../../src')
    const allowed = [
      'app/(dashboard)/admin/page.tsx', 'app/(dashboard)/admin/tenant-card.tsx',
      'app/(dashboard)/analytics/page.tsx', 'app/(dashboard)/dashboard/page.tsx',
      'app/(dashboard)/settings/business-profile-section.tsx', 'app/(marketing)/landing.css',
      'app/globals.css', 'components/marketing/landing/crm-views.tsx', 'lib/scoring/priority.ts',
    ]
    const users = (readdirSync(srcRoot, { recursive: true }) as string[])
      .map(f => f.split(path.sep).join('/'))
      .filter(f => /\.(tsx?|css)$/.test(f))
      .filter(f => readFileSync(path.join(srcRoot, f), 'utf8').includes('--status-hot'))
    expect(users.filter(f => !allowed.includes(f))).toEqual([])
  })

  it('@theme no fija el hex de los acentos', () => {
    const theme = block('@theme inline')
    for (const name of ['blue', 'teal', 'coral', 'pink', 'green']) {
      expect(tokenValue(theme, `--color-accent-${name}`)).toBe(`var(--accent-${name})`)
    }
  })
})
