-- Base de dades D1 «mirilla-leads»: contactes de la valoració per fer-ne seguiment.
-- S'aplica amb: npx wrangler d1 execute mirilla-leads --remote --file schema.sql
-- Dades mínimes: cap nom, cap adreça. Només es desa amb el consentiment (functions/api/verifica.js).
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  creat      TEXT NOT NULL DEFAULT (datetime('now')),
  correu     TEXT NOT NULL,
  idioma     TEXT,
  op         TEXT NOT NULL,
  respostes  TEXT NOT NULL,
  preu_min   INTEGER,
  preu_max   INTEGER,
  risc       INTEGER,
  estat      TEXT NOT NULL DEFAULT 'nou'
);
CREATE INDEX IF NOT EXISTS idx_leads_creat ON leads (creat);
