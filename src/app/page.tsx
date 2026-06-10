import { redirect } from 'next/navigation'

// The app has no marketing root. Unauthenticated → middleware bounces to /login;
// authenticated → straight to the dashboard.
export default function Home() {
  redirect('/dashboard')
}
