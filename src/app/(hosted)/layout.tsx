// Layout de las páginas alojadas por ITMANO (lm/events/forms/properties
// .itmano.com — migración 060). Público, sin nav del CRM ni de marketing:
// la página entera es del tenant (su marca, no la de ITMANO).
export default function HostedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {children}
    </div>
  )
}
