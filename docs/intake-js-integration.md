# intake.js Integration Guide

Embed `intake.js` on any landing page to track page views and capture form leads into the ITMANO CRM automatically.

---

## Embed snippet

Add this **before `</body>`**, without `async` or `defer`:

```html
<script src="https://app.itmano.com/intake.js" data-channel="chn_XXXXXXXXXXXX"></script>
```

Replace `chn_XXXXXXXXXXXX` with the **Channel ID** found in the CRM under Sources → (channel) → Public ID.

> **Important:** The script tag must load **synchronously** (no `async` or `defer`) so that `document.currentScript` resolves correctly and forms are wired before the user can submit.

---

## Form setup

Add `data-itmano-form` to any form you want to capture:

```html
<form data-itmano-form>
  <!-- Honeypot — hidden from humans, catches bots -->
  <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">

  <input type="text"  name="first_name" placeholder="Nombre" required>
  <input type="text"  name="last_name"  placeholder="Apellido">
  <input type="email" name="email"      placeholder="Correo electrónico" required>
  <input type="tel"   name="phone"      placeholder="Teléfono">

  <!-- Optional: language routing (es | en | pt, default: es) -->
  <input type="hidden" name="language" value="es">

  <!-- Optional: quiz answers as JSON -->
  <input type="hidden" name="quiz_answers" value='{"pregunta_1": "respuesta", "budget": "400k"}'>

  <button type="submit">Enviar</button>

  <!-- Shown after successful submission (hidden by default) -->
  <div data-itmano-success style="display:none">
    ¡Gracias! Nos pondremos en contacto pronto.
  </div>

  <!-- Shown if submission fails -->
  <div data-itmano-error style="display:none">
    Algo salió mal. Intenta de nuevo.
  </div>
</form>
```

### Required fields

| Field | Required | Notes |
|---|---|---|
| `first_name` | Yes | |
| `email` | Yes | Must be a valid email address |
| `last_name` | No | Defaults to empty string |
| `phone` | No | |
| `language` | No | `es` \| `en` \| `pt`. Defaults to `es`. Controls agent routing. |
| `quiz_answers` | No | JSON object. Stored in `leads.metadata.quiz_answers`. |

### Honeypot field

Always include `<input type="text" name="website" style="display:none">`. Bots fill it; humans don't. Submissions with a value in this field are silently discarded server-side.

---

## Success and error UI

Add elements with `data-itmano-success` and `data-itmano-error` **inside the form**. intake.js hides the form and shows the relevant element:

```html
<div data-itmano-success style="display:none">✓ Formulario enviado.</div>
<div data-itmano-error   style="display:none">Error al enviar. Inténtalo de nuevo.</div>
```

Both must be **inside** the `<form>` element.

---

## Multiple forms per page

Rare but supported. Each `form[data-itmano-form]` is wired independently. All submissions go to the same channel (the `data-channel` on the script tag).

---

## Using `window.itmano.submit()` from custom components

For multi-step quizzes or any JS component that manages its own form state, bypass the automatic form wiring and call the API directly:

```javascript
// window.itmano is available as soon as intake.js executes.
window.itmano.submit({
  first_name:   'María',
  last_name:    'López',
  email:        'maria@example.com',
  phone:        '+1 555 000 0000',
  language:     'es',
  quiz_answers: {
    pregunta_tipo_propiedad: 'casa',
    presupuesto:             '350k-500k',
    tiempo_compra:           '6_meses'
  }
})
.then(function(res) {
  if (res.ok) { /* show thank you */ }
  else        { /* show error    */ }
});
```

`window.itmano.submit()` automatically merges `visitor_id` and `utms` — you don't need to include them.

### Available properties

```javascript
window.itmano.visitorId  // string — anonymous visitor UUID persisted in localStorage + cookie
window.itmano.utms       // object — captured UTM params from the page URL
window.itmano.channel    // string — the data-channel value from the script tag
window.itmano.submit()   // function — returns Promise<{ ok: boolean }>
```

---

## UTM tracking

UTM parameters are read from the landing page URL automatically:

```
https://ajrealestateva.com/guia-familias/?utm_source=meta&utm_medium=paid&utm_campaign=nov2024
```

Captured keys: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `fbclid`.

UTMs persist in `sessionStorage` so they survive internal navigation (e.g. redirect to a thank-you page). They are sent with every form submission and stored on the lead record.

---

## Troubleshooting

**CORS errors in the browser console**

Make sure the `src` points to `https://app.itmano.com/intake.js` (not localhost or a staging URL) when testing from a deployed landing page. CORS is fully open (`*`) so origin is never the issue in production.

**`[itmano] data-channel attribute is missing`**

The `data-channel` attribute is absent or empty on the `<script>` tag. Get the correct Channel Public ID from the CRM: Sources → (your channel) → Public ID. It starts with `chn_`.

**Form submits but no lead appears in the CRM**

1. Check the browser Network tab — the POST to `/api/intake/.../submit` should return `{"ok":true}`.
2. If it returns 404: the channel Public ID is wrong or the channel is archived.
3. If it returns 400: a required field (`first_name` or `email`) is missing or `email` is not a valid format.
4. If it returns 200 but no lead: the honeypot field (`website`) has a value — clear it and resubmit.

**Visitor ID changes on every page load**

`localStorage` and cookies are blocked in this browser context (e.g. strict incognito or a browser extension). The visitor ID falls back to a session-only in-memory value. View tracking still works but the same visitor appears as different visitors across sessions.

**The script loads but forms are not captured**

The form was added to the DOM after `DOMContentLoaded`. Call `window.itmano` — it isn't available for re-wiring dynamically inserted forms after load. For SPAs or dynamic forms, use `window.itmano.submit()` directly.
