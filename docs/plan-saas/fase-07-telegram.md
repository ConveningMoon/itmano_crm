# Fase 7 — Telegram autoservicio

**Objetivo:** que cada usuario conecte sus avisos de Telegram en dos clics, sin
copiar un chat ID ni pedírselo a ITMANO.

## Situación

Hoy `telegram_chat_id` (en `user_profiles`) sólo lo escribe el `super_admin`
al provisionar al owner (`provisionOwner`). Los agentes con login no tienen
forma de configurarlo. El bot es de ITMANO (`TELEGRAM_BOT_TOKEN`) y sólo envía:
no recibe mensajes.

## Diseño (deep link con token de un solo uso)

1. Configuración → Notificaciones → "Conectar Telegram": una Server Action
   crea un token aleatorio de un solo uso (10 minutos) en
   `telegram_link_tokens (token_hash, user_id, expires_at, used_at)` y
   devuelve `https://t.me/<bot>?start=<token>` (máx. 64 caracteres).
2. El usuario abre el enlace y pulsa "Iniciar". Telegram manda `/start <token>`
   al webhook `POST /api/webhooks/telegram`, registrado con `setWebhook` y
   `secret_token`. La ruta exige la cabecera
   `X-Telegram-Bot-Api-Secret-Token`.
3. La ruta busca el hash del token, comprueba vigencia, guarda el `chat.id` en
   el perfil del usuario, marca el token como usado y responde en Telegram
   ("Listo, recibirás aquí los avisos de <equipo>").
4. La página consulta el estado con una Server Action de lectura (polling
   corto, con estado pendiente visible) hasta ver la conexión.
5. "Desconectar" borra el chat ID. `/stop` en el bot hace lo mismo.

## Tareas

- [ ] Migración: `telegram_link_tokens` con RLS (cada usuario sólo los suyos),
      grants y test.
- [ ] Ruta del webhook con verificación de secreto, rate limit
      (`public_rate_limit`) y respuestas idempotentes.
- [ ] Script o acción `super_admin` para `setWebhook` en cada entorno (sandbox
      con su propio bot de pruebas: nunca el bot real desde local).
- [ ] UI en Configuración para todos los roles: estado, conectar, probar
      ("Enviar aviso de prueba") y desconectar. Botones con estado pendiente.
- [ ] Preferencias por usuario: qué avisos recibe (lead caliente, respuesta,
      open house, resumen diario). Reusar lo que ya decide
      `api/notifications/dispatch`.
- [ ] Quitar el campo de chat ID de `provisionOwner` (o dejarlo opcional) y
      documentarlo en `docs/agents/domains.md`.
- [ ] Nueva variable `TELEGRAM_WEBHOOK_SECRET` en `.env.example` y en Vercel.

## Criterio de terminado

Un agente con login conecta su Telegram desde su configuración, recibe un
aviso de prueba y un lead caliente real le llega sin intervención de ITMANO.
