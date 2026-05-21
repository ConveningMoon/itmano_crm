/* eslint-disable */
/* itmano intake.js — embed on landing pages to track views and capture form leads.
 * Load synchronously (no async/defer): <script src="https://app.itmano.com/intake.js" data-channel="chn_..."></script>
 * Size target: < 3KB. No dependencies. IIFE — only exposes window.itmano. */
(function () {
  'use strict';

  /* ── 1. Bootstrap ─────────────────────────────────────────────────────── */
  var script = document.currentScript;
  var channel = script && script.getAttribute('data-channel');
  if (!channel) { console.warn('[itmano] data-channel attribute is missing'); return; }

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
  if (navigator.sendBeacon) {
    navigator.sendBeacon(viewUrl, new Blob([viewPayload], { type: 'text/plain' }));
  } else {
    fetch(viewUrl, { method: 'POST', body: viewPayload,
      headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
  }

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
