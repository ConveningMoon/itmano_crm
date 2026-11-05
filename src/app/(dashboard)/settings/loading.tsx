import { PageHeader } from '@/components/ui/page-header'
import { SettingsBodySkeleton } from './settings-skeleton'

export default function SettingsLoading() {
  return (
    <>
      <PageHeader title="Configuración" description="Ajustes del equipo, el negocio y la cuenta." />
      <SettingsBodySkeleton />
    </>
  )
}
