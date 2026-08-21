/**
 * public/smlouvaText.js  (v4.81)
 * Pevný text nájemní smlouvy - PŘEPIS Janovy vlastní smlouvy, ne můj návrh.
 *
 * ODKUD TO JE
 *
 * Jan 2026-08-21 poslal čtyři podepsané vzory. Tenhle soubor je doslovný
 * přepis té nejnovější a nejčistší z nich:
 * `1_Nájemní smlouva_Schulte 1a_2236_v2.docx` (byt Holečkova 2236/1,
 * nájem od 1. 3. 2026, pronajímatel Ing. Jan Bula), zkontrolovaný proti
 * podepsanému PDF téže smlouvy na byt 2236/9.
 *
 * PROČ JE TEXT VE VLASTNÍM SOUBORU
 *
 * Protože je to jediná část appky, kterou bude chtít měnit PRÁVNÍK, ne
 * programátor. Kdyby byl rozsypaný mezi logikou v dokumenty.js, každá
 * úprava věty by znamenala hledat ji mezi `if`y. Tady je to pole vět
 * a nic jiného.
 *
 * DVĚ PRAVIDLA, KTERÁ TU PLATÍ
 *
 * 1) TEXT SE NEUPRAVUJE „ABY BYL LEPŠÍ". Je to smlouva, kterou Jan
 *    podepisuje - ne moje formulace. Když v ní je *„v jednotcepřítomen"*
 *    bez mezery, opravit překlep je v pořádku; přeformulovat větu není.
 *    Cokoli, co mění VÝZNAM, musí projít Janem.
 * 2) PROMĚNNÉ ČÁSTI SEM NEPATŘÍ. Částky, data, jména a čísla jednotek
 *    skládá `dokumentNajemniSmlouva()` v public/dokumenty.js z evidence.
 *    Kdyby se sem dostalo „24 000 Kč" z jedné konkrétní smlouvy, vytiskne
 *    se všem.
 *
 * ČESKY, NE DVOJJAZYČNĚ
 *
 * Předávací protokol je dvojjazyčný, protože Janův vzor od Century 21
 * dvojjazyčný je. Jeho nájemní smlouva je **česká** - má jen doložku, že
 * při pochybnostech platí česká verze. Appka to nechává tak, jak to má on;
 * přeložit devět stran právního textu není něco, co by se mělo stát
 * mimochodem.
 */
const SMLOUVA_TEXT = {
  uvod: 'Smluvní strany uzavírají v souladu s ustanovením zákona č. 89/2012 Sb., '
    + 'občanský zákoník, v platném znění (dále jen „občanský zákoník“), tuto',

  predmetNajmuDodatek: 'to vše zapsáno v katastru nemovitostí vedeném příslušným '
    + 'katastrálním úřadem.',

  predmetSmlouvy: 'Na základě této smlouvy se Pronajímatel zavazuje přenechat Nájemci '
    + 'k dočasnému užívání Předmět nájmu a Nájemce se zavazuje platit za to Pronajímateli '
    + 'nájemné. Pronajímatel uzavírá tuto nájemní smlouvu za účelem zajištění užívání '
    + 'bytové jednotky k bydlení Nájemce.',

  dobaNajmuObnova: 'Pronajímatel se s Nájemcem dohodl, že vylučují ustanovení § 2285 '
    + 'občanského zákoníku (z. č. 89/2012 Sb.), v platném znění (dále jen „OZ“) a že tedy '
    + 'po skončení nájmu dle této smlouvy nedojde k automatické obnově nájemního vztahu. '
    + 'Zároveň se však Nájemce s Pronajímatelem dohodli, že smlouva může být prodloužena '
    + 'na základě písemné dohody (lze i e-mailem) obou stran nejpozději tři měsíce před '
    + 'skončením nájemní smlouvy (nedohodnou-li se Smluvní strany na kratší době). Pokud '
    + 'nedojde k takové dohodě, je Nájemce povinen nejpozději k poslednímu dni trvání '
    + 'nájemního vztahu Předmět nájmu předat Pronajímateli.',

  sluzbyVycet: 'Spolu s Předmětem nájmu jsou nájemci poskytovány služby zahrnující dodávky '
    + 'elektřiny, vody (vodné a stočné), vytápění bytu a ohřev vody, úklid společných prostor, '
    + 'odvoz odpadu a provozní náklady společných prostorů domu (dále jen „služby“). Tyto '
    + 'služby nejsou zahrnuty v nájemném.',

  // Věta o paušálu se tiskne JEN tehdy, když je na smlouvě zaškrtnuto
  // Zalohy_pausalni = ANO. Je to rozdíl, na kterém stojí peníze: u paušálu
  // nájemník nedostane přeplatek ani nedoplácí.
  zalohyPausal: 'Tyto poplatky jsou paušální a nebude tedy probíhat žádné vyúčtování.',
  zalohyZmena: 'Pronajímatel má právo změnit v průběhu roku měsíční zálohu v míře '
    + 'odpovídající změně ceny služby nebo z dalších oprávněných důvodů, zejména změny '
    + 'rozsahu nebo kvality služby. Změněná měsíční záloha může být požadována nejdříve od '
    + 'prvního dne měsíce následujícího po doručení oznámení nové výše zálohy v písemné '
    + 'formě nebo e-mailem. Změna výše měsíční zálohy musí být v oznámení řádně odůvodněna, '
    + 'jinak ke zvýšení zálohy nedojde.',

  platbaZpusob: 'Nájemné se hradí bezhotovostně, a to na bankovní účet Pronajímatele '
    + 'uvedený v hlavičce této smlouvy. Platba nájemného se považuje za zaplacenou, pokud '
    + 'je připsána na účet Pronajímatele v celé výši uvedené v této nájemní smlouvě.',
  poplatkyTV: 'Nájemce je povinen hradit sám zvlášť televizní a rozhlasové poplatky, pokud '
    + 'mu tato povinnost vznikne dle podmínek stanovených platnými právními předpisy.',

  jistotaHlavni: 'Smluvní strany se dohodly, že současně s podpisem této smlouvy Nájemce '
    + 'uhradí Pronajímateli peněžitou jistotu (kauci), která bude Nájemci vrácena ne později '
    + 'než 14 dní po skončení nájemného období pod podmínkou, že Nájemce zaplatil finanční '
    + 'závazky a dlužné obnosy, předal Předmět nájmu zpět Pronajímateli a nábytek a vybavení '
    + 'bylo vráceno Pronajímateli v dobrém stavu s přihlédnutím k běžnému opotřebení.',
  jistotaUlozeni: 'Jistota dle odst. 1 tohoto článku bude připsána na bankovní účet uvedený '
    + 'v záhlaví této Smlouvy nejpozději v den podpisu této smlouvy. Nájemce je srozuměn '
    + 's tím, že jistota bude po celou dobu nájmu uložena na běžném účtu Pronajímatele. '
    + 'Smluvní strany sjednávají, že Nájemce se vzdává práva na úroky z jistoty (kauce).',

  // VI. Práva a povinnosti smluvních stran
  pravaPovinnosti: [
    'Nájemce se před uzavřením této smlouvy seznámil se stavem pronajímaného Předmětu nájmu. '
      + 'Pronajímatel přenechává nájemci bytovou jednotku bez závad ve stavu způsobilém '
      + 'k nastěhování. O vlastním předání bytu sepíší Smluvní strany protokol.',
    'Bytová jednotka bude nájemci zpřístupněna a předána k sjednanému dni počátku nájmu.',
    'Běžnou údržbu a drobné opravy související s užíváním jednotky hradí Nájemce, a to '
      + 'v souladu s Předpisem č. 308/2015 Sb., „Nařízení vlády o vymezení pojmů běžná údržba '
      + 'a drobné opravy související s užíváním jednotky“ s účinností od 1. 1. 2016. Ostatní '
      + 'údržbu a opravy hradí Pronajímatel.',
    'Pronajímatel má právo požadovat, aby v jednotce žil jen takový počet osob, který je '
      + 'přiměřený velikosti bytu a nebrání tomu, aby všechny osoby mohly řádně užívat '
      + 'jednotku a žít v hygienicky vyhovujících podmínkách. S přijetím další osoby do '
      + 'Předmětu nájmu musí Pronajímatel vyslovit předem písemný souhlas, ledaže se jedná '
      + 'o osobu Nájemci blízkou anebo další případy zvláštního zřetele hodné.',
    'Nájemce je povinen písemně oznámit Pronajímateli veškeré změny v počtu osob, které žijí '
      + 's Nájemcem v bytové jednotce, a to bez zbytečného odkladu, nejpozději do 10 dnů ode '
      + 'dne, kdy ke změně došlo. Předchozí ustanovení tohoto článku smlouvy tím není '
      + 'dotčeno. Neučiní-li Nájemce toto oznámení ani do dvou měsíců, co změna nastala, '
      + 'hrubě poruší povinnost vyplývající z nájmu.',
    'Nájemce není oprávněn provádět v jednotce jakékoli změny stavebního charakteru nebo jiné '
      + 'změny bez předchozího písemného souhlasu Pronajímatele. Porušení této povinnosti je '
      + 'hrubým porušením povinnosti Nájemce vyplývající z nájmu. Zároveň Pronajímatel může '
      + 'žádat náhradu ve výši snížení hodnoty bytu, které bylo způsobeno změnami provedenými '
      + 'Nájemcem bez souhlasu Pronajímatele.',
    'Zjistí-li Nájemce v jednotce poškození nebo vadu, které je třeba bez prodlení odstranit, '
      + 'oznámí to ihned Pronajímateli; jinou vadu nebo poškození, které brání obvyklému '
      + 'bydlení, oznámí Pronajímateli bez zbytečného odkladu. Nájemce učiní podle svých '
      + 'možností to, co lze očekávat, aby poškozením nebo vadou, které je třeba bez prodlení '
      + 'odstranit, nevznikla další škoda.',
    'Neodstraní-li Nájemce poškození nebo vadu způsobené okolnostmi, za které odpovídá, '
      + 'odstraní je na náklady Nájemce Pronajímatel.',
    'Nájemce umožní Pronajímateli po celou dobu nájemního vztahu po předchozí, i telefonické, '
      + 'dohodě, nejvíce však 1× za tři měsíce (nejsou-li dány důvody zvláštního zřetele hodné '
      + 'k provedení další mimořádné prohlídky), prohlídku bytové jednotky za účelem ověření, '
      + 'zda předmětná bytová jednotka je udržována v pořádku a obyvatelném stavu tak, jak '
      + 'byla převzata Nájemcem, a zda je užívána v souladu s touto smlouvou.',
    'Ví-li Nájemce předem o své nepřítomnosti v jednotce, která má být delší než dva měsíce, '
      + 'i o tom, že byt mu bude po tuto dobu obtížně dostupný, oznámí to včas Pronajímateli. '
      + 'Současně označí osobu, která po dobu jeho nepřítomnosti zajistí možnost vstupu do '
      + 'jednotky v případě, kdy toho bude nezbytně zapotřebí; nemá-li Nájemce takovou osobu '
      + 'po ruce, je takovou osobou Pronajímatel. Porušení této povinnosti Nájemce je hrubým '
      + 'porušením povinnosti vyplývající z nájmu.',
    'Nájemce je povinen umožnit odečtení stavu na měřicích zařízeních instalovaných v bytě, '
      + 'která se týkají odebíraných služeb, nebo provedení prací, které je nezbytné provést '
      + 'z bytové jednotky, a být v ohlášenou (oznámenou) dobu v jednotce přítomen, popř. '
      + 'zajistit přítomnost jiné osoby.',
    'Nájemce se zavazuje přijímat písemnosti doručované poštou na adrese Předmětu nájmu '
      + 'uvedené v čl. I. této smlouvy. Za den doručení se považuje také den, kdy Nájemce '
      + 'odmítne písemnost od Pronajímatele převzít.',
    'Nájemce je povinen při instalaci a užívání jakýchkoliv elektrických spotřebičů či jiných '
      + 'technických zařízení, která se obvykle pro účely bydlení v bytě používají, zajistit, '
      + 'aby tato byla způsobilá pro jejich umístění a užívání v jednotce; nevhodná či jinak '
      + 'nezpůsobilá zařízení nebo spotřebiče není Nájemce oprávněn instalovat ani používat. '
      + 'Je-li pro jejich instalaci či zapojení nezbytné nebo doporučené odborné zapojení / '
      + 'instalace, není Nájemce bez tohoto odborného zapojení / instalace oprávněn zařízení '
      + 'zapojit či užívat, nedohodne-li se s Pronajímatelem písemně jinak (včetně e-mailu). '
      + 'Nájemce je povinen Pronajímateli na požádání prokázat, že zapojení / instalaci '
      + 'provedla odborně způsobilá osoba. Nájemce je povinen se v případě pochybností předem '
      + 'ujistit u Pronajímatele, že technické parametry a kapacity stávajících instalací '
      + 'a rozvodů v jednotce umožňují, aby dané zařízení či spotřebič byly v jednotce '
      + 'připojeny či užívány. Tato povinnost Nájemce neplatí pro běžné tzv. malé spotřebiče '
      + 'pro domácnost. Nájemce je povinen užívat technické vybavení v Předmětu nájmu '
      + 'v souladu s příslušnými technickými pokyny a instrukcemi pro jejich užívání.',
    'Nájemce je povinen pečovat o to, aby na Předmětu nájmu nevznikla škoda. Pronajímatel '
      + 'nájemci doporučuje, aby měl sjednané platné pojištění odpovědnosti v běžném občanském '
      + 'životě, které se vztahuje na odpovědnost za škody způsobené jiné osobě (např. '
      + 'Pronajímateli) zejména při vedení a provozu domácnosti a při dalších činnostech '
      + 'běžného občanského života. Pronajímatel neručí za žádný majetek a nábytek přivezený '
      + 'Nájemcem a jinými osobami do Předmětu nájmu.',
  ],

  // VII. Zánik nájmu
  zanikNajmu: [
    'Nájem Předmětu nájmu skončí uplynutím doby, na kterou byl sjednán.',
    'Nájemce otevřeně prohlašuje, že po ukončení období nájmu nemá právo nebo nárok na žádnou '
      + 'náhradu Předmětu nájmu nebo dalšího ubytování pro něj nebo osoby užívající Předmět '
      + 'nájmu společně s ním.',
    'Smluvní strany se dohodly, že pokračování v užívání Předmětu nájmu Nájemcem poté, co '
      + 'nájem Předmětu nájmu dle této smlouvy skončil, se nepovažuje za nové ujednání nájmu.',
    'V případě, že Předmět nájmu nebude vyklizený a předaný Pronajímateli do 10 dnů po '
      + 'ukončení nájmu, Pronajímatel má právo vyklidit pronajímanou nemovitost sám na náklady '
      + 'Nájemce. Pro tyto účely má Pronajímatel právo zpřístupnit nemovitost a vstoupit do ní.',
    'Před uplynutím doby sjednané v čl. III. této smlouvy zanikne nájem písemnou dohodou mezi '
      + 'Pronajímatelem a Nájemcem, písemnou výpovědí nebo jiným způsobem stanoveným občanským '
      + 'zákoníkem.',
    'Smluvní strany tímto sjednávají, že Pronajímatel může vypovědět nájem s tříměsíční '
      + 'výpovědní dobou, poruší-li Nájemce hrubě svou povinnost vyplývající z nájmu nebo '
      + 'je-li dán jiný výpovědní důvod stanovený zákonem. Poruší-li Nájemce svou povinnost '
      + 'zvlášť závažným způsobem, má Pronajímatel právo vypovědět nájem bez výpovědní doby. '
      + 'Pronajímatel je povinen ve výpovědi uvést důvod a poučit Nájemce o jeho právu vznést '
      + 'proti výpovědi námitky a navrhnout přezkoumání oprávněnosti výpovědi soudem.',
    'Smluvní strany sjednávají, že Nájemce je oprávněn nájemní smlouvu vypovědět s tříměsíční '
      + 'výpovědní dobou, poruší-li Pronajímatel hrubě svou povinnost vyplývající z nájmu nebo '
      + 'změní-li se okolnosti, z nichž strany při vzniku nájmu zřejmě vycházely, do té míry, '
      + 'že po Nájemci nelze rozumně požadovat, aby v nájmu pokračoval. Nájemce je povinen ve '
      + 'výpovědi uvést důvod.',
    'Výpovědní doba běží od prvního dne kalendářního měsíce následujícího poté, co výpověď '
      + 'došla druhé straně.',
    'K datu skončení nájemního vztahu je Nájemce povinen předat Pronajímateli Předmět nájmu '
      + 'vyklizený, se vším vybavením a zařízením ve stavu, v jakém ho převzal, s přihlédnutím '
      + 'k běžnému opotřebení. Nájemce je povinen odstranit v jednotce i změny, které provedl '
      + 'se souhlasem Pronajímatele, nebude-li smluvními stranami písemně ujednáno jinak. '
      + 'O předání bytu bude sepsán protokol, podepsaný oběma smluvními stranami.',
    'Zařízení a předměty upevněné ve zdech, podlaze a stropu bytu, které nelze odstranit bez '
      + 'nepřiměřeného snížení hodnoty nebo bez poškození bytu, přecházejí upevněním nebo '
      + 'vložením do vlastnictví vlastníka nemovité věci (tj. především Pronajímatele). '
      + 'Nájemce nemá právo žádat, aby se s ním Pronajímatel vyrovnal.',
    'Pronajímatel má právo na náhradu ve výši nájemného, neodevzdá-li Nájemce Předmět nájmu '
      + 'Pronajímateli v den skončení nájmu, až do dne, kdy Nájemce Pronajímateli Předmět '
      + 'nájmu skutečně odevzdá.',
    'Škody způsobené Nájemcem na Předmětu nájmu, vč. zařízení a vybavení bytové jednotky, je '
      + 'Nájemce povinen uhradit nebo odstranit na své náklady nejpozději v den předání '
      + 'Předmětu nájmu Pronajímateli.',
    'V období tří měsíců před skončením nájemního vztahu je Nájemce povinen umožnit prohlídku '
      + 'Předmětu nájmu případným zájemcům o nový nájemní vztah. Prohlídce bude vždy přítomen '
      + 'Pronajímatel nebo jiná osoba Pronajímatelem k tomu zmocněná či jinak pověřená.',
    'K datu skončení nájemního vztahu je Nájemce povinen vymalovat byt pouze v případě, že '
      + 'došlo k poškození stěn, které vyžaduje opravu, nebo v případě jiného zhoršení jejich '
      + 'stavu, které překračuje běžné opotřebení. Barva malby bude provedena dle dohody '
      + 's Pronajímatelem. Malování musí být dokončeno nejpozději v den předání bytu.',
    'Nájemce si je vědom, že v případě nevyklizení Předmětu nájmu po skončení nájmu by se '
      + 'mohl dopustit trestného činu neoprávněného zásahu do práva k bytu.',
  ],

  // VIII. Závěrečná ujednání
  zaverecna: [
    'Tato smlouva nabývá platnosti dnem podpisu oběma smluvními stranami.',
    'Práva a povinnosti smluvních stran touto smlouvou neupravené se řídí obecně závaznými '
      + 'právními předpisy, zejména ustanoveními občanského zákoníku a předpisů jej '
      + 'provádějících. Tato smlouva se řídí zákony České republiky. V případě jakýchkoliv '
      + 'pochybností platí česká verze smlouvy. Veškeré spory z této smlouvy nebo '
      + 'v souvislosti s ní budou rozhodovány s konečnou platností obecnými soudy České '
      + 'republiky.',
    'Stanou-li se jednotlivá ustanovení této smlouvy neúčinnými nebo neproveditelnými nebo '
      + 'obsahuje-li tato smlouva mezery, není tímto dotčena účinnost ostatních ustanovení. '
      + 'Namísto neúčinného nebo neproveditelného ustanovení musí být sjednáno takové účinné '
      + 'ustanovení, které co možná nejvíce odpovídá smyslu a účelu této smlouvy. V případě, '
      + 'že tato smlouva obsahuje mezery, musí být sjednáno takové ustanovení, které bude '
      + 'nejvíce odpovídat tomu, co by bývalo bylo sjednáno, kdyby se na tuto věc pamatovalo '
      + 'již od začátku.',
    'Tato smlouva může být měněna či doplňována pouze písemně po vzájemné dohodě a podpisu '
      + 'obou smluvních stran.',
    'Smlouva je vyhotovena ve dvou stejnopisech s platností originálu, z nichž jedno '
      + 'vyhotovení obdrží Pronajímatel a jedno vyhotovení obdrží Nájemce.',
    'Smluvní strany si smlouvu přečetly, s jejím obsahem souhlasí, což stvrzují vlastnoručními '
      + 'podpisy.',
  ],

  // Inflační doložka - dlouhá, proto vlastní položka. Datum účinnosti do ní
  // doplní dokumenty.js z pole Inflace_od; když ho smlouva nemá, zůstane
  // v textu pole k vyplnění.
  inflacniDolozka: 'a každého následujícího kalendářního roku trvání této Smlouvy může být '
    + 'Nájemné navýšeno o uveřejněnou hodnotu průměrné roční míry inflace vyjádřené '
    + 'přírůstkem průměrného ročního indexu spotřebitelských cen v České republice, jak bude '
    + 'vyhlášena pro uplynulý kalendářní rok Českým statistickým úřadem v Praze. Přestane-li '
    + 'být výše uvedený údaj vyhlašován, použije se pro zvýšení Nájemného jiný obdobný index '
    + 'vyjadřující míru inflace i růst spotřebitelských cen v České republice. Upravené '
    + 'Nájemné pak bude Nájemcem placeno Pronajímateli stejným způsobem, jaký je sjednán pro '
    + 'úhradu Nájemného dle této Smlouvy, a to počínaje kalendářním měsícem následujícím po '
    + 'tom kalendářním měsíci, v němž Pronajímatel oznámí Nájemci písemně nebo e-mailem '
    + 'zvýšení nájemného. Učiní-li Pronajímatel oznámení o zvýšení nájemného nejpozději do '
    + 'konce dubna, vztahuje se zvýšení nájemného zpětně i na veškeré uplynulé měsíce od '
    + 'počátku daného kalendářního roku. Společně se splatností prvního zvýšeného nájemného '
    + 'je v takovém případě splatný i doplatek rozdílu mezi již uhrazeným nájemným '
    + 'a zvýšeným nájemným za dosavadní měsíce daného kalendářního roku.',

  prilohaProtokol: 'Příloha č. 1 – Předávací protokol',
};
