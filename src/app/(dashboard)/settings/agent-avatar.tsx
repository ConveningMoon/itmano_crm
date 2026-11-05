// Círculo con las iniciales del agente, teñido con su color de acento (dato del
// agente, no un token). El color viaja como variable CSS y las mezclas
// translúcidas viven en `.settings-agent-avatar`.
export function AgentAvatar({ agent }: { agent: { accentColor: string; avatarInitials: string } }) {
  return (
    <div
      className="settings-agent-avatar"
      style={{ '--agent-accent': agent.accentColor } as React.CSSProperties}
      aria-hidden="true"
    >
      {agent.avatarInitials}
    </div>
  )
}
