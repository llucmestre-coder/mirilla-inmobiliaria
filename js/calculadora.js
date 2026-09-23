/* =========================================================================
   MIRILLA INMOBILIARIA — valoració orientativa (PLA.md §«Eina estrella»)
   Adaptat de la calculadora de referència de la skill web-demo.
   - Una pregunta per pantalla; en tocar una opció avança sola.
   - La planta només es pregunta per a pis i àtic (8 preguntes o 7).
   - Els extres són de selecció múltiple i avancen amb «Continuar».
   - El preu, la regla i el WhatsApp NO són al client: els retorna
     /api/verifica després de validar el codi que /api/codi envia al correu.
   - Textos escrits des del JS: sempre passen per I18N.t amb la frase dins.
   ========================================================================= */
(function () {
  'use strict';

  if (!window.I18N) window.I18N = { t: function (s) { return s; } };
  var arrel = document.getElementById('calc');
  if (!arrel) return;

  /* Clau pública del widget Turnstile (mirilla-inmobiliaria.pages.dev i localhost).
     La secreta és un secret de Pages. */
  var TURNSTILE_SITEKEY = '0x4AAAAAAFBScBLN-O8sZtB4';

  var DESAT = 'mirilla-valoracion';
  // Metres construïts [mín, màx, pas, inici] segons el tipus.
  var ESCALA = { pis: [30, 250, 5, 80], casa: [60, 400, 10, 150] };
  var EXTRES = ['terraza', 'garaje', 'trastero', 'exterior', 'piscina'];
  var redueix = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (sel, dins) { return (dins || arrel).querySelector(sel); };
  var $$ = function (sel, dins) { return Array.prototype.slice.call((dins || arrel).querySelectorAll(sel)); };

  var estat = llegeix() || { pas: 0, respostes: {}, correu: '', resultat: null };

  /* Només es recupera on s'havia quedat si es recarrega la pàgina. Arribant-hi
     des de qualsevol botó o enllaç, comença de zero. */
  function llegeix() {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!nav || nav.type !== 'reload') {
      try { sessionStorage.removeItem(DESAT); } catch (e) { /* res */ }
      return null;
    }
    try { return JSON.parse(sessionStorage.getItem(DESAT)); } catch (e) { return null; }
  }
  function desa() {
    try { sessionStorage.setItem(DESAT, JSON.stringify(estat)); } catch (e) { /* sense emmagatzematge: continua igual */ }
  }

  /* Accessos directes: valoracion.html?op=vender|alquilar salta la primera. */
  var opUrl = new URLSearchParams(location.search).get('op');
  if (!estat.respostes.op && /^(vender|alquilar)$/.test(opUrl || '')) {
    estat.respostes.op = { valor: opUrl };
    estat.pas = 1;
  }

  function teplanta() {
    var t = estat.respostes.tipo;
    return !t || t.valor === 'piso' || t.valor === 'atico';
  }
  function preguntes() {
    var p = ['op', 'tipo', 'zona', 'm2', 'estado'];
    if (teplanta()) p.push('planta');
    return p.concat(['extras', 'cuando']);
  }
  function passos() { return preguntes().concat(['correu', 'codi', 'resultat']); }
  function escala() { return ESCALA[estat.respostes.tipo && estat.respostes.tipo.valor === 'casa' ? 'casa' : 'pis']; }

  /* ── Pintar un pas ─────────────────────────────────────────────────── */
  function pantalla(nom) { return $('.calc-pas[data-pas="' + nom + '"]'); }

  function mostra(index, enrere) {
    var P = preguntes();
    var S = passos();
    var total = P.length;
    index = Math.max(0, Math.min(index, S.length - 1));
    if (S[index] === 'resultat' && !estat.resultat) index = S.indexOf('correu');
    for (var i = 0; i < P.length && i < index; i++) {
      if (!estat.respostes[P[i]]) { index = i; break; }
    }
    estat.pas = index;
    desa();

    var nom = S[index];
    $$('.calc-pas').forEach(function (s) { s.hidden = s.getAttribute('data-pas') !== nom; });
    var actual = pantalla(nom);
    actual.classList.remove('entra', 'entra-enrere');
    if (!redueix) { void actual.offsetWidth; actual.classList.add(enrere ? 'entra-enrere' : 'entra'); }

    if (nom === 'm2') preparaMetres();
    marcaEscollides(actual);

    var fetes = Math.min(index, total);
    $('.calc-progres i').style.transform = 'scaleX(' + (fetes / total) + ')';
    $('.calc-progres').setAttribute('aria-valuemax', String(total));
    $('.calc-progres').setAttribute('aria-valuenow', String(fetes));
    $('[data-calc-num]').textContent = String(Math.min(index + 1, total));
    $('[data-calc-total]').textContent = String(total);
    $('.calc-comptador').hidden = index >= total;
    $('[data-calc-enrere]').hidden = index === 0 || nom === 'resultat';
    $('.calc-cap').hidden = nom === 'resultat';
    $('[data-calc-resum]').hidden = nom === 'resultat';

    pintaResum();
    if (nom === 'correu') preparaCaptcha();
    if (nom === 'codi') { $('[data-calc-correu]').textContent = estat.correu; $('.calc-codi input').focus(); }
    if (nom === 'resultat') pintaResultat();

    var titol = actual.querySelector('[tabindex="-1"]');
    if (titol && nom !== 'codi') titol.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: redueix ? 'auto' : 'smooth' });
  }

  function locale() { return (window.I18N && window.I18N.bcp) || 'es-ES'; }
  function num(n) { return n.toLocaleString(locale(), { maximumFractionDigits: 0, useGrouping: 'always' }); }
  function euros(n) { return num(n) + ' €'; }
  function metres(n) { return num(n) + ' m²'; }

  function nomOpcio(pregunta, valor) {
    var op = pantalla(pregunta).querySelector('.calc-op[data-valor="' + valor + '"] .calc-op-nom');
    return op ? op.textContent.trim() : valor;
  }
  function etiqueta(pregunta) {
    var r = estat.respostes[pregunta];
    if (!r) return '';
    if (pregunta === 'm2') return metres(Number(r.valor));
    if (pregunta === 'extras') {
      if (!r.valor) return I18N.t('Sin extras');
      return r.valor.split(',').map(function (v) { return nomOpcio('extras', v); }).join(', ');
    }
    return nomOpcio(pregunta, r.valor);
  }

  function marcaEscollides(seccio) {
    var pregunta = seccio.getAttribute('data-pas');
    var r = estat.respostes[pregunta];
    if (pregunta === 'extras') return pintaExtres();
    $$('.calc-op', seccio).forEach(function (b) {
      b.setAttribute('aria-pressed', r && b.getAttribute('data-valor') === r.valor ? 'true' : 'false');
    });
  }

  function pintaResum() {
    var llista = $('[data-calc-resum]');
    llista.innerHTML = '';
    preguntes().forEach(function (p, i) {
      if (!estat.respostes[p] || i >= estat.pas) return;
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = etiqueta(p);
      b.setAttribute('aria-label', I18N.t('Cambiar esta respuesta') + ': ' + etiqueta(p));
      b.addEventListener('click', function () { mostra(i, true); });
      li.appendChild(b);
      llista.appendChild(li);
    });
  }

  /* ── Respondre: un clic i avança (menys als extres) ────────────────── */
  $$('.calc-pas[data-pas]').forEach(function (seccio) {
    var pregunta = seccio.getAttribute('data-pas');
    if (pregunta === 'extras') return;
    seccio.addEventListener('click', function (e) {
      var b = e.target.closest('.calc-op');
      if (!b) return;
      var valor = b.getAttribute('data-valor');
      var abans = estat.respostes[pregunta] && estat.respostes[pregunta].valor;
      estat.respostes[pregunta] = { valor: valor };
      // Passar de casa a pis (o al revés) canvia l'escala dels metres.
      if (pregunta === 'tipo' && abans && (abans === 'casa') !== (valor === 'casa')) delete estat.respostes.m2;
      // Casa i baix no tenen planta.
      if (pregunta === 'tipo' && !teplanta()) delete estat.respostes.planta;
      estat.resultat = null;
      marcaEscollides(seccio);
      var i = preguntes().indexOf(pregunta);
      setTimeout(function () { mostra(i + 1); }, redueix ? 0 : 220);
    });
  });

  /* Extres: selecció múltiple. «Nada de esto» buida la resta. */
  var seleccio = [];
  function pintaExtres() {
    var r = estat.respostes.extras;
    if (r) seleccio = r.valor ? r.valor.split(',') : ['ninguno'];
    $$('.calc-op', pantalla('extras')).forEach(function (b) {
      b.setAttribute('aria-pressed', seleccio.indexOf(b.getAttribute('data-valor')) >= 0 ? 'true' : 'false');
    });
  }
  pantalla('extras').addEventListener('click', function (e) {
    var b = e.target.closest('.calc-op');
    if (!b) return;
    var v = b.getAttribute('data-valor');
    if (v === 'ninguno') seleccio = seleccio.indexOf('ninguno') >= 0 ? [] : ['ninguno'];
    else {
      seleccio = seleccio.filter(function (x) { return x !== 'ninguno'; });
      var i = seleccio.indexOf(v);
      if (i >= 0) seleccio.splice(i, 1); else seleccio.push(v);
    }
    delete estat.respostes.extras;
    estat.resultat = null;
    pintaExtres();
  });
  function confirmaExtres() {
    var bons = EXTRES.filter(function (x) { return seleccio.indexOf(x) >= 0; });
    estat.respostes.extras = { valor: bons.join(',') };
    estat.resultat = null;
    mostra(preguntes().indexOf('extras') + 1);
  }
  $('[data-calc-continua="extras"]').addEventListener('click', confirmaExtres);

  /* Teclat: 1–6 trien opció a les preguntes. */
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    var nom = passos()[estat.pas];
    if (preguntes().indexOf(nom) < 0 || !/^[1-6]$/.test(e.key)) return;
    var b = $$('.calc-op', pantalla(nom))[Number(e.key) - 1];
    if (b) b.click();
  });

  $('[data-calc-enrere]').addEventListener('click', function () { mostra(estat.pas - 1, true); });

  /* ── Metres: slider amb l'escala de pis o de casa ───────────────────── */
  var slider = $('#calc-m2');
  function pintaMetres() {
    var e = escala();
    var v = Number(slider.value);
    $('[data-calc-m2-num]').textContent = metres(v);
    slider.setAttribute('aria-valuetext', metres(v));
    slider.style.setProperty('--pct', ((v - e[0]) / (e[1] - e[0]) * 100) + '%');
  }
  function preparaMetres() {
    var e = escala();
    slider.min = String(e[0]);
    slider.max = String(e[1]);
    slider.step = String(e[2]);
    var desat = estat.respostes.m2 ? Number(estat.respostes.m2.valor) : NaN;
    slider.value = String(desat >= e[0] && desat <= e[1] ? desat : e[3]);
    slider.setAttribute('aria-label', I18N.t('Metros construidos'));
    $('[data-calc-min]').textContent = metres(e[0]);
    $('[data-calc-max]').textContent = metres(e[1]);
    pintaMetres();
  }
  function confirmaMetres() {
    estat.respostes.m2 = { valor: String(slider.value) };
    estat.resultat = null;
    mostra(preguntes().indexOf('m2') + 1);
  }
  slider.addEventListener('input', pintaMetres);
  slider.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmaMetres(); });
  $('[data-calc-continua="m2"]').addEventListener('click', confirmaMetres);

  /* ── Correu + consentiment + captcha ───────────────────────────────── */
  var formCorreu = $('[data-calc-form-correu]');

  var widget = null;
  function preparaCaptcha() {
    if (widget !== null) return;
    var render = function () {
      if (!window.turnstile || widget !== null) return;
      widget = window.turnstile.render('#calc-turnstile', {
        sitekey: TURNSTILE_SITEKEY,
        language: document.documentElement.lang || 'es',
        appearance: 'interaction-only'
      });
    };
    if (window.turnstile) return render();
    window.mirillaTurnstile = render;
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=mirillaTurnstile';
    s.async = true;
    document.head.appendChild(s);
  }

  function error(seccio, text) {
    $('[data-calc-error]', pantalla(seccio)).textContent = text || '';
  }

  function envia(url, dades) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(dades)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; j.ok = r.ok && j.ok !== false; return j; });
    });
  }

  function respostesPerEnviar() {
    var out = {};
    preguntes().forEach(function (p) { out[p] = estat.respostes[p].valor; });
    out.m2 = Number(out.m2);
    return out;
  }

  formCorreu.addEventListener('submit', function (e) {
    e.preventDefault();
    var camp = formCorreu.elements.email;
    var correu = camp.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correu)) {
      camp.setAttribute('aria-invalid', 'true');
      camp.focus();
      return error('correu', I18N.t('Escribe un correo válido, por ejemplo nombre@gmail.com.'));
    }
    camp.setAttribute('aria-invalid', 'false');
    var permis = formCorreu.elements.consentimiento;
    if (!permis.checked) {
      permis.focus();
      return error('correu', I18N.t('Sin marcar la casilla no podemos guardar tus respuestas ni enseñarte la valoración.'));
    }
    var token = window.turnstile && widget !== null ? window.turnstile.getResponse(widget) : '';
    if (!token) return error('correu', I18N.t('Espera un momento a que termine la comprobación de seguridad y vuelve a pulsar.'));

    var boto = formCorreu.querySelector('button[type="submit"]');
    var text = boto.textContent;
    boto.disabled = true;
    boto.textContent = I18N.t('Enviando…');
    error('correu', '');
    envia('/api/codi', { correu: correu, token: token, idioma: document.documentElement.lang || 'es' })
      .then(function (j) {
        if (j.ok) {
          estat.correu = correu;
          mostra(passos().indexOf('codi'));
          compteEnrere();
        } else if (j.status === 429) {
          error('correu', I18N.t('Has pedido demasiados códigos. Espera unos minutos y vuelve a intentarlo.'));
        } else if (j.error === 'captcha') {
          error('correu', I18N.t('No hemos podido confirmar que no eres un robot. Vuelve a intentarlo.'));
        } else {
          error('correu', I18N.t('No hemos podido enviar el código. Inténtalo de nuevo en unos minutos.'));
        }
      })
      .catch(function () { error('correu', I18N.t('No hemos podido enviar el código. Inténtalo de nuevo en unos minutos.')); })
      .finally(function () {
        boto.disabled = false;
        boto.textContent = text;
        if (window.turnstile && widget !== null) window.turnstile.reset(widget);
      });
  });

  /* ── Codi de 6 xifres ─────────────────────────────────────────────── */
  var caselles = $$('.calc-codi input');
  function codi() { return caselles.map(function (c) { return c.value; }).join(''); }
  function omple(xifres) {
    xifres = xifres.replace(/\D/g, '').slice(0, 6);
    caselles.forEach(function (c, i) { c.value = xifres[i] || ''; });
    var seguent = caselles[Math.min(xifres.length, 5)];
    if (seguent) seguent.focus();
    if (xifres.length === 6) verifica();
  }
  caselles.forEach(function (c, i) {
    c.addEventListener('input', function () {
      if (c.value.length > 1) return omple(c.value);  // enganxat o autocompletat del mòbil
      c.value = c.value.replace(/\D/g, '');
      if (c.value && caselles[i + 1]) caselles[i + 1].focus();
      if (codi().length === 6) verifica();
    });
    c.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !c.value && caselles[i - 1]) caselles[i - 1].focus();
    });
    c.addEventListener('paste', function (e) {
      e.preventDefault();
      omple((e.clipboardData || window.clipboardData).getData('text'));
    });
  });

  function rang(x) { return x && typeof x.min === 'number' && typeof x.max === 'number' ? { min: x.min, max: x.max } : null; }

  var verificant = false;
  function verifica() {
    if (verificant) return;
    verificant = true;
    error('codi', '');
    envia('/api/verifica', { correu: estat.correu, codi: codi(), respostes: respostesPerEnviar(), consentiment: formCorreu.elements.consentimiento.checked, idioma: document.documentElement.lang || 'es' })
      .then(function (j) {
        if (j.ok && rang(j.sortida) && rang(j.escala) && typeof j.risc === 'number') {
          estat.resultat = {
            op: j.op === 'alquilar' ? 'alquilar' : 'vender',
            sortida: rang(j.sortida), tanca: rang(j.tanca), escala: rang(j.escala), risc: j.risc,
            temps: rang(j.temps), honoraris: Number(j.honoraris) || 0,
            wa: String(j.whatsapp || '').replace(/\D/g, '')
          };
          mostra(passos().indexOf('resultat'));
        } else {
          omple('');
          if (j.error === 'caducat') error('codi', I18N.t('El código ha caducado. Pide uno nuevo.'));
          else if (j.status === 429) error('codi', I18N.t('Demasiados intentos. Pide un código nuevo.'));
          else error('codi', I18N.t('El código no es correcto. Revísalo y vuelve a escribirlo.'));
        }
      })
      .catch(function () { error('codi', I18N.t('No hemos podido comprobar el código. Inténtalo de nuevo.')); })
      .finally(function () { verificant = false; });
  }

  var reenvia = $('[data-calc-reenvia]');
  var rellotge = null;
  function compteEnrere() {
    var s = 30;
    reenvia.disabled = true;
    clearInterval(rellotge);
    rellotge = setInterval(function () {
      s--;
      if (s <= 0) { clearInterval(rellotge); reenvia.disabled = false; }
    }, 1000);
  }
  reenvia.addEventListener('click', function () { mostra(passos().indexOf('correu'), true); });
  $('[data-calc-canvia-correu]').addEventListener('click', function () { mostra(passos().indexOf('correu'), true); });

  /* ── Resultat: la regla del precio ─────────────────────────────────── */
  function pintaResultat() {
    var r = estat.resultat;
    var venda = r.op === 'vender';
    var preu = venda ? euros : function (n) { return I18N.t('{x} al mes').replace('{x}', euros(n)); };
    var tram = function (x) { return preu(x.min) + ' – ' + preu(x.max); };

    $('[data-calc-titol]').textContent = venda ? I18N.t('Tu casa, en venta') : I18N.t('Tu casa, en alquiler');
    $('[data-calc-descripcio]').textContent = preguntes().filter(function (p) { return p !== 'op' && p !== 'cuando'; }).map(etiqueta).join(', ') + '.';

    // Posicions a la regla (% de l'escala).
    var pct = function (x) { return Math.max(0, Math.min(100, (x - r.escala.min) / (r.escala.max - r.escala.min) * 100)) + '%'; };
    var regla = $('.regla-resultat');
    regla.style.setProperty('--ini', pct(r.sortida.min));
    regla.style.setProperty('--fi', pct(r.sortida.max));
    regla.style.setProperty('--risc', pct(r.risc));
    if (r.tanca) regla.style.setProperty('--tanca', pct((r.tanca.min + r.tanca.max) / 2));
    $('[data-calc-tanca-marca]').hidden = !r.tanca;
    $('[data-calc-tanca-bloc]').hidden = !r.tanca;
    $('[data-calc-escala-min]').textContent = preu(r.escala.min);
    $('[data-calc-escala-max]').textContent = preu(r.escala.max);

    $('[data-calc-franja-nom]').textContent = venda ? I18N.t('Salida recomendada') : I18N.t('Renta recomendada');
    $('[data-calc-franja]').textContent = tram(r.sortida);
    if (r.tanca) $('[data-calc-tanca]').textContent = tram(r.tanca);
    $('[data-calc-risc]').textContent = I18N.t('más de {x}').replace('{x}', preu(r.risc));
    $('[data-calc-risc-expl]').textContent = venda
      ? I18N.t('Suele quedarse meses en los portales.')
      : I18N.t('Suele costar encontrar inquilino.');

    $('[data-calc-temps]').textContent = r.temps
      ? (venda ? I18N.t('De {a} a {b} meses para venderla.') : I18N.t('De {a} a {b} semanas para alquilarla.'))
          .replace('{a}', num(r.temps.min)).replace('{b}', num(r.temps.max))
      : '';
    $('[data-calc-honoraris]').textContent = venda
      ? I18N.t('Unos {x} + IVA: el 3 % del precio final, con un mínimo de 3.000 €. Solo si se vende.').replace('{x}', euros(r.honoraris))
      : I18N.t('Una mensualidad + IVA, unos {x}. Al inquilino no le cobramos nada.').replace('{x}', euros(r.honoraris));

    // La franja cobalt llisca fins al seu lloc un sol cop.
    var franja = $('.regla-resultat .regla-franja');
    franja.classList.remove('llisca');
    if (!redueix) { void franja.offsetWidth; franja.classList.add('llisca'); }

    var missatge = (venda
      ? I18N.t('Hola, he valorado mi casa en Mirilla para venderla: {resumen}. Precio de salida recomendado: {precio}. ¿Podéis venir a verla?')
      : I18N.t('Hola, he valorado mi casa en Mirilla para alquilarla: {resumen}. Renta recomendada: {precio}. ¿Podéis venir a verla?'))
      .replace('{resumen}', $('[data-calc-descripcio]').textContent.replace(/\.$/, ''))
      .replace('{precio}', tram(r.sortida));
    $('[data-calc-escriu]').href = 'contacto.html?motivo=' + (venda ? 'vender' : 'alquilar');
    var wa = $('[data-calc-wa]');
    wa.hidden = !r.wa;
    wa.href = 'https://wa.me/' + r.wa + '?text=' + encodeURIComponent(missatge);
  }

  $('[data-calc-reinicia]').addEventListener('click', function () {
    estat = { pas: 0, respostes: {}, correu: estat.correu, resultat: null };
    seleccio = [];
    mostra(0, true);
  });

  /* Canvi d'idioma sense recarregar: repinta el que surt del JS. */
  document.addEventListener('idioma-canviat', function () {
    pintaResum();
    var nom = passos()[estat.pas];
    if (nom === 'm2') preparaMetres();
    if (nom === 'resultat' && estat.resultat) pintaResultat();
  });

  mostra(estat.pas);
})();
