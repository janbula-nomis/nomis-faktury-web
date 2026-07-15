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

## 13. Oprava „NaN Kč“ u bankovních pohybů (od v3.4)

V Bankovních výpisech se u jednoho pohybu mohla objevit **„NaN Kč“** místo
částky – docházelo k tomu, když George export obsahoval položku s
neúplným/neočekávaným polem částky (např. chybějící `precision`), na což
appka nebyla dost obranná a výpočet částky mohl vrátit neplatné číslo
(`NaN`/`Infinity`), které se pak takhle uložilo a zobrazilo.

Oprava ve dvou vrstvách:

1. `lib/bankHelpers.js` (`castkaZHaleru`) – appka teď hlídá, že výsledek
   výpočtu je vždy konečné číslo; pokud by vyšlo něco neplatného, uloží se
   0 místo NaN/Infinity.
2. `public/app.js` (`formatCastka`) – appka teď i při zobrazení hlídá
   neplatnou hodnotu a místo matoucí „NaN Kč“ ukáže zřetelné „— Kč
   (neplatná částka)“, ať je na první pohled vidět, že tenhle konkrétní
   řádek stojí za ruční kontrolu.

**Existující už uloženou „NaN“ hodnotu appka sama zpětně neopraví** (u
staršího řádku, který vznikl před touhle opravou) – tu je potřeba doplnit
ručně přímo v Google Sheets, v listu `Bankovni_pohyby`, sloupec `Castka`
u dotčeného řádku (částku dohledáte v bankovním výpisu/historii účtu).
Nové importy už touhle chybou netrpí.

Bez potřeby nové sheet/sloupce ani znovu spustit `setup`.

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
  – zkuste to prosím za pár minut znovu.
- **Klíč z AI Studia začíná na `AQ.` místo `AIzaSy...`** – to je v pořádku,
  Google od poloviny 2026 postupně vydává nový formát klíčů („Authentication
  Key“). Appka ho posílá přes hlavičku `x-goog-api-key`, což by mělo fungovat
  s oběma formáty. Pokud přesto dostanete chybu `API_KEY_SERVICE_BLOCKED`
  nebo `401 UNAUTHENTICATED`, zkuste v AI Studiu vytvořit klíč znovu (v jiném
  Google Cloud projektu) nebo to nahlaste přes formulář na
  discuss.ai.google.dev – jde o širší přechodovou nesrovnalost hlášenou i
  jinými uživateli, ne o chybu ve vaší appce.
