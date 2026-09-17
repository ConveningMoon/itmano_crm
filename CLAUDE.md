# ITMANO CRM — adaptador para Claude Code

@AGENTS.md

`AGENTS.md` es el contrato operativo compartido y la fuente de verdad de las
reglas del repositorio. Claude Code debe cargarlo completo antes de actuar y
seguir las rutas de contexto en `docs/agents/`.

Configuración específica de Claude Code:

- `.mcp.json` declara los MCP persistentes `supabase_sandbox` y
  `supabase_production`, igual que `.codex/config.toml`. Autentica cada uno una
  vez por computadora mediante OAuth con `/mcp`. No uses un PAT en
  `settings.json` ni en `.mcp.json`.
- Sandbox es el destino por defecto. Producción se consulta con
  `supabase_production` y recibe una migración sólo después de pasar el gate de
  sandbox descrito en `AGENTS.md` y `docs/agents/environments.md`.
- Si el plugin global `supabase` también está conectado, no lo uses para
  escribir: no está acotado a un `project_ref`.
- Cumple siempre "Estados de carga obligatorios" de `AGENTS.md`: cualquier
  pantalla, sección, filtro o acción que consulte la base de datos se entrega
  con su skeleton, spinner o estado pendiente en el mismo cambio. Revisa también
  que no introduzca consultas en serie evitables.
- Las skills oficiales de Supabase viven en `.claude/skills/` y su procedencia
  está fijada en `skills-lock.json`.
- Graphify debe estar instalado globalmente en la misma versión que declara
  `docs/agents/workflow.md`. Sus hooks de Git se instalan con
  `npm run setup:hooks`; no uses rutas absolutas específicas de Windows en
  `.claude/settings.json`.
- No actives sincronización automática de configuración desde otro agente: los
  archivos versionados de este repositorio son la fuente compartida.
