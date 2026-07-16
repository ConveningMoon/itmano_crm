'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

const LINKS = [
  { href: '/#producto', label: 'Producto' },
  { href: '/#ia', label: 'IA' },
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/planes', label: 'Planes' },
]

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`mk-nav${scrolled || open ? ' mk-nav-scrolled' : ''}`}>
      <div className="mk-container mk-nav-inner">
        <Link
          href="/"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
          onClick={() => setOpen(false)}
        >
          <Image
            src="/itmano_logo.webp"
            alt="ITMANO"
            width={30}
            height={30}
            priority
            className="img-tint-gold"
            style={{ display: 'block' }}
          />
          <span
            style={{
              fontSize: '15px',
              fontWeight: 600,
              letterSpacing: '0.2em',
              color: 'var(--text-primary)',
            }}
          >
            ITMANO
          </span>
        </Link>

        <nav className="mk-nav-links">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className="mk-nav-link">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="mk-nav-actions">
          <Link href="/login" className="mk-btn-ghost" style={{ padding: '9px 18px' }}>
            Iniciar sesión
          </Link>
          <Link href="/#contacto" className="mk-btn-gold btn-cta" style={{ padding: '9px 18px' }}>
            Contáctanos
          </Link>
          <button
            className="mk-burger btn-icon"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '8px',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {/* Icono hamburguesa / cerrar dibujado inline — sin dependencias */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {open ? (
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menú móvil */}
      <AnimatePresence>
        {open && (
          <m.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_PREMIUM }}
            style={{
              overflow: 'hidden',
              borderTop: '1px solid var(--border-subtle)',
              backgroundColor: 'color-mix(in srgb, var(--bg-base) 96%, transparent)',
            }}
          >
            <div
              className="mk-container"
              style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px 24px 20px' }}
            >
              {LINKS.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="mk-nav-link"
                  style={{ padding: '10px 0', fontSize: '15px' }}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="mk-btn-ghost"
                style={{ marginTop: '12px' }}
                onClick={() => setOpen(false)}
              >
                Iniciar sesión
              </Link>
            </div>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
