import { describe, expect, it, vi } from 'vitest'
import {
  allowedNow, nextQuotaWindow, quotaBudget, parseQuotaHeaders, parseQuotaStatus, quotaErrorKind, quotaRemaining,
  quotaWaitMessage, type QuotaStatus,
} from '@/lib/email/quota'
import { acceptedCount, installQuotaTracking, observe, type QuotaObservation } from '@/lib/email/quota-tracking'

// Fase 3 del plan SaaS: ningún envío debe fallar en silencio por un tope de
// Resend. El CRM mide la cuota en cada envío y frena los envíos masivos antes
// de pasarla.

const status = (over: Partial<QuotaStatus> = {}): QuotaStatus => ({
  counted_today: 0, counted_month: 0, header_daily: null, header_monthly: null,
  exhausted: null, daily_quota: null, monthly_quota: null, ...over,
})

describe('cabeceras y errores de cuota de Resend', () => {
  it('lee las cabeceras de cuota y descarta valores raros', () => {
    expect(parseQuotaHeaders({ 'x-resend-daily-quota': '42', 'x-resend-monthly-quota': '900' })).toEqual({ daily: 42, monthly: 900 })
    expect(parseQuotaHeaders({ 'x-resend-monthly-quota': '900' })).toEqual({ daily: null, monthly: 900 })
    expect(parseQuotaHeaders({ 'x-resend-daily-quota': 'abc' })).toEqual({ daily: null, monthly: null })
    expect(parseQuotaHeaders(null)).toEqual({ daily: null, monthly: null })
  })

  it('distingue el 429 de cuota del de velocidad', () => {
    expect(quotaErrorKind({ name: 'daily_quota_exceeded', message: 'x' })).toBe('daily')
    expect(quotaErrorKind({ name: 'monthly_quota_exceeded', message: 'x' })).toBe('monthly')
    expect(quotaErrorKind({ name: 'rate_limit_exceeded', message: 'Too many requests' })).toBeNull()
    expect(quotaErrorKind(null)).toBeNull()
  })
})

describe('cuota restante', () => {
  it('sin cuota anotada no limita (desconocido, nunca cero)', () => {
    const q = quotaRemaining(status({ counted_today: 50 }))
    expect(q.remaining).toBeNull()
    expect(allowedNow(100, q)).toBe(100)
  })

  it('gana la fuente más alta: contador propio o cabecera de Resend', () => {
    expect(quotaRemaining(status({ daily_quota: 100, counted_today: 30, header_daily: 60 })).daily).toBe(40)
    expect(quotaRemaining(status({ daily_quota: 100, counted_today: 70, header_daily: 60 })).daily).toBe(30)
  })

  it('manda el tope más estrecho entre el diario y el mensual', () => {
    const q = quotaRemaining(status({ daily_quota: 100, monthly_quota: 3000, counted_today: 10, counted_month: 2995 }))
    expect(q.remaining).toBe(5)
    expect(q.binding).toBe('monthly')
  })

  it('un 429 de cuota de hoy deja la cuota en cero aunque el contador diga otra cosa', () => {
    const q = quotaRemaining(status({ daily_quota: 100, counted_today: 10, exhausted: 'daily' }))
    expect(q.remaining).toBe(0)
    expect(allowedNow(100, q)).toBe(0)
  })

  it('con 10 restantes, un lote de 50 sale recortado a 10', () => {
    expect(allowedNow(50, quotaRemaining(status({ daily_quota: 100, counted_today: 90 })))).toBe(10)
  })

  it('parsea la respuesta de la RPC sin inventar ceros', () => {
    expect(parseQuotaStatus({ counted_today: '3', daily_quota: null, exhausted: 'daily' })).toEqual(status({ counted_today: 3, exhausted: 'daily' }))
    expect(parseQuotaStatus(null)).toEqual(status())
  })

  it('el siguiente periodo es medianoche UTC o el día 1 del mes', () => {
    const now = new Date('2026-11-19T22:30:00Z')
    expect(nextQuotaWindow('daily', now).toISOString()).toBe('2026-11-20T00:00:00.000Z')
    expect(nextQuotaWindow('monthly', new Date('2026-12-31T10:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('el mensaje de espera dice cuánto salió y cuánto falta', () => {
    expect(quotaWaitMessage('daily', { sentNow: 10, pending: 40 })).toContain('Salieron 10; quedan 40 en espera.')
    expect(quotaWaitMessage('daily')).toContain('mañana')
  })
})

describe('presupuesto de un envío masivo', () => {
  it('descuenta lote a lote y se agota sin releer la base', () => {
    const b = quotaBudget(quotaRemaining(status({ daily_quota: 100, counted_today: 90 })))
    expect(b.allowed(100)).toBe(10)
    b.spend(7)
    expect(b.allowed(100)).toBe(3)
    b.spend(3)
    expect(b.allowed(100)).toBe(0)
    expect(b.binding).toBe('daily')
  })

  it('sin cuota anotada no limita', () => {
    const b = quotaBudget(quotaRemaining(status()))
    b.spend(1000)
    expect(b.allowed(100)).toBe(100)
  })
})

describe('registro de la cuota en cada envío', () => {
  it('cuenta sólo los ids reales: un envío simulado no gasta cuota', () => {
    expect(acceptedCount('single', { data: { id: 'abc' }, error: null })).toBe(1)
    expect(acceptedCount('single', { data: { id: 'simulated_x' }, error: null })).toBe(0)
    expect(acceptedCount('batch', { data: { data: [{ id: 'a' }, { id: 'simulated_b' }, { id: 'c' }] }, error: null })).toBe(2)
    expect(acceptedCount('batch', { data: null, error: { name: 'x', message: 'y' } })).toBe(0)
  })

  it('una respuesta sin nada que contar no genera observación', () => {
    expect(observe('itmano', 'single', { data: { id: 'simulated_x' }, error: null, headers: null })).toBeNull()
    expect(observe('aj', 'single', { data: null, error: { name: 'daily_quota_exceeded', message: '' }, headers: null }))
      .toEqual({ account: 'aj', sent: 0, dailyUsed: null, monthlyUsed: null, exhausted: 'daily' })
  })

  it('el wrapper registra después de enviar y un fallo al registrar no rompe el envío', async () => {
    const recorded: QuotaObservation[] = []
    const client = {
      emails: { send: vi.fn(async () => ({ data: { id: 'e1' }, error: null, headers: { 'x-resend-monthly-quota': '12' } })) },
      batch:  { send: vi.fn(async () => ({ data: { data: [{ id: 'b1' }, { id: 'b2' }] }, error: null, headers: null })) },
    }
    installQuotaTracking(client as never, 'itmano', async obs => { recorded.push(obs) })
    const single = await (client.emails.send as unknown as (p: unknown) => Promise<{ data: { id: string } }>)({})
    expect(single.data.id).toBe('e1')
    await (client.batch.send as unknown as (p: unknown) => Promise<unknown>)([])
    expect(recorded).toEqual([
      { account: 'itmano', sent: 1, dailyUsed: null, monthlyUsed: 12, exhausted: null },
      { account: 'itmano', sent: 2, dailyUsed: null, monthlyUsed: null, exhausted: null },
    ])

    const failing = {
      emails: { send: vi.fn(async () => ({ data: { id: 'e2' }, error: null, headers: null })) },
      batch:  { send: vi.fn() },
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    installQuotaTracking(failing as never, 'aj', async () => { throw new Error('db caída') })
    const res = await (failing.emails.send as unknown as (p: unknown) => Promise<{ data: { id: string } }>)({})
    expect(res.data.id).toBe('e2')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
