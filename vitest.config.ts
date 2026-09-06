import { defineConfig, configDefaults } from 'vitest/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'

// Orden de precedencia, imitando el de Next: gana el PRIMERO que define cada
// variable, porque dotenv no sobreescribe lo ya cargado.
//
//   1. .env.test.local          — control fino: sólo si quieres que los tests
//                                 apunten a un proyecto distinto al de `npm run dev`
//   2. .env.development.local   — el sandbox; con esto las suites de BD dejan de
//                                 crear y borrar fixtures en la base de A&J
//   3. .env.local               — producción; sigue siendo el respaldo, así que
//                                 quien no tenga ninguno de los dos anteriores
//                                 corre exactamente como antes
//
// Lo que no esté definido en el archivo que gana se completa con los siguientes:
// las llaves de Resend, Anthropic o Telegram viven sólo en .env.local y se
// heredan igual.
for (const archivo of ['.env.test.local', '.env.development.local', '.env.local']) {
  dotenvConfig({ path: archivo })
}

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the app's @/* → ./src/* alias so tests can import app modules.
      '@': path.resolve(__dirname, './src'),
      // The `server-only` guard throws outside a React Server Component graph; stub it
      // so server-only modules can be unit-tested under vitest (Node).
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
  test: {
    globals: true,
    // Git worktrees carry full copies of tests/; without excluding them every
    // suite gets discovered once per worktree and runs several times.
    exclude: [...configDefaults.exclude, '.claude/worktrees/**', '**/.next/**'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Run RLS test files sequentially — they share a remote Supabase database.
    // Parallel execution causes fixture data races where one suite's afterAll
    // deletes rows another suite's tests are still reading.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
