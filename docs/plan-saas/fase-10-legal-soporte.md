# Fase 10 — Legal, soporte y operación SaaS

**Objetivo:** lo que un SaaS abierto al público necesita además del producto.

## Tareas

- [ ] **Legal (lo decide Dylan con asesoría; el agente sólo implementa):**
      revisar términos, privacidad y reembolsos (hoy con datos UAE pendientes
      de revisión), añadir un acuerdo de tratamiento de datos (los clientes
      suben datos de sus leads), la política de subprocesadores (Supabase,
      Vercel, Resend, Anthropic, Google, Paddle, Telegram) y la aceptación de
      términos registrada en el alta (fecha, versión e IP).
- [ ] **Cookies y consentimiento** en las páginas públicas si se añade
      analítica de terceros.
- [ ] **Correo de plataforma:** bienvenida, prueba por vencer, pago fallido,
      dominio verificado y resumen semanal del owner, todos desde la identidad
      común de ITMANO y contados en la cuota (fase 3).
- [ ] **Estado del servicio:** página pública simple que lea los latidos de la
      fase 2, o un servicio externo gratuito.
- [ ] **Runbook** en `docs/agents/`: qué hacer si se cae Resend, si se acaba
      el crédito de IA, si Supabase se pausa o si un dominio de cliente entra
      en lista negra.
- [ ] **Métricas de negocio** en el panel (fase 2): altas, conversiones de
      prueba a pago, churn y MRR.

## Criterio de terminado

Términos y privacidad aprobados por Dylan, publicados y versionados; el
runbook cubre los cuatro incidentes.
