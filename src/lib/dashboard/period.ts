export type PeriodDays = 7 | 28 | 91

export const PERIODS: { days: PeriodDays; label: string; bucketDays: 1 | 7 }[] = [
  { days: 7, label: '7 días', bucketDays: 1 },
  { days: 28, label: '4 semanas', bucketDays: 7 },
  { days: 91, label: '13 semanas', bucketDays: 7 },
]

export const DEFAULT_PERIOD: PeriodDays = 28
