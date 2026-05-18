import { defineConfig } from 'vitest/config'
import { config as dotenvConfig } from 'dotenv'

dotenvConfig({ path: '.env.local' })

export default defineConfig({
  test: {
    globals: true,
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
