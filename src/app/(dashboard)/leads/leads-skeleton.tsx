import { Skeleton } from '@/components/ui/skeleton'
import { DataScope } from '@/components/ui/data-table'
import { TABLE_COLS, TABLE_COLS_MD, TABLE_COLS_SM } from './leads-table-cols'

// Forma de la lista de leads mientras llega: toolbar, resumen y la tabla con las
// mismas columnas que la real. Lo usan loading.tsx y el Suspense de la página.
export function LeadsListSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando leads">
      <div className="toolbar">
        <div className="toolbar-group">
          <Skeleton w="240px" h={36} r={9} />
          <span className="max-md:hidden"><Skeleton w="160px" h={36} r={9} /></span>
          <span className="max-md:hidden"><Skeleton w="160px" h={36} r={9} /></span>
          <Skeleton w="96px" h={34} r={8} />
        </div>
        <div className="toolbar-group">
          <Skeleton w="230px" h={36} r={10} />
          <Skeleton w="160px" h={36} r={10} />
        </div>
      </div>
      <div className="leads-summary">
        <Skeleton w="220px" h={12} r={3} />
      </div>

      <DataScope cols={TABLE_COLS} colsMd={TABLE_COLS_MD} colsSm={TABLE_COLS_SM}>
        <div className="dt-grid dt-head">
          <Skeleton w="14px" h={14} r={3} />
          <Skeleton w="40px" h={10} r={3} />
          <span className="dt-hide-md"><Skeleton w="50px" h={10} r={3} /></span>
          <span className="dt-hide-sm"><Skeleton w="44px" h={10} r={3} /></span>
          <span className="dt-hide-md"><Skeleton w="50px" h={10} r={3} /></span>
          <span className="dt-hide-sm"><Skeleton w="50px" h={10} r={3} /></span>
          <span className="dt-hide-md"><Skeleton w="36px" h={10} r={3} /></span>
          <span className="dt-hide-sm"><Skeleton w="40px" h={10} r={3} /></span>
          <span className="dt-show-sm"><Skeleton w="44px" h={10} r={3} /></span>
        </div>
        <div className="dt">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="dt-grid dt-row">
              <Skeleton w="14px" h={14} r={3} />
              <div className="lead-who">
                <Skeleton w="32px" h={32} r={50} />
                <div className="dt-cell-main">
                  <Skeleton w="120px" h={12} r={3} />
                  <span className="dt-sub"><Skeleton w="150px" h={10} r={3} /></span>
                </div>
              </div>
              <span className="dt-hide-md"><Skeleton w="70px" h={12} r={3} /></span>
              <span className="dt-hide-sm"><Skeleton w="80px" h={22} r={5} /></span>
              <span className="dt-hide-md"><Skeleton w="90px" h={12} r={3} /></span>
              <span className="dt-hide-sm"><Skeleton w="60px" h={12} r={3} /></span>
              <span className="dt-hide-md"><Skeleton w="32px" h={12} r={3} /></span>
              <span className="dt-hide-sm"><Skeleton w="44px" h={12} r={3} /></span>
              <span className="dt-show-sm"><Skeleton w="70px" h={22} r={5} /></span>
            </div>
          ))}
        </div>
      </DataScope>
    </div>
  )
}
