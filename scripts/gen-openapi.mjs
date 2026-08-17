#!/usr/bin/env node
/**
 * Regenera el contrato OpenAPI y el export del tenant demo.
 *
 *   npm run openapi:gen
 *
 * La generación vive en tests/agent-api-db/contract.test.ts porque necesita
 * resolver TypeScript, los alias `@/*` y el stub de `server-only` — todo lo que
 * vitest ya hace. Ese mismo archivo es el guardián de deriva cuando corre sin
 * UPDATE_OPENAPI: si el commiteado se separa del código, falla.
 *
 * Este envoltorio existe para no depender de la sintaxis `VAR=1 comando`, que
 * no funciona en todos los shells de Windows.
 */
import { spawnSync } from 'node:child_process'

const resultado = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'tests/agent-api-db/contract.test.ts'],
  { stdio: 'inherit', env: { ...process.env, UPDATE_OPENAPI: '1' } },
)

process.exit(resultado.status ?? 1)
