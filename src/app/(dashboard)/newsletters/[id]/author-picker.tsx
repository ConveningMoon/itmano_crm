'use client'

// Selector de quién firma la edición. Desde la migración 113 son DOS firmas
// independientes, no una elección entre dos: la persona y la agencia. El
// desplegable anterior obligaba a renunciar a una de ellas — firmar sólo con
// el agente pierde la marca, firmar sólo con la agencia no posiciona a nadie.
//
// "Sin firma personal" no es un vacío pendiente de rellenar: es una elección
// válida, igual que desmarcar la agencia. Se puede publicar sin ninguna.

export type AuthorOption = {
  id: string
  name: string
  /** agents.cover_photo_url. La mayoría de agentes no tiene foto todavía. */
  coverPhotoUrl?: string | null
}

/** Iniciales para el círculo cuando la persona no tiene foto. */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '·'
  const primera = partes[0][0] ?? ''
  const ultima  = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : ''
  return (primera + ultima).toUpperCase()
}

/**
 * El círculo de la firma: foto si la hay, iniciales si no. El mismo par
 * foto/iniciales que se publica en la web del cliente, para que lo que el
 * editor muestra sea lo que el lector va a ver.
 */
export function AuthorAvatar({
  name, photoUrl, size = 26,
}: {
  name:      string
  photoUrl:  string | null | undefined
  size?:     number
}) {
  const base: React.CSSProperties = {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%',
    flexShrink: 0, overflow: 'hidden', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-elevated, #22252A)',
  }

  if (photoUrl) {
    return (
      <span style={base}>
        {/* <img> y no next/image a propósito: la URL viene del storage del
            tenant y aquí es un adorno de 26px dentro del CRM — no justifica
            pasar por el optimizador ni por images.remotePatterns. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          // `top` y no `center`: la foto del agente suele ser vertical y de
          // cuerpo entero (es una portada, no un avatar), así que centrarla
          // recorta la cara y deja el torso.
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
        />
      </span>
    )
  }

  return (
    <span style={{
      ...base,
      fontSize: `${Math.round(size * 0.4)}px`, fontWeight: 600,
      color: 'var(--text-secondary)', letterSpacing: '0.02em',
    }}>
      {inicialesDe(name)}
    </span>
  )
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: '6px',
}

export function AuthorPicker({
  agents, value, signWithOrg, tenantName, onChange, onSignWithOrgChange, disabled,
}: {
  agents:               AuthorOption[]
  value:                string | null
  signWithOrg:          boolean
  tenantName:           string
  onChange:             (agentId: string | null) => void
  onSignWithOrgChange:  (signWithOrg: boolean) => void
  disabled?:            boolean
}) {
  const agente = agents.find(a => a.id === value) ?? null

  // Lo que va a leer el visitante, montado con las mismas piezas que la página
  // pública: el editor no debería obligar a publicar para saber cómo queda.
  const firmas = [agente?.name, signWithOrg ? tenantName : null].filter(Boolean) as string[]

  return (
    <div>
      <span style={LABEL_STYLE}>Firma</span>

      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value || null)}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: '8px',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
          color: 'var(--text-primary)', fontSize: '13px',
        }}
      >
        <option value="">Sin firma personal</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      <label style={{
        display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px',
        fontSize: '13px', color: 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}>
        <input
          type="checkbox"
          checked={signWithOrg}
          disabled={disabled}
          onChange={e => onSignWithOrgChange(e.target.checked)}
          style={{ accentColor: 'var(--accent-gold)', cursor: 'inherit' }}
        />
        Firmar también con {tenantName || 'la agencia'}
      </label>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px',
        minHeight: '26px', fontSize: '12.5px', color: 'var(--text-secondary)',
      }}>
        {firmas.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Se publicará sin firma.</span>
        ) : (
          <>
            {agente && <AuthorAvatar name={agente.name} photoUrl={agente.coverPhotoUrl} />}
            <span>Por {firmas.join(' · ')}</span>
          </>
        )}
      </div>

      <span style={{
        display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px',
      }}>
        Quién firma esta edición en la web. Aparece en la página pública y es lo que
        asocia el contenido a esa persona en los buscadores. La foto sale de la que
        el agente tenga en Ajustes → Agentes.
      </span>
    </div>
  )
}
