/**
 * Bandas de calidad con empates y fuentes con o sin filtrado
 * (migración 20261128130000).
 *
 * `quality_band_for` es la única definición de la banda: la usan leads_list,
 * refresh_quality_bands y preview_score_rule_changes. Lo que se fija aquí es
 * que un empate que abarca varios cortes no sube de banda de golpe, y que sin
 * empates el resultado es el de siempre.
 *
 * Son funciones puras: no crean ni borran fixtures.
 */

import { describe, it, expect } from 'vitest'
import { adminClient } from '../rls/setup'

async function band(q: number, cuts: [number, number, number, number], fixed = false): Promise<string> {
  const [p20, p40, p60, p80] = cuts
  const { data, error } = await adminClient.rpc('quality_band_for', {
    p_q: q, p_p20: p20, p_p40: p40, p_p60: p60, p_p80: p80, p_fixed: fixed,
  })
  if (error) throw new Error(error.message)
  return data as string
}

async function asks(channelType: string | null, explicit: boolean | null): Promise<boolean> {
  const { data, error } = await adminClient.rpc('channel_asks_fit_questions', {
    p_channel_type: channelType as string, p_explicit: explicit as boolean,
  })
  if (error) throw new Error(error.message)
  return data as boolean
}

describe('quality_band_for', () => {
  it('un empate en todos los cortes queda en la banda más baja que toca', async () => {
    // El caso real: 49 de 71 leads en 30 puntos, p20 = p40 = p60 = p80 = 30.
    expect(await band(30, [30, 30, 30, 30])).toBe('media_baja')
    expect(await band(35, [30, 30, 30, 30])).toBe('alta')
    expect(await band(0,  [30, 30, 30, 30])).toBe('baja')
  })

  it('un empate parcial no arrastra a los de arriba', async () => {
    expect(await band(30, [30, 30, 40, 50])).toBe('media_baja')
    expect(await band(40, [30, 30, 40, 50])).toBe('media_alta')
    expect(await band(50, [30, 30, 40, 50])).toBe('alta')
  })

  it('sin empates es la comparación >= de siempre', async () => {
    const cortes: [number, number, number, number] = [10, 20, 30, 50]
    expect(await band(9,  cortes)).toBe('baja')
    expect(await band(10, cortes)).toBe('media_baja')
    expect(await band(20, cortes)).toBe('media')
    expect(await band(30, cortes)).toBe('media_alta')
    expect(await band(50, cortes)).toBe('alta')
  })

  it('con cortes fijos ignora los quintiles', async () => {
    expect(await band(65, [30, 30, 30, 30], true)).toBe('media_alta')
    expect(await band(80, [90, 95, 98, 99], true)).toBe('alta')
  })
})

describe('channel_asks_fit_questions', () => {
  it('sin valor explícito decide el tipo, igual que src/lib/sources/fit-questions.ts', async () => {
    expect(await asks('lead_magnet', null)).toBe(true)
    expect(await asks('contact_form', null)).toBe(true)
    expect(await asks('manychat_flow', null)).toBe(true)
    expect(await asks('event', null)).toBe(false)
    expect(await asks('newsletter', null)).toBe(false)
    expect(await asks(null, null)).toBe(false)
  })

  it('el valor explícito de la fuente manda', async () => {
    expect(await asks('event', true)).toBe(true)
    expect(await asks('lead_magnet', false)).toBe(false)
  })
})
