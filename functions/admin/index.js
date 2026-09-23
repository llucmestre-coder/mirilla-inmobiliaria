// GET /admin — llista dels contactes de la valoració (protegida per _middleware.js).

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (n) => (n == null ? '' : (Number(n) || 0).toLocaleString('es-ES', { useGrouping: 'always' }) + ' €');
const OP = { vender: 'Vender', alquilar: 'Alquilar' };
const resum = (json) => { try { return Object.entries(JSON.parse(json)).map(([k, v]) => k + ': ' + v).join(' · '); } catch { return json; } };

export async function onRequestGet({ env }) {
  const { results } = await env.LEADS.prepare(
    'SELECT id, creat, correu, idioma, op, respostes, preu_min, preu_max, risc, estat FROM leads ORDER BY id DESC LIMIT 500'
  ).all();

  const files = results.map((l) => `<tr>
    <td>${esc(l.creat)}</td><td><a href="mailto:${esc(l.correu)}">${esc(l.correu)}</a></td>
    <td>${esc(OP[l.op] || l.op)}</td><td>${esc(resum(l.respostes))}</td>
    <td>${euros(l.preu_min)} – ${euros(l.preu_max)}${l.op === 'alquilar' ? '/mes' : ''}</td><td>${esc(l.idioma)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Contactos · Mirilla Inmobiliaria</title>
<style>
  body{margin:0;padding:1.5rem;font:15px/1.45 system-ui,sans-serif;background:#F3F3F0;color:#1E1A17}
  h1{font-size:1.4rem;margin:0 0 .25rem} p{margin:0 0 1rem;color:#56514B}
  a{color:#1D3F8C} .taula{overflow-x:auto;background:#fff;border-radius:3px}
  table{border-collapse:collapse;width:100%;min-width:900px} th,td{padding:.55rem .7rem;text-align:left;border-bottom:1px solid #CFCCC4;vertical-align:top}
  th{font-weight:600;background:#E3E2DC;white-space:nowrap}
</style></head><body>
<h1>Contactos de la valoración</h1>
<p>${results.length} registros (máximo 500 en pantalla) · <a href="/admin/leads.csv">Descargar CSV</a></p>
<div class="taula"><table><thead><tr><th>Fecha (UTC)</th><th>Correo</th><th>Operación</th><th>Respuestas</th><th>Rango mostrado</th><th>Idioma</th></tr></thead>
<tbody>${files || '<tr><td colspan="6">Todavía no hay contactos.</td></tr>'}</tbody></table></div>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
