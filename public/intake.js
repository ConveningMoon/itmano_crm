/* eslint-disable */
/* itmano intake.js — embed on landing pages to track views and capture form leads.
 * Se puede cargar sincrono o async (next/script, GTM, etc.): el bootstrap de
 * abajo encuentra su propio tag de las dos formas.
 * Size target: < 3KB. No dependencies. IIFE — only exposes window.itmano. */
(function () {
  'use strict';

  /* ── 1. Bootstrap ─────────────────────────────────────────────────────── */
  /* `document.currentScript` es null cuando el script se inyecta de forma
   * asincrona — que es justo lo que hace <Script> de Next, GTM y cualquier
   * gestor de etiquetas. El script se cargaba, arrancaba, no se encontraba a si
   * mismo y salia sin registrar nada: cero vistas, para siempre, sin error
   * visible. El fallback busca el tag por su src. */
  var script = document.currentScript;
  if (!script || !script.getAttribute('data-channel')) {
    var tags = document.querySelectorAll('script[data-channel]');
    for (var i = 0; i < tags.length; i++) {
      if ((tags[i].src || '').indexOf('intake.js') !== -1) { script = tags[i]; break; }
    }
  }
  var channel = script && script.getAttribute('data-channel');
  if (!channel) { console.warn('[itmano] falta el atributo data-channel en el <script> de intake.js'); return; }

  var base = (function () {
    try { return new URL(script.src).origin; } catch (e) { return 'https://app.itmano.com'; }
  })();

  /* ── 2. Visitor ID ────────────────────────────────────────────────────── */
  var VID_KEY = 'itmano_vid';
  var visitorId = (function () {
    // Read from localStorage
    try { var v = localStorage.getItem(VID_KEY); if (v) return v; } catch (e) {}
    // Read from cookie
    try {
      var m = document.cookie.match(/(?:^|;)\s*itmano_vid=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    // Generate UUID v4
    var id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    // Persist in both stores; degrade gracefully if blocked (incognito strict mode)
    try { localStorage.setItem(VID_KEY, id); } catch (e) {}
    try {
      document.cookie = VID_KEY + '=' + encodeURIComponent(id) +
        ';path=/;max-age=' + (365 * 24 * 3600) + ';SameSite=None;Secure';
    } catch (e) {}
    return id;
  })();

  /* ── 3. UTM capture ───────────────────────────────────────────────────── */
  var utms = (function () {
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem('itmano_utms') || 'null'); } catch (e) {}
    if (stored) return stored;
    var p = new URLSearchParams(window.location.search);
    var keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'];
    var result = {}, hasAny = false;
    keys.forEach(function (k) { var v = p.get(k); if (v) { result[k] = v; hasAny = true; } });
    if (hasAny) { try { sessionStorage.setItem('itmano_utms', JSON.stringify(result)); } catch (e) {} }
    return result;
  })();

  /* ── 4. View beacon ───────────────────────────────────────────────────── */
  // sendBeacon with text/plain avoids CORS preflight (simple request).
  var viewPayload = JSON.stringify({
    visitor_id:  visitorId,
    url:         window.location.href,
    referrer:    document.referrer,
    utms:        utms,
    user_agent:  navigator.userAgent,
    screen_size: { w: window.innerWidth, h: window.innerHeight },
    timestamp:   new Date().toISOString()
  });
  var viewUrl = base + '/api/intake/' + channel + '/view';
  /* sendBeacon DEVUELVE false cuando no consigue encolar el envio, y eso pasa mas
   * de lo que parece en movil: cola llena, cuota del user agent, o un Blob que el
   * navegador rechaza. Ignorar ese valor dejaba la visita perdida sin reintento y
   * sin rastro — la pagina cargaba, el script corria y no se registraba nada.
   * Ahora se comprueba y se cae a fetch, que ademas cubre a los navegadores que
   * no traen sendBeacon. */
  function enviarVista() {
    var enviado = false;
    try {
      if (navigator.sendBeacon) {
        enviado = navigator.sendBeacon(viewUrl, new Blob([viewPayload], { type: 'text/plain' }));
      }
    } catch (e) { enviado = false; }
    if (enviado) return;
    try {
      fetch(viewUrl, { method: 'POST', body: viewPayload,
        headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' })
        .catch(function () {});
    } catch (e) {}
  }
  enviarVista();

  /* ── 5. Form wiring ───────────────────────────────────────────────────── */
  function showElement(el) { if (el) el.style.display = 'block'; }

  function wireForm(form) {
    if (form._itmano_wired) return;
    form._itmano_wired = true;
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Client-side honeypot check
      var hp = form.querySelector('input[name="website"]');
      if (hp && hp.value) {
        form.style.display = 'none';
        showElement(form.querySelector('[data-itmano-success]'));
        return;
      }

      // Collect FormData → plain object (excludes honeypot)
      var data = { visitor_id: visitorId, utms: utms, source_url: window.location.href };
      var fd = new FormData(form);
      fd.forEach(function (v, k) { if (k !== 'website') data[k] = v; });

      // quiz_answers: parse if it arrived as a JSON string from a hidden input
      if (typeof data.quiz_answers === 'string') {
        try { data.quiz_answers = JSON.parse(data.quiz_answers); } catch (e) { delete data.quiz_answers; }
      }

      var btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;

      fetch(base + '/api/intake/' + channel + '/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data)
      })
      .then(function (r) {
        if (r.ok) {
          form.style.display = 'none';
          showElement(form.querySelector('[data-itmano-success]'));
        } else {
          showElement(form.querySelector('[data-itmano-error]'));
        }
      })
      .catch(function () { showElement(form.querySelector('[data-itmano-error]')); })
      .finally(function () { if (btn) btn.disabled = false; });
    });
  }

  function wireAll() {
    document.querySelectorAll('form[data-itmano-form]').forEach(wireForm);
  }

  wireAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAll);
  }

  /* ── 6. Public API ────────────────────────────────────────────────────── */
  window.itmano = {
    visitorId: visitorId,
    utms:      utms,
    channel:   channel,
    submit: function (payload) {
      var merged = Object.assign({ visitor_id: visitorId, utms: utms }, payload);
      if (payload.utms) merged.utms = Object.assign({}, utms, payload.utms);
      return fetch(base + '/api/intake/' + channel + '/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(merged)
      }).then(function (r) { return r.json(); });
    }
  };

})();
