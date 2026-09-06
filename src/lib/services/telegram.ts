import 'server-only'

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error(JSON.stringify({ service: 'telegram', error: 'TELEGRAM_BOT_TOKEN not configured' }))
    return { ok: false, error: 'no_token' }
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:                  chatId,
          text,
          parse_mode:               'HTML',
          disable_web_page_preview: false,
        }),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      console.error(JSON.stringify({ service: 'telegram', status: res.status, body }))
      return { ok: false, error: `telegram_${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.error(JSON.stringify({ service: 'telegram', error: String(err) }))
    return { ok: false, error: 'network_error' }
  }
}
