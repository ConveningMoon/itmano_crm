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
// No se carga `.env.local`: puede apuntar a producción y contener credenciales
// reales de Resend, Anthropic o Telegram. Una suite que necesite Supabase debe
// tener sandbox en uno de los dos archivos anteriores o recibir env explícito
// desde CI.
for (const archivo of ['.env.test.local', '.env.development.local']) {
  dotenvConfig({ path: archivo, quiet: true })
}

// Algunos módulos validan la key al importarse aunque el test no envíe correo.
// El valor sintético evita depender de secretos reales en suites unitarias.
process.env.RESEND_API_KEY ??= 'test-key-no-envia-nada'

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
