/**
 * lib/cisloSmlouvy.js
 * Generuje číslo smlouvy appkou přidělené ve formátu `SML-RRRR-pořadí`
 * (např. "SML-2026-001") - viz claude/nomis-faktury-backlog.md, položka 12.
 * Formát appka zvolila podle Janovy volby přes AskUserQuestion
 * ("Formát SML-RRRR-pořadí (Doporučeno)").
 *
 * Pořadí je sekvenční v rámci JEDNOHO roku (appka pro každý rok začíná
 * znovu od 001) - appka najde nejvyšší dosud použité pořadí pro daný rok
 * mezi existujícími smlouvami a přidělí další v pořadí. Používá se jak
 * při ručním založení smlouvy (okamžitě), tak po úspěšném AI vytěžení
 * nahrané smlouvy (viz netlify/functions/smlouvy.js a
 * smlouvy-upload-dokoncit.js), i při jednorázovém zpětném dočíslování
 * starších smluv v netlify/functions/setup.js.
 */
function vygenerujCisloSmlouvy(existujiciSmlouvy, rok) {
  const predpona = 'SML-' + rok + '-';
  let nejvyssiPoradi = 0;
  (existujiciSmlouvy || []).forEach((s) => {
    const cislo = s && s.Cislo_smlouvy;
    if (typeof cislo === 'string' && cislo.startsWith(predpona)) {
      const poradi = parseInt(cislo.slice(predpona.length), 10);
      if (!Number.isNaN(poradi) && poradi > nejvyssiPoradi) nejvyssiPoradi = poradi;
    }
  });
  const dalsiPoradi = nejvyssiPoradi + 1;
  return predpona + String(dalsiPoradi).padStart(3, '0');
}

module.exports = { vygenerujCisloSmlouvy };
