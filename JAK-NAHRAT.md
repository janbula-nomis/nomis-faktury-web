# Nomis Faktury v4.65 – jak to nahrát

## Nejdřív: proč to vypadalo rozbitě

Ve v4.63 dostal seznam přijatých faktur osmý sloupec („Zaúčt."). Nový
sloupec potřebuje **dvě** změny najednou – v `index.html` (buňka navíc)
a v `style.css` (sloupec navíc v mřížce). Balíček změn pro v4.64 ale
`style.css` neobsahoval, protože jsem počítal s tím, že ho máte z v4.63.

Když se nasadí nový `index.html` se starým `style.css`, řádek má osm buněk,
ale mřížka jen sedm sloupců – osmá se zalomí na druhou řádku, nadpis se
ořízne na „Z…" a řádky ztloustnou na dvojnásobek. Přesně to bylo na vašem
snímku. **Chyba byla v balení, ne v appce.**

Do testů proto přibyla pojistka, která hlídá, že počet buněk v hlavičce
sedí s počtem sloupců v mřížce, a od téhle verze každý balíček se změnou
vzhledu obsahuje **celou složku `public/`**, ne jen jednotlivé soubory.

## Co nahrát

**`nomis-v465-ZMENY.zip` – 17 souborů, jedno přetažení.** Obsahuje celou
složku `public/` a k tomu backend k Přijatým fakturám (`lib/dokladySchema.js`,
`lib/nazvyScanu.js`, `netlify/functions/doklady.js`,
`netlify/functions/doklady-prejmenovat-scany.js`), aby to sedělo i kdyby
některá z předchozích verzí nedojela celá.

Postup: GitHub → `nomis-faktury-web` → Add file → Upload files → přetáhnout
**obsah** rozbaleného zipu → Commit.

**Když si nejste jistý, co všechno je nasazené**, nahrajte radši celou appku
ze dvou dávek (`GITHUB-1z2` a `GITHUB-2z2` z v4.64, obsah `lib/` a
`netlify/` se od té doby nezměnil) a pak tenhle balíček navrch.

`/api/setup` spouštět nemusíte, pokud jste ho spustil po v4.63. Jestli ne,
spusťte – list `Doklady` tehdy dostal sloupce `Zauctovano`,
`Zauctovano_kdy`, `Zauctoval` a bez nich zaškrtávátko neuloží.

## Co je ve v4.65

Oprava vzhledu seznamu a **zhutnění**, jak jste chtěl. Řádek se zúžil z 8 na
5 px odsazení a mezera mezi řádky ze 6 na 4 px – na jednu obrazovku se teď
vejde zhruba o třetinu víc dokladů. Písmo zůstává stejné, ubralo se jen
prázdné místo. Zaškrtávátko je vycentrované pod svým nadpisem, takže sloupec
čte jako sloupec.

## Zálohy

`nomis-v465-CELA-APPKA.zip` je celý strom včetně dokumentace a testů.

## Testy

`node test-v463.js` – 60 kontrol. Celkem 258, vše prochází.
