import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsCard, SettingsRow } from '@/components/ui/settings-row'

describe('SettingsRow', () => {
  it('con hint pinta un ⓘ junto a la etiqueta', () => {
    const html = renderToStaticMarkup(
      <SettingsRow label="Zona" hint="Donde trabajas"><input /></SettingsRow>,
    )
    expect(html).toContain('info-hint')
    expect(html).toContain('aria-label="Más información sobre Zona"')
    expect(html).not.toContain('settings-row-hint')
  })

  it('el botón del ⓘ queda fuera del <label>', () => {
    const html = renderToStaticMarkup(
      <SettingsRow label="Zona" hint="Donde trabajas" htmlFor="zona"><input id="zona" /></SettingsRow>,
    )
    const label = html.match(/<label[^>]*>[\s\S]*?<\/label>/)
    expect(label).not.toBeNull()
    expect(label![0]).not.toContain('info-hint')
    expect(label![0]).not.toContain('<button')
    expect(html.indexOf('info-hint')).toBeGreaterThan(html.indexOf('</label>'))
  })

  it('sin hint no hay ⓘ', () => {
    const html = renderToStaticMarkup(<SettingsRow label="Zona"><input /></SettingsRow>)
    expect(html).not.toContain('info-hint')
  })

  it('con htmlFor la etiqueta es <label for>, sin él es <span>', () => {
    const con = renderToStaticMarkup(<SettingsRow label="Zona" htmlFor="z"><input id="z" /></SettingsRow>)
    expect(con).toContain('<label')
    expect(con).toContain('for="z"')
    const sin = renderToStaticMarkup(<SettingsRow label="Zona"><input /></SettingsRow>)
    expect(sin).not.toContain('<label')
    expect(sin).toContain('<span class="settings-row-label"')
  })
})

describe('SettingsCard', () => {
  it('con hint pinta el ⓘ junto al título, sin párrafo de bajada', () => {
    const html = renderToStaticMarkup(<SettingsCard title="Rangos" hint="Explicación"><div /></SettingsCard>)
    expect(html).toContain('info-hint')
    expect(html).toContain('aria-label="Más información sobre Rangos"')
    expect(html).not.toContain('settings-card-hint')
  })

  it('sin hint no hay ⓘ', () => {
    expect(renderToStaticMarkup(<SettingsCard title="Rangos"><div /></SettingsCard>)).not.toContain('info-hint')
  })
})
