# Průvodce nasazením – Nomis Faktury (co a kde)

Tohle je stejný postup jako v `README-DEPLOY.md`, ale rozepsaný jako
průvodce „co udělat a kde přesně kliknout“. Klidně si to projděte krok po
kroku a odškrtávejte.

Celkem to je 6 fází:
1. Google Sheet + Disk složka
2. Google Cloud – OAuth přístup appky pod vaším Google účtem
3. (zrušeno – appka pod OAuth nepotřebuje žádné zvláštní sdílení, viz Fáze 2)
4. Gemini API klíč
5. Netlify – nahrání appky a proměnné prostředí
6. Spuštění a test

> **Máte appku už rozjetou a jen řešíte chybu „Service Accounts do not have
> storage quota“ při nahrávání?** Appka byla přepracovaná z „robotího“
> service accountu na OAuth pod vaším vlastním Google účtem – stačí projít
> **Fázi 2 a 3** níže (nové OAuth přihlašovací údaje + refresh token se
> scope `drive.file`, ne plný `drive`), přepsat proměnné prostředí
> v Netlify (Fáze 5c, řádky `GOOGLE_OAUTH_*` a `INBOX_FOLDER_ID`) a appku
> znovu nasadit s aktuálním kódem, který vám pošlu. Fázi 1 (Sheet) ani
> Fázi 4 (Gemini) nemusíte opakovat – ty zůstávají stejné; Disk složku
> appka teď zakládá sama (Fáze 6b). **Pozor:** appka zůstává neverifikovaná
> u Googlu, takže refresh token vydrží jen ~7 dní bez ohledu na scope či
> publikační stav – appka na to má vlastní tlačítko „Připojit Google účet
> znovu“ (Fáze 6h), kterým obnovu zvládnete bez Google Cloud Console.

---

## Fáze 1 – Google Sheet a Disk složka

**Co:** Vytvořit tabulku, kam appka bude ukládat data.

1. Jděte na **sheets.google.com** → **Prázdný soubor** (velké „+“ nebo
   barevná dlaždice vlevo nahoře).
2. Přejmenujte tabulku (klik na „Bez názvu“ vlevo nahoře) na
   **„Nomis Group – Doklady“**.
3. Podívejte se do adresního řádku prohlížeče. URL vypadá takto:
   `https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXX/edit`
   → **to `XXXXXXXXXXXXXXXXXXXX` je SPREADSHEET_ID**, zkopírujte si ho
   stranou (např. do poznámkového bloku).
4. Složku na Disku na doklady **nemusíte zakládat ručně** – appka kvůli
   scope `drive.file` (viz Fáze 2 a 3) potřebuje složku, kterou si vytvoří
   sama, jinak by k ní neměla přístup. Appka si ji založí sama při prvním
   spuštění funkce `setup` (Fáze 6) a vrátí vám skutečné `INBOX_FOLDER_ID`
   k doplnění do Netlify.

✅ Na konci fáze máte: SPREADSHEET_ID.

---

## Fáze 2 – Google Cloud: OAuth přístup appky pod vaším Google účtem

**Co:** Appka přistupuje ke Sheets a Disku pod **vaší vlastní** Google
identitou (ne pod cizím „robotím“ účtem) – protože soubory z Fáze 1 už
vlastníte vy, appka tak má přístup rovnou, bez jakéhokoliv sdílení navíc.

*(Proč ne service account, jak jsme to zkoušeli původně: Google service
accounty nemají vlastní úložiště na Disku a nedokážou proto vytvářet nové
soubory v běžném osobním Google Disku – jen v placeném Google Workspace
Shared Drive. Proto přechod na OAuth.)*

1. Jděte na **console.cloud.google.com**. Pokud se ptá, přihlaste se
   stejným Google účtem, kterým jste vytvořili Sheet/Disk v Fázi 1.
2. Pokud jste dřív založili projekt „nomis-faktury“ kvůli service
   accountu, vyberte ho nahoře ve výběru projektu. Jinak založte nový
   stejným postupem: výběr projektu → **„Nový projekt“** → název
   „nomis-faktury“ → **Vytvořit**.
3. **Zapnout potřebná API** (přeskočte, pokud jste to udělali už dřív):
   - V levém postranním menu (ikona ☰) najděte **„APIs a Services“ →
     „Library“** (Knihovna).
   - Napište **„Google Sheets API“** → klikněte na výsledek → **„Enable“**.
   - Vraťte se do Library a stejně zapněte **„Google Drive API“**.
4. **Nastavit OAuth consent screen:**
   - V levém menu **„APIs & Services“ → „OAuth consent screen“**.
   - User Type: **External** → Create.
   - Vyplňte název appky (např. „Nomis Faktury“), svůj e-mail jako
     „User support email“ a jako „Developer contact information“.
   - Uložte (Save and Continue přes zbylé kroky, nic dalšího není
     potřeba vyplňovat).
   - Na souhrnné stránce OAuth consent screen najděte tlačítko
     **„PUBLISH APP“** (nebo „Publikovat aplikaci“) a klikněte na něj,
     potvrďte. Stav appky se změní z „Testing“ na **„In production“**.
     **Tohle je důležitý krok** – v „Testing“ by přihlašovací token
     appky vypršel po 7 dnech a appka by přestala fungovat; formální
     Google verifikaci není potřeba absolvovat, protože appku používá
     jen váš malý tým a nežádá citlivé scope.
5. **Vytvořit OAuth Client ID:**
   - V levém menu **„APIs & Services“ → „Credentials“** → **„Create
     Credentials“ → „OAuth client ID“**.
   - Application type: **Web application**. Název např. „Nomis Faktury
     OAuth klient“.
   - Do „Authorized redirect URIs“ přidejte **obě** tyto adresy, každou
     zvlášť přes **„+ Add URI“**:
     ```
     https://developers.google.com/oauthplayground
     https://VAŠE-DOMÉNA.netlify.app/.netlify/functions/google-oauth-callback
     ```
     První je potřeba pro tento prvotní postup (OAuth Playground), druhá
     pro tlačítko „Připojit Google účet znovu“ přímo v appce (Fáze 6h) –
     tu doplňte se skutečnou adresou appky, až appku nasadíte (Fáze 5);
     pokud appku teprve budete nasazovat, vraťte se sem po Fázi 5 a URI
     doplňte/uložte dodatečně (Credentials → klik na OAuth klienta → Edit).
   - **Create**. Zobrazí se okno s **Client ID** a **Client Secret** –
     obojí si zkopírujte stranou (např. do poznámkového bloku), budete
     to potřebovat hned v dalším kroku i v Netlify (Fáze 5c).

✅ Na konci fáze máte: Client ID, Client Secret.

---

## Fáze 3 – Získání refresh tokenu (OAuth Playground)

**Co:** Jednorázová autorizace appky vaším Google účtem, ze které appka
dostane „refresh token“ – s ním pak appka trvale (bez opětovného
přihlašování) čte a zapisuje do vašich Sheets/Disku.

1. Otevřete **developers.google.com/oauthplayground**.
2. Vpravo nahoře klikněte na ikonu ozubeného kola (Settings).
3. Zaškrtněte **„Use your own OAuth credentials“** → vyplňte **OAuth
   Client ID** a **OAuth Client secret** z Fáze 2.5 → zavřít.
4. V levém panelu „Step 1 – Select & authorize APIs“ najděte pole
   „Input your own scopes“, celé pole nejdřív smažte (Ctrl/Cmd+A, Delete –
   ať tam náhodou nezůstane nic z automatického doplňování prohlížeče) a
   vložte přesně (jedno pole, oddělené čárkou, **`drive.file`, ne plný
   `drive`**):
   ```
   https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive.file
   ```
   Appka `drive.file` (ne plný `drive`) používá i tak, protože smí
   zapisovat jen do souborů/složek, které si sama vytvoří (appka Inbox
   složku zakládá sama, viz Fáze 1.4) – je to bezpečnější, i když samo
   o sobě to expiraci tokenu neřeší (viz další bod).
5. Klikněte **„Authorize APIs“**.
6. Přihlaste se Google účtem, pod kterým jste v Fázi 1 vytvořili Sheet.
   Google pravděpodobně ukáže varování „Google hasn't verified this app“ –
   to je v pořádku, je to vaše vlastní appka. Klikněte **„Advanced“**
   (Rozšířené možnosti) → **„Go to Nomis Faktury (unsafe)“** →
   odsouhlaste přístup ke Sheets i Disku (checkboxy → „Continue“/
   „Pokračovat“).
7. Po přesměrování zpět na OAuth Playground klikněte v „Step 2 – Exchange
   authorization code for tokens“ na tlačítko **„Exchange authorization
   code for tokens“**.
8. V poli **„Refresh token“** se zobrazí dlouhý řetězec – zkopírujte si
   ho celý, bude potřeba v Netlify (Fáze 5c).

   **Důležité a ověřené v ostrém provozu:** v odpovědi bude i pole
   `refresh_token_expires_in` (~7 dní) – to je v pořádku a nejde to
   jednoduše odstranit. Appka zůstává neverifikovaná appka u Googlu (plná
   verifikace by vyžadovala appce vlastní doménu, ne `netlify.app`, což
   teď neřešíme), takže refresh token appky bude potřeba přibližně
   jednou týdně obnovit. Naštěstí to po prvním nastavení appky (tahle
   fáze) půjde udělat mnohem jednodušeji přímo v appce – viz Fáze 6h,
   „Připojit Google účet znovu“ – bez nutnosti se sem do OAuth Playground
   znovu vracet.

✅ Na konci fáze máte: refresh token.

---

## Fáze 4 – Gemini API klíč

**Co:** Klíč, kterým appka volá AI pro rozpoznání dokladů.

1. Jděte na **aistudio.google.com/apikey**.
2. Přihlaste se (může být stejný nebo jiný Google účet, není to
   propojené se service accountem).
3. Klikněte **„Create API key“** (Vytvořit API klíč).
4. Vyberte projekt „nomis-faktury“ (ten stejný z Fáze 2), pokud appka
   nabízí výběr projektu, jinak nechte výchozí.
5. Zkopírujte si vygenerovaný klíč.

✅ Na konci fáze máte: Gemini API klíč.

---

## Fáze 5 – Netlify: nahrání appky a proměnné prostředí

**Co:** Appku (kód, který jsem vám poslal v `nomis-faktury-web.zip`)
dostat na internet.

### 5a. Nahrání kódu na GitHub (doporučeno, aby šly dělat pozdější úpravy snadno)

1. Jděte na **github.com** → přihlaste se / založte účet, pokud ho
   nemáte.
2. Vpravo nahoře **„+“ → „New repository“**.
3. Název např. `nomis-faktury-web`, viditelnost klidně **Private**
   (doporučeno, je to firemní appka) → **Create repository**.
4. Na stránce nového (prázdného) repozitáře uvidíte odkaz „uploading an
   existing file“ – klikněte na něj, nebo použijte odkaz
   „Add file → Upload files“ nahoře.
5. Rozbalte si `nomis-faktury-web.zip` u sebe v počítači a přetáhněte
   obsah složky (soubory a podsložky `netlify/`, `lib/`, `public/`, atd.)
   do okna prohlížeče na GitHubu.
6. Dole klikněte **„Commit changes“**.

### 5b. Založení appky na Netlify

1. Jděte na **app.netlify.com** → přihlaste se / založte účet (nejde jít
   přes e-mail, může jít i přes GitHub přihlášení).
2. Klikněte **„Add new site“** (nebo „Add new project“ – Netlify název
   tlačítka občas mění) → **„Import an existing project“**.
3. Vyberte **„Deploy with GitHub“** a povolte Netlify přístup k vašemu
   GitHub účtu, pokud se ptá.
4. Ze seznamu repozitářů vyberte `nomis-faktury-web`.
5. V nastavení sestavení (build settings) nic neměňte (build command
   nechte prázdný) a klikněte rovnou **„Deploy“** – appka se sice hned
   nasadí, ale nebude fungovat, dokud nedoplníme proměnné prostředí
   v dalším kroku (to je v pořádku).

### 5c. Proměnné prostředí – podrobně

**Kde:** Otevřete appku v Netlify dashboardu (klik na její dlaždici na
`app.netlify.com`) → v levém/horním menu klikněte **„Project
configuration“** (u starších appek se může jmenovat „Site settings“) →
v postranním menu **„Environment variables“**. Přímý odkaz má tvar
`https://app.netlify.com/projects/VAŠE-JMÉNO-APPKY/configuration/env`.

**Co:** Potřebujete tam přidat 8 proměnných, jednu po druhé. Postup pro
každou:

1. Klikněte tlačítko **„Add a variable“** (obvykle vpravo nahoře nad
   seznamem proměnných).
2. V nabídce, která se otevře, vyberte **„Add a single variable“** (ne
   „Import from a .env file“).
3. Vyplní se vám formulář:
   - **Key** – přesný název proměnné (viz tabulka níže, včetně velkých
     písmen a podtržítek).
   - **Values** – zde stačí nechat **„Same value for all deploy
     contexts“** (výchozí volba) a do pole pod tím vložit hodnotu.
   - **Scopes** – nechte zaškrtnuté všechny (výchozí stav), appka
     proměnné potřebuje jak při běhu funkcí, tak případně při buildu.
4. Klikněte **„Create variable“** (nebo „Save“).
5. Zopakujte pro všech 8 proměnných:

   | Key (přesně takhle) | Value |
   |---|---|
   | `GOOGLE_OAUTH_CLIENT_ID` | Client ID z Fáze 2.5 |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret z Fáze 2.5 |
   | `GOOGLE_OAUTH_REFRESH_TOKEN` | refresh token z Fáze 3.8 |
   | `SPREADSHEET_ID` | ID tabulky z Fáze 1 |
   | `INBOX_FOLDER_ID` | zatím klidně nechte prázdné nebo dejte cokoliv – appka si při prvním spuštění funkce `setup` (Fáze 6b) vytvoří vlastní Inbox složku a vrátí vám skutečné ID, které pak doplníte a appku znovu nasadíte |
   | `GEMINI_API_KEY` | klíč z Fáze 4 |
   | `SESSION_SECRET` | libovolný dlouhý náhodný text (klidně 40+ znaků, na obsahu nezáleží, hlavně ať to nikdo neuhodne) |
   | `SETUP_SECRET` | libovolné heslo, použijeme ho jen jednou v Fázi 6 |

   Pokud už máte z dřívějška nastavenou proměnnou
   `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`, appka ji nově nečte – klidně ji
   smažte (tlačítko s třemi tečkami / ikona koše u té proměnné), nebo ji
   jen nechte ležet, nijak nevadí.
6. Když máte všechny proměnné v seznamu, je potřeba appku **znovu
   nasadit**, aby si je přečetla – proměnné samy o sobě běžící appku
   nezmění. Jděte na záložku **„Deploys“** (nahoře) → tlačítko **„Trigger
   deploy“** (může být rozbalovací nabídka) → **„Deploy site“**.
7. Počkejte, až se stav nasazení (řádek nahoře v seznamu deploys) změní
   na **„Published“** – bývá to do jedné minuty.

✅ Na konci fáze: appka běží na adrese typu
`https://neco-nahodne.netlify.app` a zná všechny proměnné.

### 5d. Přejmenování appky (hezčí adresa)

Netlify appce při založení přidělí náhodné jméno (např.
`chirpy-sundae-a1b2c3.netlify.app`). Změna:

1. V appce na Netlify jděte na **„Project configuration“** → hned na
   první stránce (sekce „General“ / „Project details“, případně „Site
   details“) najdete pole s aktuálním jménem appky a u něj tlačítko
   **„Change site name“** (nebo „Edit site name“/„Change project name“ –
   přesné znění se u Netlify občas mění).
2. Klikněte na něj, zadejte nové jméno – smí obsahovat jen malá písmena,
   číslice a pomlčky, např. `nomis-faktury`. Netlify vám hned ukáže,
   jestli je jméno volné.
3. Potvrďte (**Save**) – adresa appky se okamžitě změní na
   `https://nomis-faktury.netlify.app` (podle jména, které jste zvolili).
4. Volitelně: pokud byste chtěli appku na vlastní doméně (např.
   `faktury.nomis-group.cz`), řeší se to na stejné stránce v sekci
   **„Domain management“** → **„Add a domain“** – to ale vyžaduje úpravu
   DNS záznamů u správce vaší domény, takže to nechme na později, až
   appka poběží na základní `.netlify.app“ adrese.

---

## Fáze 6 – Spuštění a test (podrobně)

### 6a. Ověřte skutečnou adresu appky

Netlify domény vždy končí na **`.netlify.app`** (ne `.netlify.com`). V
Netlify dashboardu appky, hned nahoře na stránce „Project overview“, je
vidět skutečná živá adresa – přesně tu použijte ve všech dalších krocích.
Pro dál v návodu budu psát `VASE-DOMENA.netlify.app`.

### 6b. Spuštění inicializace (funkce `setup`)

**Co to dělá:** jednorázově vytvoří v Sheetu listy Firmy, Auta, Doklady,
Log, Uzivatele s hlavičkami a ukázkovými daty (pokud tam ještě nejsou).

**Varianta A – Terminál** (Mac: Cmd+mezerník → „Terminal“):
```
curl -X POST https://VASE-DOMENA.netlify.app/api/setup -H "X-Setup-Secret: VASE_SETUP_SECRET"
```
(`VASE_SETUP_SECRET` nahraďte heslem, které jste zadali jako proměnnou
`SETUP_SECRET` v Netlify.)

**Varianta B – bez terminálu:** použijte online nástroj jako
reqbin.com/curl nebo Postman (web verze na postman.com) – zadáte URL,
metodu POST a jednu hlavičku `X-Setup-Secret` s hodnotou hesla, pak
„Send“.

**Varianta C – udělám to za vás:** pošlete mi sem do chatu doménu appky a
hodnotu `SETUP_SECRET` a rovnou to spustím a řeknu vám výsledek.

**Jak pozná úspěch:** odpověď je JSON, něco jako:
```json
{"ok": true, "vysledky": ["Firmy: vytvořen list", ..., "Inbox složka: appka založila novou složku ..."], "inboxFolderId": "1AbCdEfGh...", "inboxVytvorenaNove": true}
```
**Důležité:** pokud je `inboxVytvorenaNove: true`, zkopírujte hodnotu
`inboxFolderId` a nastavte ji jako proměnnou `INBOX_FOLDER_ID` v Netlify
(Fáze 5c), pak appku znovu nasaďte (redeploy) – teprve pak appka bude
nahrávat doklady do té správné, appkou vlastněné složky.

Pokud místo toho dostanete:
- **403** – nesedí `X-Setup-Secret` (překlep, nebo appka ještě neproběhla
  redeploy po přidání proměnné).
- **500 „Service Accounts do not have storage quota“** – appka ještě běží
  se starým kódem/proměnnými (service account). Ujistěte se, že máte
  nasazenou aktuální appku a nastavené `GOOGLE_OAUTH_CLIENT_ID/SECRET/
  REFRESH_TOKEN` (Fáze 5c), pak redeploy.
- **500 „invalid_grant“ / „Token has been expired or revoked“** – refresh
  token po ~7 dnech vypršel (appka zůstává neverifikovaná appka u Googlu,
  viz vysvětlení ve Fázi 3.8). Použijte Fázi 6h – tlačítko „Připojit
  Google účet znovu“ přímo v appce – místo opakování Fáze 3.
- **500 „Requested entity was not found“** – nesedí `SPREADSHEET_ID`.
- **500 „The caller does not have permission“** – přihlašovali jste se
  v OAuth Playground (Fáze 3.6) jiným Google účtem, než pod kterým Sheet
  z Fáze 1 vlastníte.

### 6c. Zkontrolujte listy v Sheetu

Otevřete Google Sheet – dole by mělo přibýt 5 záložek: **Firmy** (se
třemi řádky NOMIS Investment/& Homes/CZ), **Auta** (prázdný), **Doklady**
(prázdný, jen hlavičky), **Log** (prázdný), **Uzivatele** (jeden řádek:
Jan, PIN 1234, role admin).

### 6d. Upravte uživatele a PIN

V listu **Uzivatele** má appka sloupce `Jmeno`, `PIN`, `Firmy`, `Role`:

| Jmeno | PIN | Firmy | Role |
|---|---|---|---|
| Jan | 4127 | NOMIS Investment, NOMIS & Homes, NOMIS CZ | admin |
| Petra | 8834 | NOMIS Investment | (prázdné) |

- **Změňte ukázkový PIN `1234`** na vlastní (jakékoliv číslo, které si
  budete pamatovat).
- Sloupec `Firmy` musí obsahovat **přesně stejný text** jako v listu
  Firmy (velikost písmen, mezery, „&“) – appka to porovnává doslovně.
  Nejbezpečnější je název zkopírovat přímo z listu Firmy, ne přepisovat
  ručně.
- `Role = admin` vidí doklady všech firem bez ohledu na sloupec Firmy;
  necháte-li Role prázdné, uživatel vidí jen doklady firem vypsaných ve
  svém řádku.
- Pro každého dalšího člověka, co bude appku používat, přidejte nový
  řádek.

### 6e. Doplňte údaje o firmách

V listu **Firmy** doplňte IČO a DIČ ke třem firmám (pomáhá to AI při
odhadu, komu doklad patří). Sloupec `Platce_DPH` už je předvyplněný
(ANO/NE).

### 6f. Vyzkoušejte appku

1. Otevřete `https://VASE-DOMENA.netlify.app`.
2. Zadejte svůj PIN z listu Uzivatele → Přihlásit se.
3. Záložka **„Nahrát doklad“** → vyberte/vyfoťte testovací fakturu nebo
   účtenku → „Nahrát a zpracovat“ (zpracování s AI trvá pár vteřin).
4. Přepněte na záložku **„Doklady“** – měl by přibýt řádek se stavem „Ke
   kontrole“ (nebo „Možná duplicita“) a vyplněnými poli podle AI odhadu.
   Zkontrolujte/opravte Firmu, Kategorii, případně SPZ a klikněte
   **„Uložit“**, pak **„Schválit“**.
5. Záložka **„Přehled“** – po schválení pár dokladů by se měly objevit
   součty podle firmy/kategorie/měsíce.
6. Jste-li přihlášeni jako admin, přibudou navíc záložky **„Uživatelé“**,
   **„Firmy“** a **„Auta“** – tam teď můžete přímo v appce přidávat,
   upravovat i mazat uživatele (jméno, PIN, přístup k firmám, role), firmy
   (název jde nastavit jen při založení, pak už ne – používá se jako
   identifikátor jinde v appce; IČO/DIČ/plátce DPH editovatelné jsou) a
   auta (SPZ, model, firma, řidič) – bez nutnosti sahat přímo do Google
   Sheets.

### 6h. Obnova Google přístupu appkou (jednou týdně, bez Google Cloud Console)

Refresh token appky vyprší přibližně jednou týdně (Fáze 3.8). Místo
opakování Fáze 3 (Google Cloud Console + OAuth Playground) appka má
vlastní zkratku:

1. Přihlaste se do appky jako **admin**.
2. Jděte do záložky **„Uživatelé“** – nahoře je box „Google účet appky“.
3. Klikněte **„Připojit Google účet znovu“** – otevře se nové okno
   s Google přihlášením (stejné „unverified app“ varování jako ve Fázi 3 –
   Advanced → pokračovat).
4. Appka zobrazí nový refresh token ke zkopírování i stručný návod.
5. Vložte hodnotu jako `GOOGLE_OAUTH_REFRESH_TOKEN` v Netlify (přepište
   starou) → Deploys → Trigger deploy → Deploy site.

Pokud tlačítko skončí chybou `redirect_uri_mismatch`, chybí appčina
vlastní adresa v „Authorized redirect URIs“ u OAuth Client ID (viz
Fáze 2.5) – doplňte ji tam a uložte.

### 6g. Když něco nefunguje

Nejužitečnější místo pro diagnostiku je **Netlify → appka → záložka
„Logs“ (nebo „Functions“)** → kliknete na konkrétní funkci (`login`,
`upload`, `doklady`, `dashboard`, `setup`) → uvidíte log každého volání
včetně chybové hlášky, pokud něco selhalo. Pošlete mi tu hlášku a
poradíme si.

Kdykoliv narazíte na krok, který nesedí (jiné tlačítko, jiný text), pošlete
mi screenshot nebo popis a doladíme to spolu.
