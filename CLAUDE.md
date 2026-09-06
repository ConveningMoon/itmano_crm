# ITMANO CRM — adaptador para Claude Code

@AGENTS.md

`AGENTS.md` es el contrato operativo compartido y la fuente de verdad de las
reglas del repositorio. Claude Code debe cargarlo completo antes de actuar y
seguir las rutas de contexto en `docs/agents/`.

Configuración específica de Claude Code:

- El MCP persistente del proyecto es `supabase-sandbox`; autentícalo mediante
  OAuth con `/mcp`. No requiere ni debe usar un PAT en `settings.json`.
- No importes o recrees un MCP permanente de producción. Cuando una tarea lo
  requiera, usa una conexión temporal, acotada, read-only y con autorización.
- Las skills oficiales de Supabase viven en `.claude/skills/` y su procedencia
  está fijada en `skills-lock.json`.
- Graphify debe estar instalado globalmente en la misma versión que declara
  `docs/agents/workflow.md`. Sus hooks de Git se instalan con
  `npm run setup:hooks`; no uses rutas absolutas específicas de Windows en
  `.claude/settings.json`.
- No actives sincronización automática de configuración desde otro agente: los
  archivos versionados de este repositorio son la fuente compartida.
