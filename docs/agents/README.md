# Contexto operativo para agentes

`AGENTS.md` contiene el contrato corto que debe cargarse en cada sesión. Esta
carpeta conserva el contexto detallado, separado por dominio para leer sólo lo
necesario:

- `product.md`: producto, estado comercial, planes, roadmap y voz.
- `environments.md`: sandbox, producción, migraciones, CI y servicios reales.
- `architecture.md`: multi-tenancy, auth, flujo de datos y convenciones.
- `scoring.md`: motor de scoring, calidad, urgencia y decay.
- `domains.md`: email, formularios, propiedades y newsletters.
- `workflow.md`: setup reproducible, Git, Graphify y handoff Mac/Windows.

Los hechos dinámicos no deben copiarse aquí como si fueran eternos. Cuando el
estado real pueda cambiar —esquema, reglas de scoring, precios, configuración de
un proveedor— consulta la fuente autoritativa indicada. Si una decisión duradera
cambia, actualiza el documento correspondiente en el mismo commit.
