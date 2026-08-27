// Etiquetas de las features de IA — client-safe.
//
// Viven separadas de `ai-usage.ts` (que trae `import 'server-only'` y el
// cliente admin de Supabase) porque el panel de uso
// (`src/components/dashboard/ai-usage-panel.tsx`) es un componente que
// también se renderiza del lado del cliente y necesita esta misma tabla.
// Antes el panel mantenía su propia copia "client-safe, duplicada a
// propósito" — se desincronizó en silencio (le faltaban cuatro features) y
// una fila del ledger terminaba mostrando el literal en snake_case, en la
// pantalla donde el cliente mira su gasto. Un solo archivo, importado por
// ambos lados, es la forma de que eso no vuelva a pasar.
export type AiFeature =
  | 'property_intake' | 'email_draft' | 'sequence_bootstrap' | 'hosted_page_copy'
  | 'lead_fit' | 'carousel_copy' | 'studio_prompt' | 'studio_image'
  | 'newsletter_sources' | 'newsletter_research' | 'newsletter_draft' | 'newsletter_cover'

export const AI_FEATURE_LABELS: Record<string, string> = {
  property_intake:    'Propiedades · Crear con IA',
  email_draft:        'Correos · Borrador con IA',
  sequence_bootstrap: 'Secuencias · 3 correos con IA',
  hosted_page_copy:   'Páginas · Copy con IA',
  lead_fit:           'Leads · Análisis de fit',
  carousel_copy:      'Carruseles · Copy con IA',
  studio_prompt:      'Estudio · Dirección de escena',
  studio_image:       'Estudio · Generación de imagen',
  newsletter_sources:  'Newsletters · Fuentes del mercado',
  newsletter_research: 'Newsletters · Investigación',
  newsletter_draft:    'Newsletters · Redacción',
  newsletter_cover:    'Newsletters · Portada',
}
