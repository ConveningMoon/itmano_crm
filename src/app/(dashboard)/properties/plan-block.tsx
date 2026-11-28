import Link from 'next/link'

// Bloqueo por plan que el Server Component entrega ya resuelto a la UI: el
// motivo (sin dólares) y, si un plan superior lo levanta, hacia dónde ir. La
// Server Action vuelve a validar; esto sólo explica.
export interface PlanBlock {
  message: string
  upgradeTo: string | null
}

export function PlanBlockNotice({ block }: { block: PlanBlock }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
        fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
      }}
    >
      <span>{block.message}</span>
      <Link href="/settings" className="btn btn-ghost">Cambiar de plan</Link>
    </div>
  )
}
