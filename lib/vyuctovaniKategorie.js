/**
 * lib/vyuctovaniKategorie.js
 * Rozlišení, které Kategorie Dokladu appka počítá jako "služby" - tedy
 * náklad, který appka smí zúčtovat proti záloze na služby zaplacené
 * nájemníkem - a které appka počítá jen jako VLASTNÍ NÁKLAD pronajímatele
 * (appka ho do vyúčtování služeb nájemníkovi NEZAHRNUJE, i když se týká
 * stejné nemovitosti/střediska).
 *
 * Důvod (od v4.37, viz netlify/functions/nemovitosti-vyuctovani.js):
 * zákon č. 67/2013 Sb., o službách spojených s užíváním bytu, appce
 * ukládá zúčtovávat proti záloze jen skutečné SLUŽBY (teplo, voda,
 * odvoz odpadu, úklid společných prostor, provoz výtaje apod.) - náklady
 * jako oprava/údržba nemovitosti, pojištění domu nebo daň z nemovitosti
 * jsou náklad VLASTNÍKA, appka je nesmí přenášet na nájemníka přes
 * vyúčtování služeb ani přes kauci.
 *
 * Appka mapuje na existující číselník `MOZNOSTI_KATEGORIE`
 * (public/app.js, appka ho NEDUPLIKUJE, jen z něj appka vybírá níže
 * uvedenou podmnožinu) - jde o appkou navrženou VÝCHOZÍ mapu, Jan ji
 * může kdykoli poopravit (appka pole drží jako jednoduché pole textů,
 * ne jako appkou spravovaný číselník - změna vyžaduje zásah do kódu a
 * nasazení, stejně jako appka dřív řešila i MOZNOSTI_STREDISKA před
 * v4.25 - pokud by se mapa měnila často, dává smysl ji později
 * appka rozšíří na spravovatelný číselník podobně jako Střediska).
 */
const KATEGORIE_SLUZBY = [
  'Energie (elektřina, plyn, voda)',
  'Služby',
];

function jeKategorieSluzba(kategorie) {
  return KATEGORIE_SLUZBY.includes(String(kategorie || '').trim());
}

module.exports = { KATEGORIE_SLUZBY, jeKategorieSluzba };
