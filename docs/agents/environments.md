# Entornos, Supabase y efectos externos

## Proyectos Supabase

| Entorno | `project_ref` | Contenido |
|---|---|---|
| Sandbox | `xpaixcowvyksgluazwzn` | Desarrollo, fixtures y datos de juguete |
| Producción | `kvmjlrvlnhiarrqxulkr` | Clientes y operaciones reales |

El sandbox es el destino predeterminado de agentes, desarrollo y suites remotas.
El MCP persistente está acotado por URL a ese proyecto. La autenticación es OAuth
local a cada computadora; no se versionan tokens.

Producción sólo se conecta cuando la pregunta exige evidencia real o al aplicar
una migración ya probada. Para lectura, usa una conexión temporal con
`project_ref`, `read_only=true` y sólo `database`, `debugging`, `development` o
`docs` según sea necesario. Toda escritura requiere autorización explícita.

## Desarrollo local

`.env.development.local` debe redirigir las variables Supabase al sandbox y gana
sobre `.env.local` al ejecutar `npm run dev`. El clon normal de trabajo mantiene
también `.env.local` apuntando al sandbox porque `next build` lo carga en modo
producción. Vitest carga únicamente `.env.test.local` y
`.env.development.local`; nunca usa `.env.local` como fallback. Ninguno de estos
archivos se commitea. Las credenciales reales de producción no deben vivir en el
clon normal de desarrollo.

El login de producción es Magic Link. En sandbox, el acceso local pasa por
`/api/dev/login?secret=<DEV_LOGIN_SECRET>&email=<correo>` y termina en el mismo
callback real. La ruta falla cerrada si la aplicación no apunta al sandbox;
consulta `src/lib/auth/dev-login.ts` y `tests/auth/dev-login.test.ts`.

El seed `supabase/seeds/002_sandbox_datos_prueba.sql` mantiene suficientes leads
para activar quintiles, etapas y series temporales. Sus emails usan
`example.com` para impedir entrega accidental.

## Servicios que siguen siendo reales

Cambiar Supabase a sandbox no neutraliza automáticamente otras credenciales:

- Anthropic y Google AI pueden facturar consumo real.
- Resend puede enviar correo real.
- Telegram puede publicar en chats reales.
- Paddle puede operar contra su entorno configurado.

Antes de una prueba, comprueba el destino de cada proveedor. Para trabajo que no
necesita esos servicios, elimina o deja vacías sus variables en el archivo local
específico del entorno. Nunca copies secretos a documentación, prompts, logs o
commits.

## Migraciones

1. Crea migraciones mediante Supabase CLI.
2. Revisa SQL, RLS, grants, funciones y side effects.
3. Aplica y verifica primero en sandbox.
4. Ejecuta advisors y las suites remotas pertinentes.
5. Regenera `src/lib/supabase/database.types.ts` desde el proyecto que ya tenga
   el esquema nuevo.
6. Solicita autorización antes de aplicar en producción.

No reescribas una migración que ya pudo aplicarse. Añade una migración correctiva.
La 108 introdujo leads de demo en producción con direcciones de proveedores
reales; la 114 los neutraliza con `example.com` sin alterar el historial.

Los cuatro buckets existen en ambos proyectos. No guardes URLs de storage de
producción en filas sandbox. `next/image` también exige que los hosts aprobados
figuren en `images.remotePatterns`.

## CI y deriva

Las suites de base comparten IDs de fixtures y deben correr serializadas. Antes
de ellas, `scripts/assert-supabase-targets.mjs` exige:

- `NEXT_PUBLIC_SUPABASE_URL` → sandbox.
- `PARITY_SUPABASE_URL`, si existe → producción y sólo para comparación.
- Las dos variables de parity se configuran juntas.

El guard no imprime URLs ni llaves. Los secrets de GitHub deben configurarse en
Settings → Secrets and variables → Actions; sus valores no pueden recuperarse
desde el repositorio ni volver a mostrarse desde GitHub.

`test:schema` compara migraciones aplicadas y, cuando tiene credenciales de ambos
proyectos, usa `schema_snapshot()` para evitar falsos positivos causados por
`search_path`. Las excepciones de paridad son temporales y se retiran al cerrar
la migración.
