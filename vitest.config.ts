import { defineConfig, configDefaults } from 'vitest/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'

dotenvConfig({ path: '.env.local' })

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
