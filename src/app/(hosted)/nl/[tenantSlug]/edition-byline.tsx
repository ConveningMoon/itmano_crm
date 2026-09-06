import type { PublicEdition } from './shared'
import type { Pal } from './nl-chrome'

// La firma de una edición: la persona, la agencia, o las dos (migración 113).
// Compartida por la portada y la página de edición para que la misma firma no
// se pinte de dos maneras distintas a un clic de distancia.
//
// El orden es persona → agencia porque es el que lee un humano ("Por Adriana
// Melendez · A&J Real Estate Group"): primero quién escribe, después bajo qué
// marca. Sin firma personal, la agencia queda sola y sin círculo — un avatar
// junto al nombre de una empresa sugiere una persona que no existe.

/** Iniciales de respaldo cuando la persona que firma no tiene foto cargada. */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '·'
  const primera = partes[0][0] ?? ''
  const ultima  = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : ''
  return (primera + ultima).toUpperCase()
}

function Avatar({ name, url, P, size }: { name: string; url: string | null; P: Pal; size: number }) {
  const base: React.CSSProperties = {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', background: P.paperAlt,
  }

  if (!url) {
    return (
      <span style={{ ...base, fontSize: `${Math.round(size * 0.4)}px`, fontWeight: 700, color: P.textSoft }}>
        {inicialesDe(name)}
      </span>
    )
  }

  return (
    <span style={base}>
      {/* <img> y no next/image: la foto vive en el storage del tenant y estas
          páginas ya sirven así el logo y las portadas (ver nl-chrome), sin
          depender de que cada host nuevo entre en images.remotePatterns. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          // `top` y no `center`: agents.cover_photo_url es una foto vertical
          // de cuerpo entero (una portada, no un avatar). Centrarla recorta
          // la cara y publica un torso.
          objectPosition: 'center top',
        }}
      />
    </span>
  )
}

export function EditionByline({
  edition, P, size = 24, fontSize = 13,
}: {
  edition:   Pick<PublicEdition, 'author_name' | 'author_org_name' | 'author_avatar_url'>
  P:         Pal
  size?:     number
  fontSize?: number
}) {
  const persona = edition.author_name?.trim() || null
  const agencia = edition.author_org_name?.trim() || null
  if (!persona && !agencia) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      margin: '8px 0 0', fontSize: `${fontSize}px`, color: P.textFaint,
      minWidth: 0,
    }}>
      {persona && <Avatar name={persona} url={edition.author_avatar_url} P={P} size={size} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Por{' '}
        {/* rel="author" sólo sobre la persona: es la atribución que un buscador
            usa para construir E-E-A-T de alguien. La agencia ya va como
            `publisher` en el JSON-LD de la edición. */}
        {persona && <span rel="author" style={{ color: P.textSoft, fontWeight: 600 }}>{persona}</span>}
        {persona && agencia && ' · '}
        {agencia}
      </span>
    </div>
  )
}
