# Nomis Faktury – v4.62 (2026-08-09)

**Nájemné: rozpis a úhrady napříč všemi byty + bezpečné dovytěžení smlouvy**

## Co nahrát na GitHub

Sedm souborů, přetáhněte je do stejných složek jako dosud (GitHub soubory
se stejným názvem přepíše):

| Soubor | Kam | Nový? |
|---|---|---|
| `lib/dovytezeniSmlouvy.js` | `lib/` | **nový** |
| `netlify/functions/smlouvy-upload-dokoncit.js` | `netlify/functions/` | změna |
| `netlify/functions/predpis-plateb.js` | `netlify/functions/` | změna |
| `public/app.js` | `public/` | změna |
| `public/index.html` | `public/` | změna |
| `public/style.css` | `public/` | změna |
| `test-v462.js` | kořen | **nový** |

Limit GitHubu (100 souborů na jedno přetažení) tohle bez problému projde.

## Po nasazení

**Není potřeba spouštět /api/setup.** List `Predpis_plateb` vznikl už
u v4.59; tahle verze žádné nové sloupce nepřidává.

## Co je nového

### 1. Nemovitosti → „Nájemné – rozpis a úhrady (všechny byty)"

Jeden seznam za celé portfolio, jak jste chtěl. Nahoře souhrn (dluh,
předepsáno, uhrazeno, kolikrát po splatnosti) – **zvlášť za Kč a zvlášť za
EUR**, nikdy sečtené dohromady. Pod tím rozpis měsíc po měsíci se
splatností, rozpadem na nájem + zálohy, uhrazenou částkou a stavem. Kauce
má vlastní řádek. Filtr Vše / Jen nezaplacené / Jen po splatnosti.

**„Po splatnosti" se počítá z data**, do tabulky se nic takového
nezapisuje – stav se nesmí změnit jen tím, že si někdo appku otevřel.

Předpis plateb existoval od v4.59 na backendu, ale appka ho **nevolala ani
jednou**. Tohle je ta chybějící obrazovka.

### 2. Smlouvy bez předpisu se hlásí nahoře

Prázdný rozpis neznamená „nikdo nedluží", ale „ještě to nemáme založené".
Appka proto nad tabulkou vypíše nájemní smlouvy bez předpisu a u každé
nabídne tlačítko – podle toho, co jí chybí.

### 3. „Dovytěžit z přílohy" – a hlavně pojistka

Smlouvy nahrané před v4.59 nemají rozpad nájmu, den splatnosti ani VS,
takže z nich předpis nejde vygenerovat. Appka teď umí přílohu z Drive
přečíst znovu.

**Znovu spustit vytěžení šlo i dřív a bylo to nebezpečné** – přepsalo to
celý řádek podle nové AI extrakce, včetně `Stredisko`, což je jediný
účetní klíč. Od téhle verze:

- hotovou smlouvu appka bez výslovného „dovytěžit" **nepřepíše vůbec**;
- v režimu dovytěžení **doplní jen prázdná pole**;
- `Stredisko`, `Firma`, `Typ`, `Název` a `Poznámka` **nezapíše nikdy**,
  ani do prázdna – ukáže je jen v porovnání „v appce × AI našla";
- co je vyplněné, nepřepíše, ale rozdíl **nezamlčí**;
- změna střediska nebo firmy se odklepává zvlášť, s upozorněním.

### 4. Oprava čitelnosti v tmavém motivu

Odznak „Navrženo"/„Částečně" byl v kombinaci **gold/navy skin + tmavý
motiv** prakticky neviditelný (skoro černý text na tmavě modrém pozadí).
Týkalo se to i Dokladů, Vydaných faktur a Bankovních výpisů.

## Testy

`node test-v462.js` – 46 testů, vše prochází. Starší sady v4.52–v4.61
běží dál beze změny.
