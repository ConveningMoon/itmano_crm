import { redirect } from 'next/navigation'

// El motor de carruseles vive dentro del Estudio desde la migración a /studio.
// La ruta vieja se conserva como redirect: hay enlaces guardados apuntando aquí.
// Los componentes de esta carpeta SIGUEN EN USO — /studio los monta en su tab
// "Carruseles"; lo único que se retiró es esta página como destino propio.
export default function CarouselsRedirect() {
  redirect('/studio')
}
