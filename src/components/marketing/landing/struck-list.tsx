'use client'

import { m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

// Lo que un CRM genérico trae y este no: cada promesa se tacha al entrar en
// pantalla. El texto se lee completo antes y después del trazo — la línea es
// el énfasis, no una condición para entenderlo. `compact` lo pone en una sola
// franja, sin el párrafo de cada ítem.

interface Item {
  title: string
  body?: string
}

export function StruckList({ items, compact = false }: { items: readonly Item[]; compact?: boolean }) {
  return (
    <ul className={compact ? 'mk-struck mk-struck-compact' : 'mk-struck'}>
      {items.map((item, i) => (
        <li key={item.title} className="mk-struck-item">
          <p className="mk-struck-title">
            {/* El trazo es un fondo del propio texto: en una frase que ocupa
                dos líneas, se dibuja de corrido por las dos, en orden. */}
            <m.span
              className="mk-struck-words"
              initial={{ backgroundSize: '0% 2px' }}
              whileInView={{ backgroundSize: '100% 2px' }}
              viewport={{ once: true, amount: 1, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease: EASE_OUT_PREMIUM }}
            >
              {item.title}
            </m.span>
          </p>
          {!compact && item.body && <p className="mk-struck-body">{item.body}</p>}
        </li>
      ))}
    </ul>
  )
}
