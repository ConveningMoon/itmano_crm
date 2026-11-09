import { Skeleton } from '@/components/ui/skeleton'

// Editor de plantillas: lista de diseños, código y vista previa (una columna
// en pantallas estrechas).
export default function TemplatesLoading() {
  return (
    <div className="studio-templates-skeleton" aria-busy="true" aria-label="Cargando editor de diseños">
      <div className="settings-card settings-stack settings-stack-tight">
        {[...Array(8)].map((_, i) => <Skeleton key={i} w="100%" h={28} r={6} />)}
      </div>
      <Skeleton w="100%" h={520} r={12} />
      <Skeleton w="100%" h={520} r={12} />
    </div>
  )
}
