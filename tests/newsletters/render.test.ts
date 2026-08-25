import { describe, it, expect } from 'vitest'
import { renderNewsletterHtml, escapeHtml } from '@/lib/newsletters/render'
import { NEWSLETTER_CONTENT_VERSION, type NewsletterContent } from '@/lib/newsletters/content'

const fuente = {
  id: 's1', url: 'https://nar.realtor/x', title: 'Informe NAR', publisher: 'NAR', accessed_at: '2026-08-24',
}

describe('escapeHtml', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })
})

describe('renderNewsletterHtml', () => {
  it('escapa el texto de usuario en cada tipo de bloque', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [
        { type: 'heading', level: 2, text: '<img src=x onerror=alert(1)>' },
        { type: 'paragraph', text: '<script>alert(1)</script>' },
        { type: 'quote', text: '<b>no</b>', attribution: '<i>tampoco</i>' },
      ],
    }
    const html = renderNewsletterHtml(content, [])
    expect(html).not.toContain('<script>')
    // Valida que los payloads no llegaron como elementos HTML. Este test no incluye bloques image
    // ni b legítimos, así que estas aserciones prueban escapado sin colisiones.
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renderiza los niveles de heading como h2 y h3', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [
        { type: 'heading', level: 2, text: 'Dos' },
        { type: 'heading', level: 3, text: 'Tres' },
      ],
    }
    const html = renderNewsletterHtml(content, [])
    expect(html).toContain('<h2>Dos</h2>')
    expect(html).toContain('<h3>Tres</h3>')
  })

  it('pinta las fuentes citadas al pie con su enlace', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'stat', label: 'Precio medio', value: '$385.000', sourceIds: ['s1'] }],
    }
    const html = renderNewsletterHtml(content, [fuente])
    expect(html).toContain('https://nar.realtor/x')
    expect(html).toContain('Informe NAR')
  })

  it('no pinta la seccion de fuentes cuando ninguna se cita', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'paragraph', text: 'Sin datos' }],
    }
    expect(renderNewsletterHtml(content, [fuente])).not.toContain('nar.realtor')
  })

  it('ignora una url de imagen que no sea http', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'image', url: 'javascript:alert(1)', alt: 'x' }],
    }
    expect(renderNewsletterHtml(content, [])).not.toContain('javascript:')
  })
})
