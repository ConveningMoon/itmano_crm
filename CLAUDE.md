# ITMANO CRM — adaptador para Claude Code

@AGENTS.md

`AGENTS.md` es el contrato operativo compartido y la fuente de verdad de las
reglas del repositorio. Claude Code debe cargarlo completo antes de actuar y
seguir las rutas de contexto en `docs/agents/`.

Configuración específica de Claude Code:

- Claude Code usa dos MCP de Supabase: `supabase-sandbox` y uno de producción,
  cada uno acotado por URL a su `project_ref`. Autentícalos mediante OAuth con
  `/mcp`, una vez por computadora. No requieren ni deben usar un PAT en
  `settings.json`.
- El agente tiene acceso a ambas bases y aplica las migraciones por sí mismo:
  primero en sandbox y, sólo si allí pasan las pruebas y advisors, el mismo
  archivo en producción, sin pedir otra autorización. Los cambios destructivos
  siguen la regla de confirmación de `AGENTS.md`.
- Las skills oficiales de Supabase viven en `.claude/skills/` y su procedencia
  está fijada en `skills-lock.json`.
- Graphify debe estar instalado globalmente en la misma versión que declara
  `docs/agents/workflow.md`. Sus hooks de Git se instalan con
  `npm run setup:hooks`; no uses rutas absolutas específicas de Windows en
  `.claude/settings.json`.
- No actives sincronización automática de configuración desde otro agente: los
  archivos versionados de este repositorio son la fuente compartida.
