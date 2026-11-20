# Fase 11 — Supabase Pro (al final)

**Objetivo:** backups automáticos, más capacidad y fin de los límites del plan
Free. Se deja al final por decisión de Dylan (2026-11-18).

## Mientras tanto (obligatorio hasta esta fase)

- Backup manual mensual de producción
  (`docs/performance/ACCIONES-DYLAN.md` §3) y anotarlo en `provider_settings`
  para que el panel avise si pasan más de 35 días.
- Vigilar Storage (alerta al 75% de 1 GB) y egress (5 GB/mes) en el panel.
  **Si un cliente nuevo grande entra antes de esta fase, adelantarla:** 50
  propiedades sin la fase 4 ya no caben en Free.

## Capacidad con Pro

| Recurso | Free | Pro | Uso hoy | Lectura |
|---|---|---|---|---|
| Base | 500 MB | 8 GB | 21 MB | Sin riesgo |
| Storage | 1 GB | 100 GB | ~245 MB | ~450 clientes como A&J hoy, ~900 tras la fase 4 |
| Egress | 5 GB | 250 GB | medir | Lo primero a vigilar; la fase 4 lo reduce |
| Backups | no | diarios, 7 días | — | El motivo principal |
| Proyectos | 2 | sin límite práctico | 2 | Permite staging o la mudanza de región |

Respuesta corta: sí, Pro alcanza de sobra para el almacenamiento aunque un
cliente gaste el 25% del plan Free (~250 MB). La métrica a vigilar es el egress.

## Tareas

- [ ] Dylan: pasar la organización a Pro y activar Spend Cap (sin cargos por
      encima de lo incluido) hasta conocer el consumo real.
- [ ] Decidir si se aprovecha para mover la región a `us-east-1` (más cerca de
      A&J y del resto de EE. UU.). Procedimiento en
      `docs/performance/ACCIONES-DYLAN.md` §5b. Requiere un proyecto nuevo y
      una ventana de mantenimiento.
- [ ] Verificar backups (restaurar uno en un proyecto temporal) y anotarlo.
- [ ] Revisar el tamaño de compute: el docs de arquitectura describe la base
      Nano que se enfría (`DbWarmer`). Con Pro (Micro incluido), medir si el
      cron de `warm` cada minuto sigue haciendo falta.
- [ ] Actualizar los límites del panel (fase 2) a los de Pro y los documentos
      `docs/agents/environments.md` y `docs/agents/architecture.md`.

## Criterio de terminado

Backups diarios visibles en Supabase, una restauración de prueba hecha y el
panel midiendo contra los límites de Pro.
