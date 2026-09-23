// POST /api/verifica — comprova el codi i, només si és correcte, calcula la valoració
// orientativa de Mirilla (PLA.md §«Eina estrella») i retorna el WhatsApp.
// El preu i el número no són mai al navegador abans d'aquest pas.
// Secrets: WHATSAPP, BREVO_API_KEY, BREVO_SENDER. Bindings: CODIS (KV), LEADS (D1).

const MAX_INTENTS = 5;

// Preguntes i respostes vàlides. El servidor refusa qualsevol altra cosa.
const OPCIONS = {
  op: ['vender', 'alquilar'],
  tipo: ['piso', 'atico', 'bajo', 'casa'],
  zona: ['casco', 'centro', 'residencial', 'afueras'],
  estado: ['reformar', 'entrar', 'reformado'],
  planta: ['bajo', 'alta', 'sinascensor'],
  cuando: ['pronto', 'ano', 'mirando'],
};
const EXTRES = ['terraza', 'garaje', 'trastero', 'exterior', 'piscina'];
// Metres construïts [mín, màx, pas] segons el tipus.
const ESCALA = { pis: [30, 250, 5], casa: [60, 400, 10] };

// Preus de referència d'EXEMPLE (inventats, ordres de magnitud d'Espanya 2026):
// venda en €/m², lloguer en €/m² al mes. Cada agència hi posaria els de les seves zones.
const ZONA = {
  vender: { casco: 3100, centro: 2700, residencial: 2000, afueras: 1600 },
  alquilar: { casco: 13, centro: 11.5, residencial: 9, afueras: 7.5 },
};
const TIPUS = { piso: 1, atico: 1.08, bajo: 0.95, casa: 0.92 };
const ESTAT = { reformar: 0.8, entrar: 1, reformado: 1.1 };
const PLANTA = { bajo: 0.93, alta: 1, sinascensor: 0.87 };
const PLANTA_ATIC_SENSE = 0.9;
const EXTRA_PCT = { terraza: 0.05, trastero: 0.02, exterior: 0.03, piscina: 0.03 };
const GARATGE = { vender: 9000, alquilar: 60 };
const HONORARIS = { pct: 0.03, minim: 3000 };

function json(dades, status = 200) {
  return new Response(JSON.stringify(dades), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const tePlanta = (tipo) => tipo === 'piso' || tipo === 'atico';
const a1000 = (x) => Math.round(x / 1000) * 1000;
const a10 = (x) => Math.round(x / 10) * 10;
const a100 = (x) => Math.round(x / 100) * 100;

export function valides(r) {
  if (!r) return false;
  for (const k of ['op', 'tipo', 'zona', 'estado', 'cuando']) if (!OPCIONS[k].includes(r[k])) return false;
  if (tePlanta(r.tipo) ? !OPCIONS.planta.includes(r.planta) : r.planta !== undefined) return false;
  if (typeof r.extras !== 'string') return false;
  const ex = r.extras ? r.extras.split(',') : [];
  if (ex.some((x) => !EXTRES.includes(x)) || new Set(ex).size !== ex.length) return false;
  const [min, max, pas] = ESCALA[r.tipo === 'casa' ? 'casa' : 'pis'];
  const m = Number(r.m2);
  if (!Number.isFinite(m) || m < min || m > max || (m - min) % pas !== 0) return false;
  return true;
}

// Exportada per provar-la sense servidor (node) i per treure'n l'exemple de la home
// (piso · residencial · 90 m² · entrar · alta · sense extres → 180.000 €).
export function calcula(r) {
  const venda = r.op === 'vender';
  const ex = r.extras ? r.extras.split(',') : [];
  const m = Number(r.m2);
  // A les cases, els metres a partir de 150 valen menys.
  const mEf = r.tipo === 'casa' && m > 150 ? 150 + (m - 150) * 0.9 : m;
  let planta = 1;
  if (tePlanta(r.tipo)) planta = r.tipo === 'atico' && r.planta === 'sinascensor' ? PLANTA_ATIC_SENSE : PLANTA[r.planta];
  const pct = ex.reduce((s, x) => s + (EXTRA_PCT[x] || 0), 0);
  const valor = ZONA[r.op][r.zona] * mEf * TIPUS[r.tipo] * ESTAT[r.estado] * planta * (1 + pct)
    + (ex.includes('garaje') ? GARATGE[r.op] : 0);

  if (venda) {
    const temps = [2, 4];
    if (r.estado === 'reformar') { temps[0]++; temps[1]++; }
    if (r.zona === 'afueras') { temps[0]++; temps[1]++; }
    return {
      op: 'vender',
      valor: a1000(valor),
      sortida: { min: a1000(valor * 0.97), max: a1000(valor * 1.03) },
      tanca: { min: a1000(valor * 0.93), max: a1000(valor * 0.97) },
      risc: a1000(valor * 1.1),
      escala: { min: a1000(valor * 0.8), max: a1000(valor * 1.25) },
      temps: { min: temps[0], max: temps[1] },
      honoraris: Math.max(HONORARIS.minim, a100(valor * HONORARIS.pct)),
    };
  }
  const temps = r.zona === 'afueras' ? [3, 7] : [2, 5];
  return {
    op: 'alquilar',
    valor: a10(valor),
    sortida: { min: a10(valor * 0.96), max: a10(valor * 1.04) },
    tanca: null,
    risc: a10(valor * 1.1),
    escala: { min: a10(valor * 0.8), max: a10(valor * 1.25) },
    temps: { min: temps[0], max: temps[1] },
    honoraris: a10(valor),
  };
}

export async function onRequestPost({ request, env, waitUntil }) {
  let dades;
  try { dades = await request.json(); } catch { return json({ ok: false, error: 'dades' }, 400); }

  const correu = String(dades.correu || '').trim().toLowerCase();
  const codi = String(dades.codi || '');
  const r = dades.respostes || {};
  if (!correu || !/^\d{6}$/.test(codi)) return json({ ok: false, error: 'codi' }, 400);

  const clau = 'codi:' + (await sha256(correu));
  const desat = await env.CODIS.get(clau, 'json');
  if (!desat || desat.caduca < Date.now()) return json({ ok: false, error: 'caducat' }, 400);
  if (desat.intents >= MAX_INTENTS) {
    await env.CODIS.delete(clau);
    return json({ ok: false, error: 'intents' }, 429);
  }

  if ((await sha256(codi + ':' + correu)) !== desat.hash) {
    desat.intents += 1;
    const queda = Math.max(60, Math.ceil((desat.caduca - Date.now()) / 1000));
    await env.CODIS.put(clau, JSON.stringify(desat), { expirationTtl: queda });
    return json({ ok: false, error: 'codi' }, 400);
  }

  // Res fora de les llistes, i res es desa sense el consentiment explícit.
  if (!valides(r) || dades.consentiment !== true) return json({ ok: false, error: 'respostes' }, 400);

  await env.CODIS.delete(clau); // un codi, una valoració

  const e = calcula(r);
  const idioma = ['es', 'ca', 'en'].includes(dades.idioma) ? dades.idioma : 'es';
  const respostes = { op: r.op, tipo: r.tipo, zona: r.zona, m2: Number(r.m2), estado: r.estado };
  if (tePlanta(r.tipo)) respostes.planta = r.planta;
  respostes.extras = r.extras;
  respostes.cuando = r.cuando;

  // Contacte per al seguiment (D1). Si la base de dades falla, l'usuari veu igualment el resultat.
  try {
    await env.LEADS.prepare(
      'INSERT INTO leads (correu, idioma, op, respostes, preu_min, preu_max, risc) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(correu, idioma, r.op, JSON.stringify(respostes), e.sortida.min, e.sortida.max, e.risc).run();
  } catch (err) {
    console.error('D1 leads:', err && err.message);
  }

  const t = RESUM[idioma];
  const n = (x) => x.toLocaleString(t.locale, { useGrouping: 'always' });
  const preu = (x) => (e.op === 'vender' ? n(x) + ' €' : t.alMes.replace('{x}', n(x) + ' €'));
  const tram = (x) => preu(x.min) + ' – ' + preu(x.max);
  const descripcio = [
    t.tipo[r.tipo], n(Number(r.m2)) + ' m²', t.zona[r.zona], t.estado[r.estado],
    tePlanta(r.tipo) ? t.planta[r.planta] : '',
    r.extras ? r.extras.split(',').map((x) => t.extras[x]).join(', ') : t.sinExtras,
  ].filter(Boolean).join(', ');
  const temps = (e.op === 'vender' ? t.tempsVenda : t.tempsLloguer).replace('{a}', e.temps.min).replace('{b}', e.temps.max);
  const honoraris = (e.op === 'vender' ? t.honVenda : t.honLloguer).replace('{x}', n(e.honoraris) + ' €');
  const linies = [
    [e.op === 'vender' ? t.salida : t.renta, tram(e.sortida)],
    e.tanca ? [t.cierre, tram(e.tanca)] : null,
    [t.riesgo, t.masDe.replace('{x}', preu(e.risc)) + '. ' + (e.op === 'vender' ? t.riscVenda : t.riscLloguer)],
    [t.tiempo, temps],
    [t.coste, honoraris],
  ].filter(Boolean);

  // Avís a l'agència per correu (no bloqueja la resposta).
  const avis = [
    'Nueva valoración desde la web de Mirilla',
    '',
    'Correo: ' + correu,
    'Operación: ' + RESUM.es.op[r.op],
    'Casa: ' + [RESUM.es.tipo[r.tipo], r.m2 + ' m²', RESUM.es.zona[r.zona], RESUM.es.estado[r.estado], tePlanta(r.tipo) ? RESUM.es.planta[r.planta] : '', r.extras ? r.extras.split(',').map((x) => RESUM.es.extras[x]).join(', ') : RESUM.es.sinExtras].filter(Boolean).join(', '),
    'Cuándo: ' + RESUM.es.cuando[r.cuando],
    'Rango mostrado: ' + n(e.sortida.min) + ' – ' + n(e.sortida.max) + (e.op === 'vender' ? ' €' : ' €/mes'),
    'Idioma de la web: ' + idioma,
  ].join('\n');
  waitUntil(fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Valoración · Mirilla Inmobiliaria', email: env.BREVO_SENDER },
      to: [{ email: env.BREVO_SENDER }],
      replyTo: { email: correu },
      subject: 'Nueva valoración: ' + RESUM.es.op[r.op] + ' · ' + RESUM.es.cuando[r.cuando],
      textContent: avis,
    }),
  }).catch(() => {}));

  // Resum per a l'usuari, en l'idioma de la web: la mateixa regla que veu a la pantalla.
  const missatgeWa = encodeURIComponent((e.op === 'vender' ? t.waVenda : t.waLloguer)
    .replace('{resumen}', descripcio).replace('{precio}', tram(e.sortida)));
  const enllacWa = 'https://wa.me/' + String(env.WHATSAPP || '').replace(/\D/g, '') + '?text=' + missatgeWa;
  const html = `<div style="font-family:Arial,sans-serif;color:#1E1A17;max-width:540px;line-height:1.55;border-top:4px solid #B08A3E;padding-top:18px">
  <p style="font-size:16px">${t.hola}</p>
  <p style="font-size:15px;color:#56514B">${descripcio}.</p>
  ${linies.map(([k, v]) => `<p style="margin:14px 0 2px;font-size:13px;font-weight:700;color:#1D3F8C">${k}</p><p style="margin:0;font-size:${k === linies[0][0] ? 22 : 15}px;${k === linies[0][0] ? 'font-weight:700' : ''}">${v}</p>`).join('')}
  <p style="font-size:13px;color:#56514B;margin:22px 0">${t.nota}</p>
  <p style="margin:0 0 22px"><a href="${enllacWa}" style="font-weight:700;font-size:15px;background:#1A7A43;color:#fff;text-decoration:none;padding:12px 20px;border-radius:3px;display:inline-block">${t.botoWa}</a></p>
  <p style="font-size:14px;color:#56514B">Mirilla Inmobiliaria · 600 000 000</p></div>`;
  waitUntil(fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Mirilla Inmobiliaria', email: env.BREVO_SENDER },
      to: [{ email: correu }],
      subject: t.assumpte,
      textContent: `${t.hola}\n${descripcio}.\n\n${linies.map(([k, v]) => k + ': ' + v).join('\n')}\n\n${t.nota}\n\n${t.botoWa}: ${enllacWa}\n\nMirilla Inmobiliaria · 600 000 000`,
      htmlContent: html,
    }),
  }).catch(() => {}));

  const { valor, ...public_ } = e;
  return json({ ok: true, ...public_, whatsapp: env.WHATSAPP });
}

const RESUM = {
  es: {
    locale: 'es-ES',
    assumpte: 'La valoración de tu casa · Mirilla Inmobiliaria',
    hola: 'Hola, esta es la valoración orientativa que has pedido en nuestra web.',
    salida: 'Salida recomendada', renta: 'Renta recomendada', cierre: 'Cierre habitual', riesgo: 'Zona de riesgo',
    tiempo: 'Tiempo orientativo', coste: 'Lo que te costaría con Mirilla',
    alMes: '{x} al mes', masDe: 'más de {x}',
    riscVenda: 'Suele quedarse meses en los portales.', riscLloguer: 'Suele costar encontrar inquilino.',
    tempsVenda: 'De {a} a {b} meses para venderla.', tempsLloguer: 'De {a} a {b} semanas para alquilarla.',
    honVenda: 'Unos {x} + IVA: el 3 % del precio final, con un mínimo de 3.000 €. Solo si se vende.',
    honLloguer: 'Una mensualidad + IVA, unos {x}. Al inquilino no le cobramos nada.',
    nota: 'Es una valoración orientativa con precios de ejemplo. La confirmamos viendo tu casa, sin compromiso.',
    botoWa: 'Pedir visita por WhatsApp',
    waVenda: 'Hola, he valorado mi casa en Mirilla para venderla: {resumen}. Precio de salida recomendado: {precio}. ¿Podéis venir a verla?',
    waLloguer: 'Hola, he valorado mi casa en Mirilla para alquilarla: {resumen}. Renta recomendada: {precio}. ¿Podéis venir a verla?',
    sinExtras: 'Sin extras',
    op: { vender: 'Vender', alquilar: 'Alquilar' },
    tipo: { piso: 'Piso', atico: 'Ático', bajo: 'Bajo con patio', casa: 'Casa o adosado' },
    zona: { casco: 'Casco antiguo', centro: 'Centro o ensanche', residencial: 'Barrio residencial', afueras: 'Afueras o urbanización' },
    estado: { reformar: 'Para reformar', entrar: 'Para entrar a vivir', reformado: 'Reformada hace poco' },
    planta: { bajo: 'Bajo o primero', alta: 'Más arriba, con ascensor', sinascensor: 'Más arriba, sin ascensor' },
    extras: { terraza: 'Terraza o patio', garaje: 'Plaza de garaje', trastero: 'Trastero', exterior: 'Exterior y con mucha luz', piscina: 'Piscina comunitaria' },
    cuando: { pronto: 'En los próximos 3 meses', ano: 'Este año', mirando: 'Solo quiere saber cuánto vale' },
  },
  ca: {
    locale: 'ca-ES',
    assumpte: 'La valoració de casa teva · Mirilla Inmobiliaria',
    hola: 'Hola, aquesta és la valoració orientativa que has demanat a la nostra web.',
    salida: 'Sortida recomanada', renta: 'Renda recomanada', cierre: 'Tancament habitual', riesgo: 'Zona de risc',
    tiempo: 'Temps orientatiu', coste: 'El que et costaria amb Mirilla',
    alMes: '{x} al mes', masDe: 'més de {x}',
    riscVenda: 'Sol quedar-se mesos als portals.', riscLloguer: 'Sol costar trobar llogater.',
    tempsVenda: 'De {a} a {b} mesos per vendre-la.', tempsLloguer: 'De {a} a {b} setmanes per llogar-la.',
    honVenda: 'Uns {x} + IVA: el 3 % del preu final, amb un mínim de 3.000 €. Només si es ven.',
    honLloguer: 'Una mensualitat + IVA, uns {x}. Al llogater no li cobrem res.',
    nota: 'És una valoració orientativa amb preus d\'exemple. La confirmem veient casa teva, sense compromís.',
    botoWa: 'Demanar visita per WhatsApp',
    waVenda: 'Hola, he valorat casa meva a Mirilla per vendre-la: {resumen}. Preu de sortida recomanat: {precio}. Podeu venir a veure-la?',
    waLloguer: 'Hola, he valorat casa meva a Mirilla per llogar-la: {resumen}. Renda recomanada: {precio}. Podeu venir a veure-la?',
    sinExtras: 'Sense extres',
    op: { vender: 'Vendre', alquilar: 'Llogar' },
    tipo: { piso: 'Pis', atico: 'Àtic', bajo: 'Baixos amb pati', casa: 'Casa o adossada' },
    zona: { casco: 'Nucli antic', centro: 'Centre o eixample', residencial: 'Barri residencial', afueras: 'Afores o urbanització' },
    estado: { reformar: 'Per reformar', entrar: 'Per entrar a viure', reformado: 'Reformada fa poc' },
    planta: { bajo: 'Baixos o primer', alta: 'Més amunt, amb ascensor', sinascensor: 'Més amunt, sense ascensor' },
    extras: { terraza: 'Terrassa o pati', garaje: 'Plaça de garatge', trastero: 'Traster', exterior: 'Exterior i amb molta llum', piscina: 'Piscina comunitària' },
    cuando: { pronto: 'Els pròxims 3 mesos', ano: 'Aquest any', mirando: 'Només vol saber quant val' },
  },
  en: {
    locale: 'en-GB',
    assumpte: 'Your home valuation · Mirilla Inmobiliaria',
    hola: 'Hi, here is the estimated valuation you asked for on our website.',
    salida: 'Recommended asking price', renta: 'Recommended rent', cierre: 'Usual closing price', riesgo: 'Risk zone',
    tiempo: 'Estimated time', coste: 'What it would cost with Mirilla',
    alMes: '{x} a month', masDe: 'over {x}',
    riscVenda: 'It tends to sit on the listing sites for months.', riscLloguer: 'It tends to take longer to find a tenant.',
    tempsVenda: '{a} to {b} months to sell.', tempsLloguer: '{a} to {b} weeks to let.',
    honVenda: 'About {x} + VAT: 3% of the final price, with a minimum of €3,000. Only if it sells.',
    honLloguer: 'One month\'s rent + VAT, about {x}. Tenants pay us nothing.',
    nota: 'This is an estimate using sample prices. We confirm it when we see your home, with no commitment.',
    botoWa: 'Book a visit on WhatsApp',
    waVenda: 'Hi, I valued my home on Mirilla to sell it: {resumen}. Recommended asking price: {precio}. Could you come and see it?',
    waLloguer: 'Hi, I valued my home on Mirilla to let it: {resumen}. Recommended rent: {precio}. Could you come and see it?',
    sinExtras: 'No extras',
    op: { vender: 'Sell', alquilar: 'Let' },
    tipo: { piso: 'Flat', atico: 'Penthouse', bajo: 'Ground floor with patio', casa: 'House or terraced house' },
    zona: { casco: 'Old town', centro: 'City centre', residencial: 'Residential area', afueras: 'Outskirts or development' },
    estado: { reformar: 'Needs renovating', entrar: 'Ready to move in', reformado: 'Recently renovated' },
    planta: { bajo: 'Ground or first floor', alta: 'Higher up, with a lift', sinascensor: 'Higher up, no lift' },
    extras: { terraza: 'Terrace or patio', garaje: 'Parking space', trastero: 'Storage room', exterior: 'Outward-facing and bright', piscina: 'Shared pool' },
    cuando: { pronto: 'In the next 3 months', ano: 'This year', mirando: 'Just wants to know the value' },
  },
};

export function onRequest() {
  return json({ ok: false, error: 'metode' }, 405);
}
