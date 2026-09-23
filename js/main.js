/* =========================================================================
   MIRILLA INMOBILIARIA — comportament comú
   - Sense JS, tot el contingut es veu igual (el buscador mostra els 8
     immobles; només els botons «Ver ficha» no fan res).
   - Textos escrits des del JS: sempre I18N.t amb la frase castellana literal,
     perquè el verificador i l'extractor d'idiomes els trobin.
   ========================================================================= */
(function () {
  'use strict';

  if (!window.I18N) window.I18N = { t: function (s) { return s; } };
  var params = new URLSearchParams(location.search);

  /* ── Menú mòbil ─────────────────────────────────────────────────────── */
  var obre = document.querySelector('.nav-obre');
  var nav = document.getElementById('nav');
  if (obre && nav) {
    var tanca = function () {
      obre.setAttribute('aria-expanded', 'false');
      nav.classList.remove('obert');
    };
    obre.addEventListener('click', function () {
      var obert = obre.getAttribute('aria-expanded') === 'true';
      obre.setAttribute('aria-expanded', String(!obert));
      nav.classList.toggle('obert', !obert);
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) tanca(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && obre.getAttribute('aria-expanded') === 'true') { tanca(); obre.focus(); }
    });
  }

  /* Pàgina actual al menú */
  var aqui = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(function (a) {
    if (a.getAttribute('href') === aqui) a.setAttribute('aria-current', 'page');
  });

  /* ── Buscador d'immobles ────────────────────────────────────────────── */
  var form = document.querySelector('[data-filtres-form]');
  var llista = document.querySelector('[data-llista]');
  if (form && llista) {
    var fitxes = Array.prototype.slice.call(llista.querySelectorAll('.immoble'));
    var ordreOriginal = fitxes.slice();
    var comptador = document.querySelector('[data-comptador]');
    var buit = document.querySelector('[data-buit]');
    var ordena = document.querySelector('[data-ordena]');
    var preu = form.elements.precio;
    var panell = document.querySelector('[data-filtres]');

    // Al mòbil, els filtres comencen plegats (sense JS queden oberts).
    if (panell && window.matchMedia('(max-width: 900px)').matches) panell.open = false;

    // L'URL guarda els filtres: inmuebles.html?op=alquiler&hab=2
    if (/^(venta|alquiler)$/.test(params.get('op') || '')) form.elements.op.value = params.get('op');
    ['tipo', 'hab', 'precio'].forEach(function (k) {
      var v = params.get(k);
      if (v && form.elements[k].querySelector('option[value="' + CSS.escape(v) + '"]')) form.elements[k].value = v;
    });
    ['ascensor', 'terraza', 'garaje'].forEach(function (k) { if (params.get(k) === '1') form.elements[k].checked = true; });
    if (/^(asc|desc)$/.test(params.get('orden') || '')) ordena.value = params.get('orden');

    // Els preus màxims depenen de si es compra o es lloga.
    var pintaPreus = function () {
      var op = form.elements.op.value;
      Array.prototype.forEach.call(preu.options, function (o) {
        var d = o.getAttribute('data-op');
        o.hidden = !!d && d !== op;
        o.disabled = !!d && d !== op;
      });
      if (preu.selectedOptions[0] && preu.selectedOptions[0].disabled) preu.value = '';
    };

    var filtra = function () {
      pintaPreus();
      var f = {
        op: form.elements.op.value, tipo: form.elements.tipo.value,
        hab: Number(form.elements.hab.value) || 0, precio: Number(preu.value) || 0,
        ascensor: form.elements.ascensor.checked, terraza: form.elements.terraza.checked, garaje: form.elements.garaje.checked
      };
      var n = 0;
      fitxes.forEach(function (li) {
        var d = li.dataset;
        var ok = d.op === f.op && (!f.tipo || d.tipo === f.tipo) && Number(d.hab) >= f.hab &&
          (!f.precio || Number(d.precio) <= f.precio) &&
          (!f.ascensor || d.ascensor === '1') && (!f.terraza || d.terraza === '1') && (!f.garaje || d.garaje === '1');
        li.hidden = !ok;
        if (ok) n++;
      });
      var ordre = ordena.value;
      var ordenades = ordre
        ? fitxes.slice().sort(function (a, b) { return (Number(a.dataset.precio) - Number(b.dataset.precio)) * (ordre === 'asc' ? 1 : -1); })
        : ordreOriginal;
      ordenades.forEach(function (li) { llista.appendChild(li); });

      comptador.textContent = n === 1 ? I18N.t('1 inmueble') : I18N.t('{n} inmuebles').replace('{n}', String(n));
      buit.hidden = n > 0;
      llista.hidden = n === 0;

      var q = new URLSearchParams();
      if (f.op !== 'venta') q.set('op', f.op);
      if (f.tipo) q.set('tipo', f.tipo);
      if (f.hab) q.set('hab', String(f.hab));
      if (f.precio) q.set('precio', String(f.precio));
      ['ascensor', 'terraza', 'garaje'].forEach(function (k) { if (f[k]) q.set(k, '1'); });
      if (ordre) q.set('orden', ordre);
      var s = q.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
    };

    form.addEventListener('change', filtra);
    ordena.addEventListener('change', filtra);
    form.addEventListener('reset', function () { setTimeout(filtra, 0); });
    document.querySelector('[data-neteja]').addEventListener('click', function () { form.reset(); });
    document.addEventListener('idioma-canviat', filtra);
    filtra();

    /* Fitxa en un <dialog>. inmuebles.html?ref=MI-101 l'obre en arribar. */
    var ultimBoto = null;
    llista.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fitxa]');
      if (!b) return;
      var d = document.getElementById('fitxa-' + b.getAttribute('data-fitxa'));
      if (!d) return;
      ultimBoto = b;
      d.showModal();
    });
    document.querySelectorAll('dialog.fitxa').forEach(function (d) {
      // Clic fora del full = tancar.
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      d.addEventListener('close', function () { if (ultimBoto) ultimBoto.focus(); });
    });
    var ref = params.get('ref');
    if (ref && /^MI-\d{3}$/.test(ref)) {
      var d = document.getElementById('fitxa-' + ref);
      var li = document.getElementById(ref);
      if (d && li) {
        form.elements.op.value = li.dataset.op;
        filtra();
        ultimBoto = li.querySelector('[data-fitxa]');
        d.showModal();
      }
    }
  }

  /* ── Formulari de contacte (Formspree, enviament real) ──────────────── */
  var contacte = document.getElementById('form-contacto');
  if (contacte) {
    // contacto.html?ref=MI-101 (pedir visita) o ?motivo=vender|alquilar|busco
    var r = params.get('ref');
    if (r && /^MI-\d{3}$/.test(r)) { contacte.elements.referencia.value = r; contacte.elements.motivo.value = 'visita'; }
    var m = params.get('motivo');
    if (m && /^(visita|vender|alquilar|busco|otra)$/.test(m)) contacte.elements.motivo.value = m;
    var campRef = contacte.querySelector('[data-camp-ref]');
    var pintaRef = function () { campRef.hidden = contacte.elements.motivo.value !== 'visita'; };
    contacte.elements.motivo.addEventListener('change', pintaRef);
    pintaRef();

    var estat = contacte.querySelector('.form-estat');
    var boto = contacte.querySelector('button[type="submit"]');
    var textBoto = boto ? boto.textContent : '';
    var mostra = function (tipus, missatge) {
      estat.hidden = false;
      estat.setAttribute('data-tipus', tipus);
      estat.textContent = missatge;
      estat.focus();
    };
    var marca = function (camp, error) {
      var caixa = camp.closest('.camp');
      var msg = caixa && caixa.querySelector('.camp-error');
      camp.setAttribute('aria-invalid', error ? 'true' : 'false');
      if (msg) msg.textContent = error || '';
    };

    contacte.addEventListener('submit', function (e) {
      e.preventDefault();
      var nom = contacte.elements.nombre;
      var correu = contacte.elements.email;
      var tel = contacte.elements.telefono;
      var privacitat = contacte.elements.privacidad;
      var errors = 0;
      marca(nom, nom.value.trim() ? '' : I18N.t('Escribe tu nombre.'));
      if (!nom.value.trim()) errors++;
      var correuOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correu.value.trim());
      marca(correu, correuOk ? '' : I18N.t('Escribe un correo válido, por ejemplo nombre@gmail.com.'));
      if (!correuOk) errors++;
      // El telèfon és opcional; si l'escriuen, que tingui com a mínim 9 xifres.
      var telOk = !tel.value.trim() || tel.value.replace(/\D/g, '').length >= 9;
      marca(tel, telOk ? '' : I18N.t('Escribe un teléfono de al menos 9 cifras.'));
      if (!telOk) errors++;
      marca(privacitat, privacitat.checked ? '' : I18N.t('Marca la casilla para poder enviarnos tu mensaje.'));
      if (!privacitat.checked) errors++;
      if (errors) {
        var primer = contacte.querySelector('[aria-invalid="true"]');
        if (primer) primer.focus();
        return;
      }

      boto.disabled = true;
      boto.textContent = I18N.t('Enviando…');
      fetch(contacte.action, {
        method: 'POST',
        body: new FormData(contacte),
        headers: { Accept: 'application/json' }
      }).then(function (resp) {
        if (!resp.ok) throw new Error(String(resp.status));
        contacte.reset();
        pintaRef();
        mostra('ok', I18N.t('Recibido. Te contestamos hoy mismo o mañana por la mañana.'));
      }).catch(function () {
        mostra('error', I18N.t('No se ha podido enviar. Llámanos al 600 000 000 y te atendemos directamente.'));
      }).finally(function () {
        boto.disabled = false;
        boto.textContent = textBoto;
      });
    });
  }
})();
