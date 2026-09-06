// Formateo compartido por el compositor de bandas y los templates. Vive aparte
// para que una fecha o un precio no se vean distintos según el camino que haya
// dibujado la pieza.
//
// Los meses van a mano y NO con toLocaleDateString: el resultado dependería del
// ICU del runtime, que en Vercel no es el de tu máquina.

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} de ${MONTHS[m - 1]} de ${y}`
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
