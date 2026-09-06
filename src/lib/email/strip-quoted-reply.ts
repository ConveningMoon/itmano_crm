/**
 * Strips the quoted/forwarded portion of a plain-text email reply.
 *
 * Detects common quote separators used by Outlook, Gmail and standard MUAs
 * and returns only the text the sender wrote above the quoted block.
 *
 * Conservative: if no separator is found, the full text is returned.
 * All matching is anchored to the start of a line (trim applied) so that
 * the word "De:" inside a sentence never triggers a cut.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // ── Outlook underscore separator ──────────────────────────────────────────
    // "________________________________" — 5 or more consecutive underscores,
    // nothing else on the line. Appears in both Outlook on the web and desktop.
    if (/^_{5,}$/.test(trimmed)) {
      return lines.slice(0, i).join('\n').trimEnd()
    }

    // ── Forwarded-header block (De:/From: + Enviado:/Sent:) ──────────────────
    // Triggered only when the NEXT non-empty line within 3 starts with
    // Enviado:/Sent: — prevents cutting on "De: repente me gustó" in the reply.
    if (/^(De|From):\s+/i.test(trimmed)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^(Enviado|Sent):\s+/i.test(lines[j].trim())) {
          return lines.slice(0, i).join('\n').trimEnd()
        }
      }
    }

    // ── Gmail "El/On … escribió/wrote:" — single-line variant ────────────────
    if (/^(El|On)\s+.+\s+(escribió|wrote):\s*$/i.test(trimmed)) {
      return lines.slice(0, i).join('\n').trimEnd()
    }

    // ── Gmail multi-line variant ──────────────────────────────────────────────
    // "El 20 jun. 2026, a las 10:47, Nombre <email>" on one line,
    // then "escribió:" or "wrote:" on the next.
    if (/^(El|On)\s+/i.test(trimmed)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^.*(escribió|wrote):\s*$/i.test(lines[j].trim())) {
          return lines.slice(0, i).join('\n').trimEnd()
        }
      }
    }

    // ── Classic ">" quoted-reply prefix ──────────────────────────────────────
    if (trimmed.startsWith('>')) {
      return lines.slice(0, i).join('\n').trimEnd()
    }
  }

  return text.trimEnd()
}
