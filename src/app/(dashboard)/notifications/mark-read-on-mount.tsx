'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { markAllNotificationsRead } from './actions'

// On mount, mark the visible notifications as read, then refresh so the topbar
// bell badge recomputes to 0. Fires once, and only when there is something unread.
export function MarkReadOnMount({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter()
  const fired  = useRef(false)

  useEffect(() => {
    if (fired.current || !hasUnread) return
    fired.current = true
    markAllNotificationsRead().then(() => router.refresh())
  }, [hasUnread, router])

  return null
}
