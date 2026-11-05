import type { Agent } from '@/lib/types'

/**
 * Qué ve del equipo quien no lo administra. Owner/super gestionan a todos y
 * reciben la lista completa; un 'agent' sólo recibe sus propios datos y, de
 * sus compañeros, lo público (nombre, avatar, color, idiomas). Email, teléfono,
 * firma, descripción, portada y parte local se vacían ANTES de cruzar al
 * cliente: ocultarlos en la UI no basta, viajarían en el payload RSC.
 */
export function redactPeerAgents(
  agents: Agent[],
  viewerAgentId: string | null,
  canManage: boolean,
): Agent[] {
  if (canManage) return agents
  return agents.map(a =>
    a.id === viewerAgentId
      ? a
      : {
          ...a,
          email: '',
          phone: undefined,
          emailSignature: null,
          description: null,
          coverPhotoUrl: null,
          coverPhotoCutout: false,
          senderLocalPart: null,
        },
  )
}
