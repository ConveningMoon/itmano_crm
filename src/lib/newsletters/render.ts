import 'server-only'
import { sourceLabel } from './content'
import type { NewsletterContent, NewsletterSource } from './content'

// Compilador único de bloques → HTML. Lo usan la página pública y la vista
// previa del editor. Nunca dupliques esta lógica en otro lado.
//
// Seguridad: TODO texto que venga del usuario o de una IA se escapa antes de
// interpolar. Es lo que permite que el contenido se guarde como datos y no como
// HTML: aquí no hay nada que sanear porque nada llega ya marcado.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Sólo http(s). Corta javascript:, data: y cualquier otro esquema. */
function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function renderNewsletterHtml(
  content: NewsletterContent,
  sources: NewsletterSource[],
): string {
  const cited = new Set<string>()
  const parts: string[] = []

  for (const block of content.blocks) {
    switch (block.type) {
      case 'heading':
        parts.push(`<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`)
        break
      case 'paragraph':
        block.sourceIds?.forEach(id => cited.add(id))
        parts.push(`<p>${escapeHtml(block.text)}</p>`)
        break
      case 'list': {
        const tag   = block.style === 'number' ? 'ol' : 'ul'
        const items = block.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')
        parts.push(`<${tag}>${items}</${tag}>`)
        break
      }
      case 'image': {
        const url = safeUrl(block.url)
        if (!url) break
        const caption = block.caption
          ? `<figcaption>${escapeHtml(block.caption)}</figcaption>`
          : ''
        parts.push(
          `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt)}" loading="lazy" />${caption}</figure>`,
        )
        break
      }
      case 'quote': {
        const attribution = block.attribution
          ? `<cite>${escapeHtml(block.attribution)}</cite>`
          : ''
        parts.push(`<blockquote><p>${escapeHtml(block.text)}</p>${attribution}</blockquote>`)
        break
      }
      case 'callout':
        parts.push(
          `<aside class="nl-callout nl-callout-${block.tone}">${escapeHtml(block.text)}</aside>`,
        )
        break
      case 'stat':
        block.sourceIds?.forEach(id => cited.add(id))
        parts.push(
          `<div class="nl-stat"><span class="nl-stat-value">${escapeHtml(block.value)}</span>` +
          `<span class="nl-stat-label">${escapeHtml(block.label)}</span></div>`,
        )
        break
    }
  }

  // Sólo se listan las fuentes REALMENTE citadas: una lista con fuentes que el
  // texto no usa es ruido que aparenta rigor.
  const used = sources.filter(s => cited.has(s.id))
  if (used.length > 0) {
    const items = used.map(s => {
      const url = safeUrl(s.url)
      const label = escapeHtml(sourceLabel(s))
      return url
        ? `<li><a href="${escapeHtml(url)}" rel="nofollow noopener" target="_blank">${label}</a></li>`
        : `<li>${label}</li>`
    }).join('')
    parts.push(`<section class="nl-sources"><h2>Fuentes</h2><ol>${items}</ol></section>`)
  }

  return parts.join('\n')
}
