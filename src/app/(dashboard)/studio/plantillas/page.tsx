import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { listTemplates, getTemplate } from '@/lib/data/studio-templates'
import { fontFaceCssFromUrls, FONT_FAMILIES } from '@/lib/studio/fonts/catalog'
import { StudioTeaser } from '../teaser'
import { TemplateEditor } from './editor'

// El editor pide pantalla ancha —código y lienzo de 1080×1350 lado a lado— y no
// es una cuarta pestaña a propósito: la autoría no va al mismo nivel que el
// consumo. Ver la decisión 10 del spec.
export const maxDuration = 120

export default async function TemplatesPage({ searchParams }: {
  searchParams: Promise<{ key?: string }>
}) {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return <StudioTeaser />

  const { key } = await searchParams
  const [templates, current] = await Promise.all([
    listTemplates(),
    key ? getTemplate(key) : Promise.resolve(null),
  ])

  return (
    <TemplateEditor
      templates={templates}
      current={current}
      fontFaceCss={fontFaceCssFromUrls()}
      families={FONT_FAMILIES}
    />
  )
}
