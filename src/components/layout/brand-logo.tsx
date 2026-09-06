import Image from 'next/image'
import { Building2 } from 'lucide-react'

// Logo de marca del shell (sidebar desktop + drawer móvil).
//   - Modo hub (super_admin sin tenant): wordmark de ITMANO forzado a blanco
//     vía CSS filter (el asset original es navy sobre transparente).
//   - Tenant con logo: la imagen guardada en tenants.logo_url (bucket
//     tenant-assets). <img> plano — el host de Storage no está en
//     images.remotePatterns y el asset ya viene dimensionado por el uploader.
//   - Tenant sin logo: placeholder neutro con el nombre del equipo.
export function BrandLogo({ logoUrl, tenantName, hubMode = false }: {
  logoUrl: string | null
  tenantName: string | null
  hubMode?: boolean
}) {
  if (hubMode) {
    return (
      <Image
        src="/itmano_banner.webp"
        alt="ITMANO"
        width={110}
        height={34}
        priority
        style={{
          objectFit: 'contain',
          objectPosition: 'left center',
          display: 'block',
          marginBottom: '8px',
          filter: 'brightness(0) invert(1)',
        }}
      />
    )
  }

  if (logoUrl) {
    return (
      // width/height son la CAJA máxima, no el tamaño intrínseco: el objectFit
      // 'contain' mantiene la proporción real del logo dentro de ella. `priority`
      // porque está en el encabezado del shell, visible en la primera pantalla de
      // todas las páginas.
      <Image
        src={logoUrl}
        alt={tenantName ?? 'Logo del equipo'}
        width={120}
        height={44}
        priority
        style={{
          maxWidth: '120px',
          maxHeight: '44px',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          objectPosition: 'left center',
          display: 'block',
          marginBottom: '8px',
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', minHeight: '44px' }}>
      <div
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <Building2 size={16} strokeWidth={1.6} />
      </div>
      <span
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '130px',
        }}
      >
        {tenantName ?? 'ITMANO CRM'}
      </span>
    </div>
  )
}
