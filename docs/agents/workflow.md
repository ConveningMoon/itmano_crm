# Workflow reproducible entre agentes y computadoras

## Bootstrap de un clon

### Windows

```powershell
winget install Volta.Volta
winget install astral-sh.uv
volta install node@24.20.0 npm@11.19.0
uv tool install --python 3.12 "graphifyy[sql]==0.9.55"
npm ci
npm run setup:hooks
graphify install --platform claude
graphify install --platform codex
```

Usa un clon local fuera de OneDrive, por ejemplo `C:\dev\itmano-crm`.
Configura `.env.local` y `.env.development.local` para sandbox; el primero es
necesario para `next build` y el segundo para desarrollo y suites de Vitest.

### macOS

```bash
curl https://get.volta.sh | bash
brew install uv
volta install node@24.20.0 npm@11.19.0
uv tool install --python 3.12 "graphifyy[sql]==0.9.55"
npm ci
npm run setup:hooks
graphify install --platform claude
graphify install --platform codex
```

Usa una ruta no sincronizada como `~/Developer/itmano-crm`. Reinicia la shell
después de instalar gestores que cambien `PATH`.
Configura `.env.local` y `.env.development.local` para sandbox; no copies
credenciales de producción al clon normal.

Las versiones autoritativas están en `package.json`. Volta fija el patch exacto
para los clones de desarrollo; `engines` y `devEngines` aceptan cualquier patch
compatible de Node 24 y npm 11 porque Vercel y otros runtimes gestionados los
actualizan en su propio calendario. Un cambio de versión mayor debe actualizar
Volta, engines, devEngines y CI en el mismo commit.

## Graphify

`graphify-out/` es una caché local. No forma parte del producto ni del handoff.
Los hooks en `.githooks/` la actualizan después de commits y checkouts una vez
que `npm run setup:hooks` configura `core.hooksPath`.

Usa:

```text
graphify query "<pregunta>"
graphify path "A" "B"
graphify explain "concepto"
npm run graph:update
npm run graph:status
```

Las consultas reducen contexto, pero una conclusión que cambia código se valida
en archivos actuales. Si el grafo falta o está reconstruyéndose, usa `rg`.

## Inicio de trabajo

```text
git fetch origin --prune
git status --short --branch
git branch -vv
```

Parte de `origin/main` actualizado o de la rama que Dylan identifique. No uses
una rama que esté activa en la otra computadora. Evita `git pull` sin estrategia;
para actualizaciones lineales usa `git pull --ff-only`.

Claude y Codex no necesitan ramas por proveedor. La rama representa un cambio de
producto, no qué agente lo implementó. Los prefijos normales son `feat/`, `fix/`,
`chore/`, `docs/`, `design/`; Codex puede usar `codex/` cuando la aplicación lo
requiera.

## Handoff

Antes de cambiar de computadora o agente:

1. Revisa `git diff` y elimina sólo artefactos generados del cambio actual.
2. Ejecuta checks proporcionales.
3. Crea uno o más commits lógicos.
4. `git push -u origin <branch>`.
5. Entrega este resumen:

```text
Rama: <branch>
Commit: <sha>
Objetivo completado: <resultado>
Verificaciones: <comandos y resultado>
Pendientes/bloqueos: <ninguno o lista concreta>
Producción/servicios externos tocados: <no o detalle>
```

En la otra computadora: fetch, checkout de la rama y `git pull --ff-only`. No
uses stash como transferencia: no viaja con Git. Un archivo `HANDOFF.md` mutable
también puede quedar obsoleto; el commit y el resumen son la unidad de traspaso.

## Commits y limpieza

- Un commit representa un cambio lógico y usa Conventional Commits.
- Nunca incluyas `Co-Authored-By` de una IA ni mensajes generados por tooling.
- Revisa archivos untracked antes de agregar; no uses `git add .` a ciegas.
- No borres stashes, worktrees, branches locales o commits sin upstream hasta
  comprobar reachability y crear un respaldo remoto cuando corresponda.
- Dylan abre el PR manualmente.

## Comandos habituales

```text
npm run dev
npm run lint
npx tsc --noEmit
npm run test:unit
npm run build
npm run test:schema
npm run test:rls
npm run test:scoring
npm run test:ai-limits
npm run test:sources
npm run types:db:sandbox
npm run types:db
```

Las suites remotas se ejecutan de una en una. `npm run check:db-targets` valida
el destino de CI sin revelar secretos.

## Actualización de skills

Las skills Supabase se fijan en `skills-lock.json` y se comparten con Claude y
Codex. Para revisarlas y actualizar ambas copias deliberadamente:

```text
npx skills update --project --yes
```

Revisa el diff de instrucciones como código: una skill puede cambiar qué acciones
realiza un agente y con qué permisos.
