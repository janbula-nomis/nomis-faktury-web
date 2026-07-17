# Nomis Faktury – nasazení webové appky na Netlify

Appka je statická stránka (`public/`) + Netlify Functions (`netlify/functions/`,
Node.js). Data (doklady, firmy, auta, uživatelé) žijí v Google Sheets, soubory
na Google Disku – appka se k nim připojuje přes **OAuth 2.0 pod vaším vlastním
Google účtem** (appka pracuje s vaší identitou a vaší diskovou kvótou;
uživatelé appky žádný Google účet nepotřebují, přihlašují se jen PINem).

> **Pozn. k historii:** appka původně počítala se service accountem
> ("robotím" Google účtem appky). Ukázalo se ale, že service accounty nemají
> vlastní úložiště na Disku a nemohou vytvářet soubory v běžném osobním
> Google Disku (jen v placeném Google Workspace Shared Drive) – hlášení
> appky bylo `Service Accounts do not have storage quota`. Proto appka od
> teď místo service accountu používá OAuth 2.0 s vaším osobním Google účtem.
> Pokud jste dřív nastavovali `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`, tuhle
> proměnnou už appka nepoužívá – klidně ji v Netlify smažte.

## Co budete potřebovat

- Google účet (osobní, i běžný Gmail), pod kterým založíte tabulku Sheets
  a Disk složky – appka bude pracovat pod tímto účtem.
- Google Cloud projekt pro OAuth klienta (zdarma) – pokud jste ho už založili
  kvůli service accountu, použijete ten samý.
- Gemini API klíč – https://aistudio.google.com/apikey.
- Účet na https://netlify.com (zdarma pro tento rozsah).
- Volitelně GitHub účet, pokud chcete nasazení přes propojený repozitář
  (doporučeno – každá změna kódu se pak nasadí automaticky). Jinak lze nasadit
  i ručně přes Netlify CLI.

## 1. Připravte Google Sheet a Disk složky

1. Vytvořte nový Google Sheet, např. „Nomis Group – Doklady“ (pod svým
   osobním Google účtem). Z URL adresy si poznamenejte **SPREADSHEET_ID**
   (dlouhý řetězec mezi `/d/` a `/edit`).
2. Na Disku složku pro doklady **nemusíte zakládat ručně** – appka si svou
   Inbox složku vytvoří sama při prvním spuštění (funkce `setup`, krok 6),
   protože kvůli scope `drive.file` (viz krok 2 níže) by k ručně založené
   složce stejně přístup neměla. `INBOX_FOLDER_ID` proto v kroku 4 zatím
   nechte prázdné/neplatné – funkce `setup` vám na konci vrátí skutečnou
   hodnotu, kterou pak doplníte a appku redeploynete.
3. Sheet, na rozdíl od Disku, zůstává váš vlastní a appka k němu přistupuje
   pod vaší identitou – **žádné sdílení navíc není potřeba**.

## 2. Nastavte OAuth consent screen a získejte OAuth klienta

1. Jděte na https://console.cloud.google.com/, vyberte svůj existující
   projekt (nebo vytvořte nový).
2. V menu „APIs & Services > Library“ zapněte **Google Sheets API** a
   **Google Drive API** (pokud ještě nejsou zapnuté).
3. V „APIs & Services > OAuth consent screen“:
   - User Type: **External**.
   - Vyplňte název appky (např. „Nomis Faktury“), svůj e-mail jako
     support e-mail a jako developer contact e-mail.
   - Scopes ani testovací uživatele není nutné nastavovat zvlášť teď –
     scope si appka „vyžádá“ v kroku 3 přes OAuth Playground.
   - Uložte a na stránce souhrnu OAuth consent screen (v novém rozhraní se
     tato stránka jmenuje „Audience“) klikněte na **„PUBLISH APP“ /
     „Publikovat aplikaci“**, aby se stav změnil z „Testing“ na **„In
     production“**. Tohle je důležité – v režimu „Testing“ vydrží
     přihlašovací token (refresh token) jen 7 dní a appka by po týdnu
     přestala fungovat.
   - **Důležité zjištění z ostrého provozu:** i po publikaci do „In
     production“ Google refresh token appky, která neprošla jeho formální
     verifikací, omezuje na 7 dní – bez ohledu na to, jestli appka žádá
     plný scope Disku (`.../auth/drive`, tzv. „restricted scope“) nebo užší
     `drive.file` (appka používá `drive.file`, viz krok 3.4 a
     `lib/driveHelpers.js`, ale i s ním token po 7 dnech vyprší). Plná
     verifikace appky u Googlu navíc vyžaduje vlastní doménu (ne
     `netlify.app`) pro stránku s privacy policy, což je pro malou appku
     zbytečná komplikace. Appka proto místo verifikace řeší obnovu tokenu
     jinak: **přímo v appce je admin tlačítko „Připojit Google účet
     znovu“** (v záložce Uživatelé), které za pár kliknutí vygeneruje nový
     refresh token bez nutnosti chodit do Google Cloud Console/OAuth
     Playground – jen zkopírujete výsledek do Netlify. Musíte to zopakovat
     zhruba jednou týdně, ale je to otázka minuty. Podrobnosti viz krok 3.4
     a sekce „Obnova Google přístupu appkou“ níže.
4. V „APIs & Services > Credentials“ > „Create Credentials“ > **„OAuth
   client ID“**:
   - Application type: **Web application**.
   - Název: např. „Nomis Faktury OAuth klient“.
   - Do „Authorized redirect URIs“ přidejte **obě** tyto adresy (každou
     zvlášť přes „+ Add URI“):
     ```
     https://developers.google.com/oauthplayground
     https://VAŠE-DOMÉNA.netlify.app/.netlify/functions/google-oauth-callback
     ```
     První je potřeba jen pro prvotní nastavení přes OAuth Playground
     (krok 3), druhá pro tlačítko „Připojit Google účet znovu“ přímo
     v appce (jednou appku nasadíte, doplňte sem její skutečnou
     `.netlify.app` adresu a v Google Cloud Console credential uložte
     znovu – jinak by tlačítko v appce hlásilo `redirect_uri_mismatch`).
   - Vytvořit. Zobrazí se **Client ID** a **Client Secret** – oboje si
     poznamenejte, budete je potřebovat hned v dalším kroku i v kroku 4.

## 3. Získejte refresh token přes Google OAuth Playground

Tohle je jednorázový krok – refresh token pak appka používá napořád (dokud
ho sami neodvoláte).

1. Otevřete https://developers.google.com/oauthplayground/
2. Vpravo nahoře klikněte na ikonu ozubeného kola (Settings).
3. Zaškrtněte **„Use your own OAuth credentials“** a vyplňte **OAuth Client
   ID** a **OAuth Client secret** z kroku 2.4.
4. V levém panelu „Step 1 – Select & authorize APIs“ najděte pole „Input
   your own scopes“ (nebo scope najděte ve stromu) a vložte tyto dva scope,
   oddělené čárkou (pozor, **`drive.file`, ne plný `drive`** – viz vysvětlení
   v kroku 2 výše a v `lib/driveHelpers.js`):
   ```
   https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive.file
   ```
   Do pole nic jiného nevkládejte (žádnou e-mailovou adresu apod.) – pokud
   by se vám tam omylem přimíchal jiný text (např. z automatického
   doplňování v prohlížeči), Google vrátí chybu 400 „invalid_scope“; pole
   před vložením celé smažte (Ctrl/Cmd+A, Delete).
5. Klikněte **„Authorize APIs“**. Přihlaste se Google účtem, pod kterým jste
   v kroku 1 vytvořili Sheet a Disk složku. Google pravděpodobně ukáže
   varování „Google hasn't verified this app“ (protože appka nemá projít
   formální verifikací) – to je v pořádku, je to VAŠE appka. Klikněte
   „Advanced“ / „Rozšířené možnosti“ a pak „Go to Nomis Faktury (unsafe)“
   a odsouhlaste přístup ke Sheets i Disku.
6. Po přesměrování zpět na OAuth Playground klikněte v „Step 2“ na
   **„Exchange authorization code for tokens“**.
7. Zobrazí se mj. pole **„Refresh token“** – zkopírujte si celou hodnotu,
   bude se hodit v kroku 4. (Access token si nezapisujte, appka si ho
   umí sama obnovit z refresh tokenu.)

## 4. Připravte proměnné prostředí pro Netlify

V Netlify (Site settings > Environment variables) nastavte:

| Proměnná | Hodnota |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID z kroku 2.4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret z kroku 2.4 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Refresh token z kroku 3.7 |
| `SPREADSHEET_ID` | ID Google Sheetu (krok 1.1) |
| `INBOX_FOLDER_ID` | zatím libovolná/prázdná hodnota – appka si při prvním spuštění funkce `setup` (krok 6) vytvoří svou vlastní Inbox složku a vrátí vám její skutečné ID, to pak sem doplníte a appku redeploynete |
| `GEMINI_API_KEY` | váš Gemini API klíč |
| `SESSION_SECRET` | libovolný dlouhý náhodný řetězec (např. z `openssl rand -hex 32`) – slouží k podepisování přihlašovacích tokenů |
| `SETUP_SECRET` | libovolné heslo, které použijete jednorázově ke spuštění inicializace listů (krok 6) |

`GEMINI_MODEL` je volitelná – bez ní se použije `gemini-2.5-flash`.
`GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` (pokud jste ji dřív nastavovali) appka
už nečte – v Netlify ji můžete smazat, nijak nevadí, když tam zůstane.

Po uložení proměnných nezapomeňte appku **znovu nasadit** (Netlify > Deploys
> „Trigger deploy“), aby se nové proměnné projevily.

## 5. Nasazení na Netlify

**Varianta A – přes Git (doporučeno):**
1. Nahrajte obsah tohoto balíčku do nového GitHub repozitáře.
2. Na https://app.netlify.com > „Add new site“ > „Import an existing
   project“ > vyberte repozitář.
3. Build settings nechte prázdné (žádný build příkaz), publish directory
   `public` a functions directory `netlify/functions` se nastaví
   automaticky z `netlify.toml`.
4. Doplňte proměnné prostředí z kroku 4, pak „Deploy site“.

**Varianta B – přes Netlify CLI (bez GitHubu):**
```bash
npm install -g netlify-cli
cd nomis-faktury-web
npm install
netlify login
netlify init
# doplňte env proměnné buď přes web administraci, nebo:
netlify env:set GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 "..."
netlify env:set SPREADSHEET_ID "..."
netlify env:set INBOX_FOLDER_ID "..."
netlify env:set GEMINI_API_KEY "..."
netlify env:set SESSION_SECRET "..."
netlify env:set SETUP_SECRET "..."
netlify deploy --prod
```

## 6. Inicializace listů v Sheetu

Po nasazení jednorázově zavolejte setup funkci (vytvoří listy Firmy, Auta,
Doklady, Log, Uzivatele s hlavičkami a ukázkovými daty, pokud ještě
neexistují):

```bash
curl -X POST https://VAŠE-DOMÉNA.netlify.app/api/setup \
  -H "X-Setup-Secret: HODNOTA_SETUP_SECRET"
```

V odpovědi zkontrolujte pole `inboxFolderId` a `inboxVytvorenaNove`. Pokud
je `inboxVytvorenaNove: true`, appka si sama založila novou Inbox složku na
Disku – **zkopírujte hodnotu `inboxFolderId`, nastavte ji jako `INBOX_FOLDER_ID`
v Netlify a appku znovu nasaďte (redeploy)**, jinak appka bude nahrávat
doklady do složky, kterou appka sama vytvořila správně, ale vy jste v env
proměnné měli něco jiného/prázdného – teprve po redeployi s doplněnou
hodnotou to sedne. Novou složku pak najdete na Disku pod názvem „Nomis
Group – Doklady / 00_Inbox“.

Zkontrolujte v Sheetu, že se listy vytvořily. V listu **Uzivatele** je
ukázkový záznam s PINem `1234` a rolí `admin` – **změňte si PIN** a případně
přidejte další uživatele (sloupec `Firmy` = čárkou oddělené přesné názvy
z listu Firmy, `Role` = `admin` nebo prázdné/`user`).

V listu **Firmy** doplňte IČO/DIČ jednotlivých firem (pomáhá to AI při
odhadu, ke které firmě doklad patří).

Po dokončení doporučujeme v Netlify smazat/změnit `SETUP_SECRET`, ať setup
funkci nejde znovu spustit omylem.

**Pozn. k aktualizacím appky:** funkci `setup` je bezpečné (a u větších
aktualizací appky nutné) spustit i opakovaně na appce, která už běží a má
data – nikdy nic nemaže ani nepřepisuje, jen u listů, které ještě
neexistují, je založí, a u listů, kterým v aktualizaci přibyl nový sloupec
(např. `Bankovni_ucet` u Firmy, nebo celý nový list `Bankovni_pohyby` pro
bankovní výpisy), ten sloupec/list doplní na konec. Pokud jste
`SETUP_SECRET` po prvním nasazení smazali, budete ho muset před
opakovaným spuštěním v Netlify dočasně znovu nastavit.

## 7. Vyzkoušení

1. Otevřete `https://VAŠE-DOMÉNA.netlify.app`.
2. Přihlaste se PINem z listu Uzivatele.
3. V záložce „Nahrát doklad“ vyfoťte/vyberte testovací fakturu nebo účtenku
   a nahrajte.
4. V záložce „Doklady“ zkontrolujte AI odhad, případně opravte firmu/
   kategorii/SPZ a uložte, pak klikněte „Schválit“.
5. V záložce „Přehled“ uvidíte souhrny podle firmy/kategorie/měsíce.
6. Přihlásíte-li se jako admin, uvidíte navíc záložky „Uživatelé“, „Firmy“
   a „Auta“ – přímo v appce tak můžete přidávat/upravovat/mazat uživatele
   (jméno, PIN, přístup k firmám, role), firmy (název, IČO, DIČ, plátce DPH
   – název firmy se ale po založení už nedá změnit, protože se používá jako
   identifikátor jinde v appce) a auta (SPZ, model, firma, řidič), aniž
   byste museli cokoliv ručně upravovat přímo v Google Sheets.

## 8. Obnova Google přístupu appkou (bez Google verifikace)

Appka je neověřená OAuth aplikace u Googlu (viz krok 2), takže jí refresh
token vyprší přibližně jednou za týden, ať appka žádá jakýkoliv scope.
Místo ručního opakování kroku 3 (Google Cloud Console + OAuth Playground)
appka má vlastní zkratku:

1. Přihlaste se do appky jako **admin**.
2. Jděte do záložky **„Uživatelé“** – nahoře uvidíte box „Google účet
   appky“.
3. Klikněte **„Připojit Google účet znovu“** – otevře se nové okno
   s Google přihlášením (stejné jako u OAuth Playground – „unverified
   app“ varování, Advanced → pokračovat).
4. Po odsouhlasení appka zobrazí novou hodnotu refresh tokenu ke
   zkopírování a stručný návod.
5. Vložte hodnotu jako `GOOGLE_OAUTH_REFRESH_TOKEN` v Netlify (přepište
   starou) a klikněte **Deploys → Trigger deploy → Deploy site**.

Tohle nahrazuje krok 3 při každé další obnově – Google Cloud Console už
pak nemusíte otevírat vůbec, jen tuhle appku a Netlify. Předpokladem je,
že jste v kroku 2.4 přidali obě „Authorized redirect URIs“ (Playground
i appčinu vlastní adresu) – jinak tlačítko skončí chybou
`redirect_uri_mismatch`.

## 9. Bankovní výpisy (párování plateb s doklady)

Appka umí naimportovat výpis transakcí exportovaný z **George Business**
(Česká spořitelna) ve formátu **JSON** (v George Business: Historie
transakcí → Exportovat → JSON – appka na to formát CSV ani Excel
nepoužívá, JSON appce dává spolehlivější strukturovaná data). Přístup
k téhle záložce mají jen role **admin** a **účetní** (novou roli přidáte
v Nastavení → Uživatelé).

1. Přihlaste se jako admin nebo účetní a jděte do záložky **„Bankovní
   výpisy“**.
2. Nahoře vyberte firmu, ke které výpis patří – appka vždy pracuje jen
   s jednou firmou najednou, ať se výpisy různých firem nesmíchají.
3. Klikněte **„Nahrát výpis (JSON)“** a vyberte exportovaný soubor.
4. Appka pohyby naimportuje, poplatky a příchozí platby rovnou označí
   „Bez dokladu“ (u příjmů appka doklad nevyžaduje – appka eviduje jen
   výdajové doklady/účtenky) a u zbylých výdajů zkusí najít odpovídající
   doklad podle částky, variabilního symbolu, data a jména dodavatele. Při
   opakovaném nahrání stejného (třeba průběžně rostoucího celoročního)
   výpisu appka už jednou naimportované pohyby pozná a přeskočí, jen
   doplní nové.
5. U řádků se stavem „Navrženo“ shodu buď potvrďte, nebo zamítněte. U
   řádků „Chybí doklad“ doklad buď přiřaďte z existujících, nebo rovnou
   nahrajte nový (appka ho stejně jako v záložce „Nahrát doklad“ vytěží
   přes Gemini a rovnou propojí s daným pohybem), nebo řádek označte „Bez
   dokladu“ (mzdy, nájem, přesuny mezi vlastními firmami apod.).

Appka si při prvním importu k firmě sama zapamatuje číslo bankovního účtu
z výpisu (pole „Bankovní účet“ v záložce Firmy) – při každém dalším
importu pak zkontroluje, že vybraná firma odpovídá účtu ve výpisu, a pokud
ne, upozorní vás dřív, než by se výpis omylem přiřadil ke špatné firmě.

## 10. Vydané faktury, středisko, Nastavení a tmavý režim

Od verze v3.0 appka přidává:

- **Vydané faktury** – nová samostatná záložka (ne součást Dokladů) pro
  evidenci faktur, které firmy skupiny Nomis Group vystavují odběratelům:
  zákazník, číslo faktury, částka, datum vystavení/splatnosti a stav
  uhrazeno/neuhrazeno. Appka sama dopočítá „Po splatnosti“ podle dnešního
  data u neuhrazených faktur po splatnosti – to se nikam neukládá, jen se
  tak zobrazí. Vyžaduje nový list **Vydane_faktury** v Sheetu – po nasazení
  proto znovu spusťte `setup` funkci (viz krok 6), appka list sama založí.
- **Středisko** – nový číselník u Dokladů s pevnou volbou „Auta“ nebo
  „Nemovitosti“, aby šlo náklady třídit i podle střediska, ne jen podle
  kategorie a firmy. Vyžaduje nový sloupec `Stredisko` v listu Doklady –
  opět stačí znovu spustit `setup`, appka sloupec doplní na konec, nic
  nesmaže.
- **Nastavení** – záložky Uživatelé, Firmy, Auta a napojení na Google se
  přesunuly z hlavního menu do jedné souhrnné záložky „Nastavení“
  (rozbalovací sekce), ať je hlavní menu přehlednější. Vidí ji jen role
  admin, stejně jako dřív. Bankovní výpisy zůstávají v hlavním menu, tam
  k nim potřebuje rychlý přístup i účetní.
- **Tmavý režim** – ikona 🌙/☀️ v hlavičce appky (vedle jména uživatele)
  přepíná světlý/tmavý motiv, appka si volbu pamatuje v prohlížeči.
- Zaškrtávátko „Zobrazit jen chybějící doklady“ v Bankovních výpisech je
  teď kompaktní ikona 🔎 místo textového checkboxu (najetím myší/podržením
  na ikoně se zobrazí popisek).
- **Firma u Dokladů se od v3.1 vybírá z rozbalovacího menu** (číselník
  Firmy), ne ručním psaním – jinak by sebemenší překlep způsobil, že appka
  doklad nenajde jako kandidáta při párování bankovního výpisu (to hledá
  přesnou shodu názvu firmy). Sloupce Firma/Kategorie/Středisko/SPZ mají
  taky větší minimální šířku, ať se plný název firmy vejde do zavřeného
  výběru.

## 11. Automatické doplňování podle historie dodavatele (od v3.2)

Appka teď u nového dokladu kromě AI odhadu (Gemini) zkusí i „naučenou“
shodu podle dodavatele:

1. Gemini nově navíc odhadne i **středisko** (Auta/Nemovitosti), ne jen
   firmu/kategorii/SPZ jako dřív.
2. Appka se podívá, jestli už dřív **ručně potvrdila** (tedy ne jen AI
   odhadla) doklad od stejného dodavatele – přednostně podle IČO, jinak
   podle normalizovaného názvu (tolerantní na velikost písmen a s.r.o./a.s.
   přípony). Pokud najde shodu, rovnou převezme firmu/kategorii/středisko
   z toho dřívějšího potvrzeného dokladu (u víc historických dokladů
   vyhrává většina, při remíze novější), místo aby spoléhala jen na
   čerstvý AI odhad.
3. Appka výslovně bere v potaz jen **potvrzené** doklady (pole
   Firma_potvrzena vyplněné) – ne holé AI odhady, ať se neučí z vlastních
   chyb, ale ze skutečných rozhodnutí uživatele.
4. Nový doklad tak může mít firmu/kategorii/středisko rovnou předvyplněné
   – appka to ale nikdy sama neschvaluje (stav zůstává „Ke kontrole“) a do
   pole Poznámka appka napíše, že šlo o doplnění podle historie, ať je
   jasné, že stojí za to to zkontrolovat. Tahle poznámka se zobrazí přímo
   pod jménem dodavatele v záložce Doklady.

Bez potřeby nové sheet/sloupce – funguje na stávajících datech, nic
nevyžaduje znovu spustit `setup`.

## 12. Smazání a rozšířená editace dokladů (od v3.3)

V záložce Doklady jde teď u každého dokladu přímo v tabulce upravit i
**Dodavatel, Datum, Částka a Měna** (dřív šlo měnit jen Firma/Kategorie/
Středisko/SPZ) – tlačítko „Uložit“ pošle všechny hodnoty najednou stejným
PATCH endpointem jako dřív, žádná nová sheet/sloupec není potřeba.

Nově přibylo i tlačítko **„Smazat“**:

1. Appka se nejdřív zeptá na potvrzení (jméno dodavatele v dotazu), ať se
   doklad nesmaže omylem jedním kliknutím.
2. Smazat může **kdokoli, kdo má k dokladu přístup** – tedy stejné pravidlo
   jako pro úpravu/schválení (`maPristupKDokladu`), **není to jen pro
   admina**. Jde o vědomé rozhodnutí, aby si běžní uživatelé mohli sami
   opravit vlastní omyl (např. nahráli špatný soubor), bez čekání na
   administrátora.
3. Pokud byl smazaný doklad napárovaný na nějaký bankovní pohyb v záložce
   Bankovní výpisy, appka ten pohyb automaticky vrátí do stavu
   „Nespárováno“ (vyprázdní odkaz na smazaný doklad), ať tam nezůstane
   pohyb odkazující na neexistující doklad.

Bez potřeby nové sheet/sloupce ani znovu spustit `setup`.

## 13. Oprava „NaN Kč“ u částek s haléři (od v3.5)

V Bankovních výpisech se u jedné konkrétní platby (zahraniční transakce
kartou přepočtená z EUR, tedy částka s haléři, ne celá koruna) objevilo
**„NaN Kč“** místo částky. Skutečná příčina **není** poškozený/neúplný
George export (tahle položka se z George JSON parsuje naprosto v pořádku,
ověřeno na Janově reálném souboru) – je to o úroveň níž, v tom, jak appka
čte čísla zpátky z Google Sheets:

`readSheetObjects` (viz `lib/sheetsHelpers.js`) používá výchozí
`valueRenderOption` Sheets API, tzv. `FORMATTED_VALUE` – appka tak dostává
čísla naformátovaná přesně tak, jak je vidět v UI Sheets, ne surová čísla.
U celého čísla to náhodou vypadá jako platný JS zápis (např. `"-1717"`),
ale desetinné číslo se v české lokalizaci Sheets vrátí s **čárkou** místo
tečky (např. `"-2029,91"`) a případně mezerou jako oddělovačem tisíců
(`"1 234,56"`). Obyčejné `Number()` na takovém řetězci vrátí `NaN` (proto
"NaN Kč"), a `parseFloat()` by to bylo ještě zákeřnější – tiše by uřízlo
desetinná místa (`parseFloat("2029,91")` → `2029`), takže by appka rovnou
počítala s nepřesnou částkou, aniž by to bylo vidět. Netýkalo se to tedy
jen zobrazení v Bankovních výpisech, ale i:
- párování bankovního pohybu s dokladem podle částky (`navrhniShodu`),
- detekce možné duplicity dokladu podle částky (`isMoznaDuplicita`),
- součtů v Přehledu (`dashboard.js`),
- editovatelného pole Částka u dokladu v Dokladech (`<input type="number">`
  by takovou hodnotu s čárkou vůbec nepřijal a zobrazil by se prázdný).

Oprava: nová sdílená funkce `parsujCastkuZListu` (`lib/bankHelpers.js` na
backendu, stejná logika zduplikovaná v `public/app.js` na frontendu, appka
nemá build krok, takže si frontend nemůže lib/ soubor naimportovat) –
normalizuje řetězec (odstraní mezery, nahradí čárku tečkou) před
převodem na číslo, a jako pojistku vždy vrátí platné konečné číslo (0
místo NaN/Infinity). Použita všude výše. Zobrazení částek teď navíc
správně ukazuje i haléře (dřív appka zaokrouhlovala na celé koruny), např.
„-2 029,91 Kč“ místo dřívějšího zaokrouhleného „-2 030 Kč“.

**Existující už uloženou „NaN“ hodnotu appka sama zpětně neopraví** (u
staršího řádku, který vznikl před touhle opravou) – tu je potřeba doplnit
ručně přímo v Google Sheets, v listu `Bankovni_pohyby`, sloupec `Castka`
u dotčeného řádku (částku dohledáte v bankovním výpisu/historii účtu).
Nové importy i všechny nové výpočty už touhle chybou netrpí.

Bez potřeby nové sheet/sloupce ani znovu spustit `setup`.

## 14. Doklad hrazený mimo účet (hotově/soukromou kartou) (od v3.6)

V Dokladech přibyl nový sloupec **„Mimo účet“** (checkbox) – zaškrtne se
u dokladu, který byl uhrazen hotově nebo soukromou kartou, tedy u kterého
appka nikdy nenajde protějšek v Bankovních výpisech (tam se páruje jen
odchozí platba z firemního účtu). Appka doklad kvůli chybějícímu
bankovnímu pohybu nijak neblokovala ani předtím, tenhle příznak jen dělá
zjevným i vizuálně, že se u konkrétního dokladu párování nečeká - pro
účetní, ne pro appku samotnou (appka na hodnotu zatím nijak automaticky
nereaguje, jde čistě o informační štítek).

Nový sloupec `Hrazeno_mimo_ucet` v listu Doklady (`lib/dokladySchema.js`)
– **po nasazení téhle verze je potřeba znovu spustit `/api/setup`**, ať
appka sloupec doplní do existujícího listu (bezpečné, nic nemaže).

Mimochodem, `setup.js` teď hlavičky listu Doklady čte přímo
z `lib/dokladySchema.js` místo dřívější ruční duplikace na dvou místech
(`DOKLADY_HEADERS` byl u `Stredisko` v v3.0 doplněný jen na jednom místě,
což u příštích sloupců snadno vede k tomu, že se na tu druhou kopii
zapomene) – od teď je jeden zdroj pravdy.

## 15. Import bankovních výpisů v CSV a XLS/XLSX (od v3.6)

Kromě George Business JSON exportu appka teď umí naimportovat výpis i jako
**CSV** nebo **XLS/XLSX** – appka pozná formát podle přípony souboru
(tlačítko „Nahrát výpis (JSON/CSV/XLS)“ v záložce Bankovní výpisy). Vhodí se
to hlavně pro výpisy ze zahraničních/jiných bank, které George formát
nemají.

Na rozdíl od George JSON parseru appka u CSV/XLS **nezná předem přesné
názvy sloupců** – žádný reálný Janův CSV/XLS export nebyl při vývoji
k dispozici, takže appka (`lib/bankImportTabular.js`) sloupce hledá podle
seznamu běžných aliasů (např. sloupec s datem pozná podle „Datum“, „Date“,
„Datum zaúčtování“, „Booking“ apod., částku podle „Částka“, „Amount“,
„Objem“ apod. – normalizovaně, bez ohledu na velikost písmen a diakritiku).
Pokud appka v souboru sloupec s datem nebo částkou nenajde, vrátí
srozumitelnou chybu a vypíše hlavičky, které v souboru skutečně našla –
v tom případě prosím pošlete Janovi/vývojáři ukázkový soubor (stačí pár
řádků, klidně s vymyšlenými částkami), ať se seznam aliasů doladí na
skutečný formát banky.

Důležité rozdíly oproti JSON importu:
- **Kontrola shody bankovního účtu firmy** („účet nesedí“, viz sekce 9)
  funguje jen u JSON importu – George export nese číslo účtu majitele,
  CSV/XLS ho neobsahují, takže se u nich tahle kontrola přeskakuje. Vybírejte
  proto u CSV/XLS importu firmu obzvlášť pozorně.
- U CSV appka sama pozná oddělovač (středník, nebo čárka, pokud je v souboru
  četnější) a umí i buňky v uvozovkách.
- U XLSX appka potřebuje balíček `xlsx` (přidán do `package.json` – Netlify
  ho při nasazení nainstaluje automaticky přes `npm install`, nic ručně
  dělat netřeba).
- Rozpoznávání duplicit (aby se stejný výpis nedal naimportovat dvakrát)
  funguje stejně jako u JSON – appka počítá otisk (hash) z datumu, částky,
  VS/KS/SS, protistrany a popisu.

## 16. Jednotka u Vydaných faktur a rozšířený číselník Středisko (od v3.6)

Přibylo pole **„Jednotka“** u Vydaných faktur (`lib/vydaneFakturySchema.js`,
sloupec `Jednotka`) – appka do něj zapisuje, ke které nemovitosti/autu se
vydaná (typicky nájemní) faktura vztahuje, např. „V Parku 695 - byt 47“
nebo „Holečkova 1a“. Zákazník/nájemník se pořád píše do stávajícího pole
Zákazník – Jednotka jen upřesňuje, za co se platí. V přidávacím formuláři
je to textové pole s nápovědou (našeptávač), appka ale přijme i libovolný
vlastní text.

Číselník **Středisko** (u Dokladů, tj. nákladů) byl rozšířen z obecných
„Auta“/„Nemovitosti“ na konkrétní auta a nemovitosti skupiny Nomis Group
(`MOZNOSTI_STREDISKA` v `public/app.js`). Středisko a Jednotka mají
záměrně **jinou granularitu tam, kde se náklady a příjmy dělí jinak**:
- U bytů V Parku 695 (NOMIS Homes) a Ramonova 3466/4 (Hagibor, NOMIS CZ) je
  Středisko i Jednotka na stejné úrovni (jeden nájemník na byt).
- U Holečkova (nová firma „FO“ – fyzická osoba) appka eviduje **náklady**
  (Středisko) na celou jednotku „Holečkova 1“, „Holečkova 7“, „Holečkova 9“,
  „Holečkova - garáž“, protože náklady na byt/garáž jako celek se nedělí.
  **Nájmy** (Jednotka u Vydaných faktur) jsou naopak jemnější – „Holečkova
  1a“, „Holečkova 1b“, „Holečkova 7a“, „Holečkova 7b“ (byty 1 a 7 se dělí na
  dvě samostatně pronajímané jednotky), „Holečkova 9“ a „Holečkova - garáž“
  (ty se nedělí, takže jsou stejné jako ve Středisku).

**Důležité – co je potřeba doplnit ručně:** tenhle číselník je jen
předvyplněný seznam pro rozbalovací nabídky (dropdown/našeptávač) v appce,
**appka jím nezakládá žádné skutečné řádky** v listech Auta/Firmy. Nová auta
(Porsche 911, Tesla, VW Passat, Audi A5, Hyundai Kona), nová firma „FO“
(placeholder název – přejmenujte v Nastavení → Firmy na skutečný název, až
budete mít) a jejich SPZ je potřeba přidat ručně přes Nastavení (záložky
Firmy/Auta), stejně jako doteď u ostatních firem/aut. Číselník Středisko/
Jednotka v `public/app.js` slouží jen k tomu, aby šlo hned vybírat ze
správných hodnot, ne k automatickému založení dat.

## 17. Firma s víc bankovními účty (od v3.6)

Firma může mít víc bankovních účtů (typicky samostatný CZK a EUR účet).
Přibyl nový list **Ucty** (`lib/uctySchema.js`, sloupce `ID`, `Firma`,
`Cislo_uctu`, `Mena`, `Popis`) a nová sekce **„Účty“** v Nastavení (vidí
jen admin) pro jejich správu – přidání/úprava/smazání, obdoba sekce Auta.

Kontrola shody účtu při importu výpisu (sekce 9, „účet nesedí“) teď hlídá
shodu s **kterýmkoli** účtem firmy v seznamu Ucty, ne jen jedním. Starší
pole **Bankovní účet** u firmy (list Firmy) appka nadále čte jako jeden
„dřívější“ známý účet vedle Ucty – nic se automaticky nemigruje, obojí se
jen sčítá dohromady při kontrole. Když appka o firmě zatím nezná žádný
účet (ani v Ucty, ani ve starším poli u Firmy) a výpis nese číslo účtu
(George JSON export), appka ho sama založí jako první řádek v Ucty – u
CSV/XLS importu appka číslo vlastního účtu nezná, takže se tohle
automatické založení týká jen JSON importu.

Nový sloupec **`Cislo_uctu_vlastni`** v listu Bankovni_pohyby
(`lib/bankSchema.js`) – appka si u každého pohybu poznamená, ze kterého
vlastního účtu firmy platba je (u George JSON, kde appka číslo zná; u
CSV/XLS zůstává zatím prázdné). Nezaměňovat se stávajícím sloupcem
`Cislo_uctu_protistrany`, což je účet DRUHÉ strany platby.

Po nasazení téhle verze je potřeba znovu spustit `/api/setup` (založí
list Ucty, doplní sloupec `Cislo_uctu_vlastni` do Bankovni_pohyby –
bezpečné, nic nemaže) a doplnit Janovy skutečné účty (pokud appka je
sama nezaložila při prvním importu) přes Nastavení → Účty.

## 18. Doklady jako skládací řádky + rozdělení Ke schválení/Schválené (od v3.7)

Reakce na dva problémy z ostrého provozu:

1. **Schválené doklady zůstávaly promíchané s čekajícími** – appka dřív
   měla Doklady jako jeden společný seznam, takže po kliknutí na „Schválit“
   doklad jen změnil barvu řádku, ale zůstal na místě mezi nevyřízenými.
   Teď je záložka Doklady rozdělená na dvě samostatné sekce přepínačem
   nahoře: **„Ke schválení“** (stavy Ke kontrole + Možná duplicita) a
   **„Schválené“** (historie). Kliknutím na „Schválit“ doklad okamžitě
   zmizí z „Ke schválení“ a objeví se v „Schválené“ – přechod je teď vidět
   jako skutečná změna, ne jen barevná změna štítku ve stejném seznamu.
   Obě záložky v popisku ukazují aktuální počet, např. „Ke schválení (3)“.
2. **Tabulka Dokladů byla na užším okně/tabletu nutné vodorovně
   posouvat** – dřív to byla jedna široká tabulka s 11 sloupci (Stav,
   Dodavatel, Datum, Částka, Firma, Kategorie, Středisko, SPZ, Mimo účet,
   Soubor, Akce), zabalená jen v `overflow-x:auto` – i na běžném
   nezvětšeném okně notebooku nebo na tabletu tak appka nutila
   k vodorovnému scrollování (mobilní karty se spustily až pod 480px
   šířky). Doklady jsou teď skládací řádky (stejný vzor, jaký appka od
   v2.0 používá u Bankovních výpisů) – sbaleně vidíte jen Stav/Dodavatel/
   Datum/Částku (vejde se na jakoukoli šířku obrazovky bez posouvání),
   rozkliknutím řádku se otevřou zbylá pole (Firma, Kategorie, Středisko,
   SPZ, Mimo účet, poznámka, odkaz na soubor) i tlačítka Uložit/Schválit/
   Smazat.

Beze změny zůstává: sloupce v Sheets (`lib/dokladySchema.js`), backend
endpoint `doklady.js`, ukládání/schvalování/mazání – jde čistě o změnu
zobrazení na frontendu (`public/app.js`, `public/index.html`,
`public/style.css`). Není potřeba znovu spouštět `/api/setup`.

Ověřeno automatizovaným testem v headless Chromu (Playwright) – ověřeny
počty v obou záložkách, že sekce „Ke schválení“ ukazuje jen nevyřízené
doklady, že rozkliknutí řádku zobrazí editovatelná pole, že kliknutí na
„Schválit“ přesune doklad do „Schválené“, a že obsah nepřeteče přes šířku
okna při 700px i 360px (typická šířka telefonu).

## 19. Oprava: schválený doklad se hned nepřesunul do „Schválené“ (v3.7.1)

Po nasazení v3.7 přišlo hlášení z ostrého provozu, že po kliknutí na
„Schválit“ doklad nezmizel z „Ke schválení“ a neobjevil se ve
„Schválené“ – i když stejný postup v testovacím prostředí fungoval
správně. Nejpravděpodobnější příčina: appka po úspěšném uložení změny
(`ulozZmenu`) dřív rovnou volala kompletní nové načtení dokladů ze
serveru (`nactiDoklady()`, tedy nový GET). Google Sheets API má po zápisu
krátké okno tzv. eventual consistency, kdy GET těsně po předchozím zápisu
může ještě vrátit starou hodnotu – takže se mohlo stát, že appka po
Schválit hned zase přepsala právě schválený doklad starým stavem „Ke
kontrole“ vráceným z toho GETu, a doklad tak zůstal (aspoň chvíli) ve
špatné sekci.

Oprava: `ulozZmenu` a `smazDoklad` v `public/app.js` už po úspěšném
zápisu na server nevolají nové kompletní načtení. Místo toho rovnou
promítnou provedenou změnu do už načteného seznamu v prohlížeči
(`dokladySeznamAktualni`) a překreslí z něj – appka se tak už nespoléhá
na to, že server hned vrátí čerstvá data. Zároveň přibyla jasná
potvrzovací hláška pod přepínačem sekcí („Doklad schválen – najdete ho
v sekci Schválené.“ / „Změna uložena.“ / „Doklad smazán.“), aby bylo i
vizuálně jednoznačné, že se akce provedla a kam doklad putoval.

Ověřeno novým Playwright testem, který cíleně simuluje zpožděný/„stale“
GET (server interně vrátí starou verzi dat ještě 1,5 s po PATCH) – appka
i tak ihned (do 300 ms) ukáže schválený doklad ve „Schválené“, protože už
nečeká na server. Beze změny zůstává schéma v Sheets i backend endpoint
`doklady.js` – jde o čistě frontendovou opravu, není potřeba `/api/setup`.

## 20. Kompaktnější vzhled, přejmenování appky, zrušení SPZ, záložka Export (v3.8)

Reakce na zpětnou vazbu ke screenshotu appky:

1. **Kompaktnější a modernější vzhled** – zmenšeny a sjednoceny velikosti
   písma napříč celou appkou (nadpisy, popisky, tlačítka, tabulky,
   skládací řádky Dokladů/Bankovních výpisů), zmenšené odsazení karet
   a mírně zaoblenější rohy (`public/style.css`, nové proměnné `--radius`
   a `--radius-sm`). Čistě vizuální změna, žádná funkce se nemění.
2. **Přejmenování appky** – „Nomis Faktury“ nahrazeno textem „NOMIS Group
   evidence dokladů“ (v `<title>`, na přihlašovací obrazovce i v hlavičce
   appky).
3. **Místo na logo** – v hlavičce appky (na přihlašovací obrazovce i
   v hlavní appce) je nově rezervovaný čtverec vedle názvu (`.misto-logo`
   v `public/style.css`) – zatím jen prázdný rámeček, až Jan pošle logo,
   stačí ho vložit jako `<img>` na stejné místo v `public/index.html`.
4. **Zrušeno samostatné pole SPZ u Dokladů** – konkrétní auto je teď
   součástí číselníku Středisko (např. „Auto - Tesla“, viz v3.6), takže
   by šlo o duplicitní údaj. Appka pole SPZ v detailu dokladu už
   nezobrazuje ani neukládá; sloupec `SPZ_auta` v Sheets zůstává
   beze změny kvůli starším záznamům. Beze změny zůstává SPZ u listu
   Auta v Nastavení (tam jde o evidenci vozového parku, ne o doklady).
5. **Nová záložka Export** (vidí role admin a účetní, stejně jako
   Bankovní výpisy) – filtry Firma/Měsíc/Rok/Středisko a přehled
   nákladů podle firmy (počet dokladů, celková částka) pro účetní.
   Zatím jen náhled na obrazovce – stahovatelný export přímo ve formátu
   pro účetní program **Money S3 (modul XML DE)** appka doplní, jakmile
   dostane od Jana přesný formát/ukázkový export (appka zatím ten formát
   nezná, viz `nomis-faktury-architektura.md`, sekce „Rizika a omezení“).
   Do té doby záložka zobrazuje jasnou informační poznámku, že tahle
   část ještě chybí, ať to nepůsobí jako přehlédnutí.

Čistě frontendová sada změn (`public/index.html`, `public/app.js`,
`public/style.css`) – žádný nový sloupec v Sheets, žádná změna backendu,
není potřeba `/api/setup`. Ověřeno novým Playwright UI testem (kompaktní
rozvržení bez vodorovného přetečení při 700px i 360px, přejmenovaná
hlavička s místem na logo, pole SPZ zmizelo z detailu dokladu, filtry
Exportu se naplní a přehled podle firem se správně přepočítá) i plnou
regresí existujících testů (beze změny, protože jde o frontend).

## 21. Oprava: na jiném zařízení nebylo vidět schválení dokladu ani po F5 (v3.8.1)

Jan nahlásil, že po schválení dokladu na jednom zařízení se ta samá
změna neobjevila na jiném zařízení – a to ani po obyčejném obnovení
stránky (F5). Skutečná data v Google Sheets byla v pořádku (appka je
zapsala správně), problém byl v tom, že appka API odpovědi (`GET
/api/doklady` a další) vůbec neoznačovala jako „nikdy necachovat“:

- Backend (`lib/http.js`, sdílená funkce `json()` pro všechny Netlify
  Functions) nepřidávala žádnou `Cache-Control` hlavičku, takže bylo čistě
  na prohlížeči/síti, jestli si odpověď z GETu někde po cestě uloží a
  příště vrátí tu starou – běžné obyčejné F5 totiž porovná jen hlavní
  HTML stránku se serverem, ale dílčí požadavky (včetně API volání přes
  `fetch`) může prohlížeč klidně vzít z vlastní mezipaměti, pokud mu v tom
  nic explicitně nezabrání. Na některých zařízeních/sítích (typicky
  mobilní prohlížeč nebo síť s cachovací proxy) se tak mohlo stát, že GET
  vrátil starší verzi dat, i když na serveru už byla čerstvá.
- Frontend (`public/app.js`, `zavolejApi()`) navíc při volání `fetch()`
  nezadával žádné `cache` chování, takže nechal na prohlížeči výchozí
  (nespolehlivé) rozhodnutí.

**Oprava**: `lib/http.js` teď u každé API odpovědi posílá
`Cache-Control: no-store, no-cache, must-revalidate` a `Pragma:
no-cache`, a `zavolejApi()` v `public/app.js` volá `fetch()` s `cache:
'no-store'` – appka tak na všech zařízeních vždy vynutí čerstvý dotaz na
server, nikdy neukáže starou uloženou odpověď. Beze změny zůstává datový
model i žádný z endpointů nemění chování, jde jen o hlavičky/chování
requestu – ověřeno plnou regresí 14 backendových testů (beze změny
výstupu) i existujícími Playwright UI testy. Po nasazení téhle verze
doporučujeme na všech zařízeních appku jednou tvrdě obnovit (na počítači
Ctrl/Cmd+Shift+R, na mobilu appku v prohlížeči zavřít a znovu otevřít),
ať se jistě načte tahle opravená verze místo případně už uložené staré.

## 22. Odolnější nahrávání dokladu proti chybě 504 (v3.9)

Jan nahlásil, že se mu při nahrávání dokladu přes „Nahrát soubor“ objevila
chyba „Chyba serveru (504)“. Šlo o stejný mechanismus, který už appka dřív
zmiňovala v sekci Řešení problémů (Gemini dočasně přetížené / appka narazí
na časový limit Netlify funkce nebo brány před ní) – souborem/cestou
nahrání (foto vs. soubor) to nesouviselo, obě cesty sdílí stejné zpracování
na klientovi i na serveru.

Skutečný problém byl v tom, že appka do v3.8.1 dělala VŠECHNO v jednom
synchronním volání: nahrání na Drive, přečtení Firmy, AI extrakci (až 3
modely), kontrolu duplicity, dohledání historie a zápis do listu Doklady.
Pokud bylo Gemini jen mírně pomalejší, celková doba klidně přesáhla časový
limit a appka skončila neprůhledným 504 – a to i když se soubor mezitím
v pořádku nahrál na Drive; uživatel to ale nepoznal a musel by fotku/soubor
nahrávat celou znovu.

**Oprava**: nahrání dokladu je od téhle verze rozdělené na dvě fáze:

1. `netlify/functions/upload.js` – rychlá fáze: nahraje soubor na Drive a
   rovnou zapíše řádek do Doklady se stavem **„Zpracovává se“** (zatím bez
   vytažených údajů). Riziko timeoutu na tomhle kroku je minimální (jde jen
   o jedno volání Drive API), takže appka skoro vždy stihne odpovědět
   rychle a soubor je bezpečně uložený.
2. `netlify/functions/upload-dokoncit.js` – pomalejší fáze: appka si soubor
   stáhne zpátky z Drive, zavolá Gemini extrakci, zkontroluje duplicitu a
   dohledá historii, pak řádek přepíše na výsledný stav („Ke kontrole“
   nebo „Možná duplicita“). Frontend (`public/app.js`, `nahratDoklad()`)
   tenhle krok zavolá hned po úspěšné fázi 1.

Když fáze 2 selže (typicky Gemini dočasně přetížené), appka **nic
neztrácí** – doklad zůstává viditelný v záložce Doklady se stavem
„Zpracovává se“ a appka tam rovnou nabídne tlačítko „Dokončit zpracování“,
kterým jde zpracování kdykoli zopakovat bez nutnosti cokoliv nahrávat
znovu (appka si soubor pokaždé stáhne z Drive sama). Frontend navíc po
neúspěšné fázi 2 hned po nahrání ukáže klidnou informační hlášku
(„soubor byl bezpečně nahrán, zpracování se nepovedlo, zkuste to prosím
znovu“) místo strašidelné červené chyby.

Ověřeno rozšířeným backendovým testem (fáze 1 uspěje → fáze 2 selže →
placeholder zůstává beze změny → opakovaná fáze 2 uspěje, včetně scénáře
s historickou shodou) a novým Playwright UI testem (placeholder doklad je
zřetelně odlišený, tlačítko „Dokončit zpracování“ funguje) – žádná
z existujících 17 backendových sad ani UI testů se nerozbila.

## 23. DŮLEŽITÁ OPRAVA: posunuté sloupce u Dokladů (v3.10)

Jan nahlásil ze živé appky: „nezapisuje se mi změna stavu při schváleno,
takže to nevidím pak v app mobilu“ a poslal ukázku dat z listu Doklady.
Z ní se ukázalo, že jde o vážnější a jinou chybu, než jen zpožděné/
cachované čtení (viz v3.8.1) - **appka dlouhodobě zapisovala hodnoty
Stav/Středisko/SPZ_auta/Hrazeno_mimo_ucet/Poznámka/Nahrál_uživatel do
ŠPATNÝCH sloupců** listu Doklady.

**Příčina**: `appendRow`/`updateRow` (`lib/sheetsHelpers.js`) zapisovaly
hodnoty na pozice podle POŘADÍ pole `DOKLADY_HEADERS` v aktuální verzi
KÓDU (23 sloupců), ne podle skutečného hlavičkového řádku v listu. Když
appka v kódu ve verzi v3.0 přidala sloupec `Stredisko` a ve v3.6 sloupec
`Hrazeno_mimo_ucet` (oba logicky doprostřed seznamu, ne na konec), ale
`/api/setup` se po nasazení těchhle verzí nespustilo znovu (ať skutečně
doplní chybějící sloupce do listu), skutečný hlavičkový řádek v listu
zůstal o 2 sloupce kratší/jinak uspořádaný než to, co appka předpokládala
při zápisu. Výsledek: appka zapisovala hodnotu Stav do sloupce, který
list nazýval „Nahral_uzivatel“, hodnotu Střediska do sloupce „SPZ_auta“
atd. - proto se po klepnutí na „Schválit“ zdálo, že se stav „neuloží“
(ve skutečnosti se zapsal, jen jinam, než odkud ho appka zpátky čte).
Tahle chyba navíc při KAŽDÉ úpravě přepisovala i sloupec „Nahral_uzivatel“
další (špatně umístěnou) hodnotou.

**Oprava** (`lib/sheetsHelpers.js`): `appendRow`/`appendRows`/`updateRow`
si teď před každým zápisem samy načtou aktuální hlavičkový řádek přímo
z listu a zapisují hodnoty PODLE NĚJ (podle skutečného textu v hlavičce),
ne podle pořadí v kódovém poli `*_HEADERS` - appka tak zapisuje správně
i do listu, kde jsou sloupce v jiném pořadí nebo kde některý nový sloupec
ještě vůbec neexistuje (takové pole appka bezpečně přeskočí, radši než
zapsat ho jinam). Tahle oprava se týká VŠECH listů (Doklady, Firmy, Auta,
Ucty, Bankovni_pohyby, Vydane_faktury, Uzivatele), ne jen Dokladů - je to
sdílená vrstva. Ověřeno novým testem, který přesně reprodukuje scénář
z Janových dat (list bez sloupce Stredisko/Hrazeno_mimo_ucet, zápis
kódovým schématem, které tyhle sloupce má) a ověřuje, že se Stav/
Kategorie/Poznamka/Nahral_uzivatel zapíšou do SPRÁVNÝCH sloupců podle
skutečné hlavičky, i když se hlavička/pořadí liší od kódu.

**Po nasazení téhle verze je NUTNÉ znovu spustit `/api/setup`** (viz krok 6
níže) - doplní do listu Doklady chybějící sloupce `Stredisko` a
`Hrazeno_mimo_ucet` (bezpečně, na konec, nic nemaže/nepřepisuje), aby
appka od teď měla kam tyhle dvě pole ukládat.

**Existující (už zapsaná) data**: appka nemůže tuhle chybu u už uložených
dokladů opravit automaticky a naslepo - u dokladů upravovaných/schválených
VÍCEKRÁT po sobě od chvíle, kdy chyba vznikla, se totiž mohla původní
hodnota sloupce Poznámka/Nahral_uzivatel při dalších úpravách znovu
přepsat (appka totiž vždy bere aktuální - už špatně umístěný - obsah
řádku jako základ dalšího zápisu), takže jistá naslepo-automatická oprava
by mohla data spíš dál zamotat, ne opravit. Místo toho appka dostala
novou ČISTĚ ČTECÍ diagnostickou funkci:

```
curl https://VAŠE-DOMÉNA.netlify.app/.netlify/functions/diagnostika-doklady \
  -H "X-Setup-Secret: HODNOTA_SETUP_SECRET"
```

Vrátí u každého dokladu, jestli vypadá posunutě, a pokud ano, nejlepší
odhad skutečných hodnot - **Stav a Středisko appka dokáže rozpoznat
spolehlivě** (jde o hodnoty z jasně rozpoznatelného vzoru/výčtu), odhad
Poznámky a Nahral_uzivatel je jen orientační. Doporučený postup: podle
výpisu z týhle diagnostiky ručně opravit sloupce Stav/Středisko přímo
v Google Sheets u dotčených dokladů (u pár desítek dokladů jde o pár
minut práce) - je to bezpečnější než automatický přepis. **Finanční
údaje (Dodavatel, Částka, Datum, Firma, Kategorie) touhle chybou
zasažené NEBYLY** - ty appka zapisovala do sloupců PŘED tím, kde posun
začíná, takže jsou v pořádku.

Ověřeno testem s daty odpovídajícími přesně tomu, co Jan poslal (diagnóza
správně pozná neposunutý i posunutý řádek, i řádek posunutý jen podle
vzoru hodnoty bez zjevných "skrytých" sloupců navíc) - a že diagnostická
funkce sama nikdy nic nezapisuje.

## 24. Ruční přepínač formátu a oprava rozpoznávání hlavičky u CSV/XLS importu (v3.11)

Jan zkusil nahrát bankovní výpis pro NOMIS & Homes a appka ho odmítla
s chybou „Appka v souboru nenašla sloupec s datem a/nebo částkou … Nalezené
hlavičky: NOMIS & Homes CZK / NOMIS & Homes s.r.o.“. Ukázalo se, že appka
u CSV/XLS importu (`lib/bankImportTabular.js`) brala jako hlavičkový řádek
VŽDY úplně první řádek souboru - Janův reálný export ale měl na začátku
pár řádků s metadaty výpisu (název účtu, název firmy), skutečná tabulka
se sloupci „Datum“/„Částka“ začínala až o pár řádků níž.

**Oprava**: appka teď u CSV i XLS/XLSX prohledá prvních 15 řádků souboru
a jako hlavičku vezme první řádek, který má rozpoznatelný sloupec s datem
I s částkou zároveň - řádky před ním (metadata) appka ignoruje. Pokud
takový řádek nenajde vůbec, spadne zpátky na původní chování (první řádek)
a vyhodí stejně srozumitelnou chybu jako dřív, jen doplněnou o poznámku,
že appka už zkusila přeskočit úvodní řádky.

Zároveň appka na kartě „Bankovní výpisy“ dostala nový select „Formát
souboru“ (Poznat automaticky / JSON / CSV / XLS·XLSX) - appka odteď
nespoléhá jen na příponu nahrávaného souboru (ta může u exportu z banky
chybět nebo být nejednoznačná), ale respektuje ruční volbu, pokud si ji
uživatel nastaví.

Ověřeno novým testem (`lib/bankImportTabular.js` s CSV i XLSX souborem,
který má na začátku 2 řádky metadat přesně podle Janova scénáře), plnou
regresní sadou (21 backend testů) a Playwright UI testem, že select
existuje se všemi 4 volbami.

## 25. Srozumitelná chyba, když v Sheets ještě chybí celý list (v3.11.1)

Hned po v3.11 Jan narazil při importu bankovního výpisu na chybu „Unable to
parse range: Ucty“ - syrová anglická chyba přímo z Google Sheets API.
Příčina: appka se snažila přečíst list „Ucty“ (bankovní účty firem, viz
v3.6), který v Janově tabulce ještě vůbec neexistoval jako list/tab -
nešlo tedy o chybějící SLOUPEC (jako u opravy v3.10), ale o chybějící
celý LIST, protože `/api/setup` po zavedení téhle funkce ještě nebylo
spuštěné.

**Oprava** (`lib/sheetsHelpers.js`): `readSheetObjects`/`appendRow`/
`appendRows`/`updateRow` teď tenhle konkrétní typ chyby Google API poznají
a nahradí ho jasnou českou hláškou: „List "Ucty" v Google Sheets zatím
neexistuje. Spusťte prosím znovu /api/setup …“ - místo aby appka jen
ukázala nesrozumitelnou anglickou technickou chybu. Týká se to všech
listů, ne jen Ucty (stejná sdílená vrstva jako u opravy v3.10).

**Důležité připomenutí**: po nasazení v3.10/v3.11/v3.11.1 je potřeba
spustit `/api/setup` (krok 6), ať appka doplní chybějící listy (Ucty,
Bankovni_pohyby, Vydane_faktury apod.) i chybějící sloupce (Stredisko,
Hrazeno_mimo_ucet) - bezpečně, nic se tím nemaže ani nepřepisuje.

Ověřeno novým testem, který simuluje přesně tuhle chybu Google API pro
všechny 4 funkce (`readSheetObjects`, `appendRow`, `appendRows`,
`updateRow`) a ověřuje, že appka vždy vyhodí srozumitelnou českou hlášku
s odkazem na `/api/setup`, ne syrovou anglickou chybu.

## 26. CORS: chybějící hlavička X-Setup-Secret blokovala volání z prohlížečových nástrojů (v3.11.2)

Jan zkoušel spustit `/api/setup` přes Hoppscotch (webový REST nástroj bez
instalace, protože neměl po ruce terminál) a appka vrátila jen obecnou
"Chyba sítě / Network Error: Neznámá příčina" - bez jakéhokoli
srozumitelného důvodu.

**Příčina**: `lib/http.js` (sdílená pomocná funkce pro odpovědi ze všech
Netlify Functions) měla v CORS hlavičce `Access-Control-Allow-Headers`
jen `Content-Type, Authorization` - hlavička `X-Setup-Secret` (kterou
používají `/api/setup` a `diagnostika-doklady`) tam chyběla. Appka
samotná (běžící na stejné doméně) tohle nikdy nepocítí, protože CORS
platí jen pro požadavky z JINÉ domény - ale `curl` v terminálu CORS řeší
úplně stejně (CORS je čistě prohlížečové omezení), takže volání z
terminálu funguje bez problémů. Prohlížečový nástroj jako Hoppscotch ale
běží na jiné doméně (hoppscotch.io) a prohlížeč před vlastním požadavkem
pošle tzv. CORS preflight - protože appka `X-Setup-Secret` mezi povolené
hlavičky neuváděla, prohlížeč skutečný požadavek vůbec neodeslal a jen
nahlásil nejasnou síťovou chybu.

**Oprava**: `Access-Control-Allow-Headers` teď zahrnuje i
`X-Setup-Secret`, takže `/api/setup` i `diagnostika-doklady` jdou spustit
i z prohlížečového REST nástroje, ne jen z terminálu.

**Poznámka pro příště**: pokud nemáte po ruce terminál, `curl` z něj je
i tak nejspolehlivější způsob, jak tyhle admin příkazy spustit (CORS se
ho netýká vůbec) - prohlížečový nástroj je pohodlná záloha pro případ,
že terminál není k dispozici, ale vyžaduje nasazenou aktuální verzi appky.

## 27. Tlačítka „Aktualizovat“ a „Spustit kontrolu dokladů“ u Bankovních výpisů (v3.12)

Jan si vyžádal dvě nová tlačítka na kartě Bankovní výpisy, vedle „Nahrát
výpis“:

**Aktualizovat** - jen znovu načte pohyby a doklady dané firmy ze Sheets.
Appka se jinak obnoví jen při přepnutí firmy nebo po vlastní akci
(potvrzení/zamítnutí/import) - tohle je pro případ, že se něco změnilo
jinde (jiné zařízení, přímá úprava v Google Sheets) a appka to ještě neví.

**Spustit kontrolu dokladů** - appka doteď navrhovala shodu dokladu
k bankovnímu pohybu jen v okamžiku importu výpisu, podle dokladů, které
v tu chvíli existovaly. Běžná situace ale je, že doklad (účtenka, faktura)
se nahraje/vytěží AŽ PO odpisu z účtu o pár dní později - takový pohyb pak
zůstal „Nespárováno“ napořád, dokud appka znovu nezkusila porovnat.
Tohle tlačítko (nová akce `POST /banka { firma, akce: "prepocitatShody" }`)
appku donutí přepočítat návrhy pro všechny dosud „Nespárováno“ pohyby
aktuální firmy proti aktuálním dokladům - beze změny už rozhodnutých
pohybů (Navrženo/Potvrzeno/Bez dokladu appka nechává být) a bez rizika
nabídnout stejný doklad dvakrát dvěma různým pohybům. Nevyžaduje žádný
soubor k nahrání, dá se spustit kdykoli.

Ověřeno novým testem (`netlify/functions/banka.js`, akce
`prepocitatShody`) - appka správně přepočítá jen nespárované pohyby
zvolené firmy, nedotkne se už rozhodnutých pohybů ani pohybů jiné firmy,
opakované spuštění je neškodné (idempotentní) - a Playwright UI testem,
že obě tlačítka existují.

## 28. Řazení bankovních pohybů podle naléhavosti (v3.13)

Na přání appka teď v záložce Bankovní výpisy řadí pohyby primárně podle
toho, kolik pozornosti ještě potřebují, ne jen podle data: nejdřív
„Navrženo“ (appka má tip, stačí rychle zkontrolovat a potvrdit/zamítnout),
pak „Nespárováno“ (appka nic nenašla, čeká na doklad nebo ruční
přiřazení), a úplně na konci „Potvrzeno“/„Bez dokladu“ (vyřízeno, žádná
další akce potřeba). V rámci každé skupiny appka dál řadí podle data
(nejnovější nahoře), stejně jako dřív.

Ověřeno Playwright UI testem se 6 pohyby ve všech 4 stavech a různými
daty - appka je seřadí přesně v očekávaném pořadí.

## 29. Víc účtenek na jednom scanu = víc samostatných dokladů (v3.14)

Jan se ptal, jestli appka umí vyřešit situaci, kdy je vyfocených/
naskenovaných víc účtenek najednou na jeden list papíru (běžné třeba
u drobných účtenek za pohonné hmoty nebo nákupy). Appka dřív z jednoho
nahraného souboru vždycky udělala jen JEDEN doklad - Gemini dostal pokyn
vytáhnout data jednoho dokladu, takže by u víc účtenek na scanu buď vzal
jen tu nejvýraznější, nebo si data různých účtenek popletl dohromady.

**Řešení**: prompt pro Gemini (`lib/gemini.js`) teď navíc žádá pole
`dalsi_doklady` - pokud AI na fotce/scanu pozná víc SAMOSTATNÝCH dokladů
vedle sebe, první/nejvýraznější popíše v běžných polích (beze změny) a
KAŽDÝ DALŠÍ vrátí jako samostatný objekt v tomhle poli, se stejnou
strukturou. `netlify/functions/upload-dokoncit.js` pak první doklad zapíše
do původního (placeholder) řádku jako dřív, a z KAŽDÉHO DALŠÍHO založí
zbrusu nový samostatný řádek v Doklady - se stejným zdrojovým souborem
(scan/foto je pro všechny společné, takže "otevřít scan" funguje u
každého z nich), vlastním ID, a projde stejnou kontrolou duplicity/
historie dodavatele jako běžný doklad (i mezi doklady vzniklými z
JEDNOHO tohohle zpracování navzájem, ne jen proti už dřív existujícím).
Appka po dokončení zpracování zobrazí srozumitelnou hlášku, kolik dokladů
celkem z jednoho souboru vzniklo, a všechny se rovnou objeví v seznamu
Doklady bez nutnosti cokoli obnovovat.

Appka nikdy doklady nevymýšlí - u jedné běžné účtenky/faktury na scanu se
chová přesně jako dřív (pole `dalsi_doklady` zůstane prázdné, žádná změna
chování). AI odhad ale není neomylný - u fotek s víc účtenkami doporučuje
appka po nahrání zkontrolovat, že se skutečně vytvořil očekávaný počet
dokladů a že se navzájem nesmíchaly (viz Poznámka u každého takového
dokladu: „Appka tenhle doklad rozpoznala jako jeden z víc dokladů na
společném scanu.“).

Ověřeno novým testem (`netlify/functions/upload-dokoncit.js` se 3 doklady
z jednoho scanu - appka správně aktualizuje placeholder prvním dokladem,
založí 2 nové řádky se stejným zdrojovým souborem, vlastním ID a
vysvětlující poznámkou) a Playwright UI testem, že appka zobrazí
srozumitelnou hlášku a všechny doklady se objeví v seznamu.

## Poznámky k bezpečnosti a omezením

- PIN přihlášení je jednoduché a vhodné pro malý důvěryhodný tým. Pokud by
  se okruh uživatelů rozrostl nebo šlo o citlivější data, zvažte silnější
  ověření (např. účty) a hashování PINů s omezením počtu pokusů.
- Limit velikosti nahrávaného souboru je cca 4,5 MB po kompresi (limit
  Netlify Functions na velikost požadavku) – fotky se automaticky zmenšují
  na klientovi, PDF komprimovaná nejsou (pokud budete mít problém s velkým
  PDF, zmenšete ho před nahráním).
- Mimo rozsah této appky zatím: automatický příjem z Gmailu, import a
  párování bankovních výpisů, export do Money S3 – viz
  `nomis-faktury-architektura.md` v projektu pro další fáze.

## Řešení problémů

- **401 Neplatný PIN** – zkontrolujte list Uzivatele a přesnou hodnotu PINu
  (bez mezer).
- **„Chybí GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET /
  GOOGLE_OAUTH_REFRESH_TOKEN“ / „SPREADSHEET_ID“ / …** – chybí nastavená
  proměnná prostředí na Netlify, doplňte podle kroku 4 a znovu nasaďte
  (redeploy).
- **„Service Accounts do not have storage quota“** – appka ještě běží se
  starým `lib/google.js` (service account) nebo máte nastavené jen staré
  proměnné. Ujistěte se, že máte nasazenou aktuální verzi appky a že jsou
  v Netlify nastavené `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` (krok 4),
  pak redeploy.
- **„invalid_grant“ nebo „Token has been expired or revoked“ při volání
  Sheets/Drive** – refresh token přestal platit (typicky vypršel po ~7
  dnech, viz krok 8 „Obnova Google přístupu appkou“ – appka totiž zůstává
  neverifikovaná appka, takže tenhle 7denní limit platí bez ohledu na
  „In production“ i na to, jestli appka žádá `drive.file` nebo plný
  `drive`). Použijte tlačítko „Připojit Google účet znovu“ v appce
  (Uživatelé), zkopírujte novou hodnotu do Netlify a redeploy. Skutečnou
  a jedinou trvalou opravou by byla formální Google verifikace appky,
  která ale vyžaduje appce vlastní doménu (ne `netlify.app`) pro stránku
  s privacy policy – pro malou interní appku to zatím neděláme.
- **„unauthorized_client“ nebo „invalid_client“ při přihlášení do appky, i
  když stejné Client ID/Secret/refresh token v OAuth Playground fungují
  bez problémů** – nejčastější příčina je neviditelná mezera nebo nový
  řádek navíc, který se přichytí při kopírování hodnoty do Netlify
  (Netlify pole hodnotu zobrazuje maskovanou, takže to není vidět). Appka
  od aktuální verze (`lib/google.js`) tyhle tři proměnné sama ořezává
  (`.trim()`), takže pokud appku ještě nemáte v téhle verzi nasazenou,
  nahrajte aktuální zip a zkuste to znovu. Pokud problém přetrvá i s touhle
  verzí, smažte a znovu vytvořte dané proměnné v Netlify (ne jen upravte)
  a hodnoty vkládejte přímo z Google Cloud Console/OAuth Playground bez
  ručního přepisování.
- **400 „invalid_scope“ v OAuth Playground** – do pole se scope se omylem
  dostal jiný text (typicky e-mailová adresa z automatického doplňování
  prohlížeče). Označte pole scope celé (Ctrl/Cmd+A) a smažte, pak vložte
  jen ty dva scope ze zněnou krok 3.4.
- **Chyba přístupu ke Sheets (403 „The caller does not have permission“)** –
  SPREADSHEET_ID patří jinému Google účtu, než pod kterým jste prošli
  autorizací v kroku 3. Zkontrolujte, že jste se v OAuth Playground
  přihlašovali stejným Google účtem, pod kterým jste v kroku 1 vytvořili
  Sheet.
- **Chyba přístupu k Drive/Inbox složce (404 nebo 403)** – appka pod scope
  `drive.file` nemá přístup k ručně založeným složkám, jen k těm, které si
  vytvořila sama. Spusťte znovu funkci `setup` (krok 6) – appka si Inbox
  složku sama založí/ověří a v odpovědi vrátí správné `inboxFolderId`,
  které pak nastavte jako `INBOX_FOLDER_ID` a redeploy.
- **Gemini API chyba 4xx** – zkontrolujte platnost `GEMINI_API_KEY`.
- **Gemini API chyba 503 „high demand“ / appka hlásí chybu 504** – appka
  automaticky zkouší 3 různé Gemini modely (hlavní + 2 záložní), každý jen
  jednou a bez umělého čekání mezi pokusy – to proto, že appka i „brána“
  před ní mají tvrdý časový limit, a přidávání čekání/opakování celkovou
  dobu jen prodlužuje a riskuje neprůhledný timeout (504) místo jasné
  chyby (503). Pokud přesto appka po vyzkoušení všech tří modelů skončí
  chybou, jde o skutečně širší dočasné přetížení/výpadek na straně Google
  – zkuste to prosím za pár minut znovu. Od v3.9 (viz sekce 22 výš) se
  tahle chyba už netýká samotného nahrání souboru (to appka udělá rychle
  a odděleně) – pokud se objeví, doklad zůstane v záložce Doklady se
  stavem „Zpracovává se“ a appka tam nabídne tlačítko „Dokončit
  zpracování“ k opakování bez nutnosti cokoliv nahrávat znovu.
- **Klíč z AI Studia začíná na `AQ.` místo `AIzaSy...`** – to je v pořádku,
  Google od poloviny 2026 postupně vydává nový formát klíčů („Authentication
  Key“). Appka ho posílá přes hlavičku `x-goog-api-key`, což by mělo fungovat
  s oběma formáty. Pokud přesto dostanete chybu `API_KEY_SERVICE_BLOCKED`
  nebo `401 UNAUTHENTICATED`, zkuste v AI Studiu vytvořit klíč znovu (v jiném
  Google Cloud projektu) nebo to nahlaste přes formulář na
  discuss.ai.google.dev – jde o širší přechodovou nesrovnalost hlášenou i
  jinými uživateli, ne o chybu ve vaší appce.
