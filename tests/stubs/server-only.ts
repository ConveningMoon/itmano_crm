// Stub for the `server-only` package under vitest (Node). The real package throws
// on import outside a React Server Component graph; in tests we alias it to this no-op
// so server-only modules (which mark intent, not behavior) can be unit-tested.
export {}
