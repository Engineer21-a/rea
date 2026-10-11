# REA revizija, listopad 2026

Stanje na dan 11. 10. 2026. Pregledan je `rea-agents` 6.4.0 (commit `ffaf2c1`);
sve promjene nalaze se na grani `ccr-8e3a09ec-u55qv0`.
[Deutsche Fassung](audit-2026-10_de.md)

## TL;DR

Revizija je u 9 područja pronašla 74 kandidata za nalaze. Nakon adversarijalne protuprovjere 71 nalaz je stvaran, a 3 nalaza su opovrgnuta; 54 od njih ispravljeno je uz regresijske testove i poslano na granu `ccr-8e3a09ec-u55qv0`, među njima i jedini nalaz visoke ozbiljnosti: PTY unosi označeni kao osjetljivi završavali su zbog odjeka terminala u čistom tekstu u Evidence. Otvoreno ostaje 17 nalaza (5 srednjih, 12 niskih) jer zahtijevaju odluku o ugovoru ili dizajnu; među najvažnijima su nedostajuća ograničenja resursa kod `read_bytes`, inferencije JSON shapeova i `build_call_path` te release akcije na promjenjivim tagovima. Nijedna funkcija analize nije uklonjena ni ograničena, a uklonjen je samo kod bez produktivne upotrebe (neto oko 1.600 redaka zajedno s testovima koji su pokrivali samo taj kod). Dodani su testirani Docker image s neobaveznom Ghidrom, postavljanje za VS Code i Dev Container, vlastiti MCP promptovi putem `REA_PROMPTS_DIR` i referenca za konfiguraciju, a README i web-stranica sada postoje na engleskom, njemačkom i hrvatskom.

## Opseg i metoda

Revizija obuhvaća cjelokupni kod proizvoda u devet područja i svako područje
provjerava u četiri dimenzije: performanse, sigurnost, greške i mrtvi kod.

| Područje               | Opseg                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `runtime-core`         | Nadzor procesa, hvatanje PTY-ja, konfiguracija, ulazne točke, pomoćne funkcije za Windows   |
| `mcp-cli-adapters`     | MCP poslužitelj, CLI, javni ugovori                                                         |
| `native-providers`     | Ghidra, Hopper, IDA, nativni parseri i njihovi mostovi prema Javi, Pythonu i Swiftu         |
| `web-javascript`       | Promatranje preglednika i Electrona, analiza JavaScripta, mitmproxy                         |
| `mobile-managed-misc`  | ADB, Android, Apktool, JEB, .NET, firmver, EVM, WASM, izvori referenci, artefakti, pwntools |
| `application-layer`    | Postavljanje, instalacija Hoppera, Doctor, Evidence bundleovi, zajednički workflowi         |
| `domain-a-to-l`        | Čisti parseri i Evidence modeli u `src/domain/` (nazivi datoteka od A do L)                 |
| `domain-m-to-z`        | Čisti parseri i Evidence modeli u `src/domain/` (nazivi datoteka od M do Z)                 |
| `supply-chain-tooling` | `install.sh`, CI workflowi, skripte za izdanja, Turbo, nove Docker i Dev Container datoteke |

Svaki nalaz prošao je kroz četiri faze:

1. Po jedan pregledatelj za svako područje radio je samo u načinu čitanja i za
   svaki nalaz zabilježio datoteku, redak, scenarij greške i dokaz.
2. Drugi, neovisni pregledatelj pokušao je opovrgnuti svaki nalaz: provjerio je
   pozivatelje, postojeće zaštitne mehanizme, testove i pravila iz `AGENTS.md`.
   Slučajevi o kojima se ne može odlučiti smatraju se „vjerojatnima“.
3. Ispravljeni su samo potvrđeni ili vjerojatni nalazi s malim, lokalnim
   popravkom, svaki s regresijskim testom. Popravci koji bi promijenili javne
   ugovore, Evidence polja ili sheme ostali su otvoreni.
4. Dodatni pregledatelji pregledali su svaki skup popravaka u potrazi za
   regresijama. U samim popravcima pronašli su tri greške, koje su odmah
   ispravljene: mjerenje vremena po zidnom satu umjesto monotonog sata, pogrešan
   redoslijed zadržanog izlaza terminala i nedostajući ulazi Turbo cachea.
   Četvrta slabost iz tih pregleda, pretjerano zacrnjivanje kratkih osjetljivih
   unosa, također je ispravljena: svaki osjetljivi unos sada zacrnjuje točno
   vlastiti odjek.

Početno stanje prije revizije: `tsc --noEmit` prolazio je bez grešaka,
`npm audit` prijavljivao je 0 ranjivosti, knip je prijavljivao samo neizgrađeni
import workera, oxlint samo upozorenja (većinom u verifikacijskim skriptama), a
jscpd je pronašao 2,5 % dupliciranih redaka.

## Ukupna slika

Kod je u cjelini u dobrom stanju. Pregledatelji su ključne mehanizme izričito
ocijenili solidnima: tokeni mosta uspoređuju se u konstantnom vremenu, Unix
utičnice nalaze se u privatnim direktorijima za vrijeme izvođenja,
`SafeOutputTree` blokira Zip-Slip i napade simboličkim poveznicama,
konfiguracijske datoteke mijenjaju se uz sigurnosnu kopiju, atomarno pisanje i
povratno čitanje, a `install.sh` provjerava točne verzije. Nalazi se gotovo svi
odnose na rubove: na ulaze koje kontrolira analizirani cilj (izvršne datoteke,
bundleovi, web-stranice, uređaji) i na vanjske granice (preuzimanja, timeri,
datotečni sustavi).

| Područje               | Ocjena                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-core`         | Solidno čišćenje procesa i validacija putanja. Najvažnija greška: osjetljivi PTY unosi u odjeku terminala (ispravljeno).                                                                              |
| `mcp-cli-adapters`     | Dobro. Budžeti odgovora izračunavaju se prije alokacije. Greške u usmjeravanju `.app/` i nepotrebne kopije ledgera (ispravljeno).                                                                     |
| `native-providers`     | Većinom solidno. Otvoreni rizici su nedostajuće gornje granice (`read_bytes`, NDJSON retci). Kvadratni otool regexi su ispravljeni.                                                                   |
| `web-javascript`       | CDP putanje imaju dobro postavljene budžete. mitmproxy je zadržavao proxy lozinke, a dugi timeri su se prelijevali (ispravljeno). Snimanje scenarija bez gornjih granica namjerno je i dokumentirano. |
| `mobile-managed-misc`  | Dobro. Putanje ADB-a koje prijavljuje uređaj i kvadratno pisanje izlaza ispravljeni su. Izvori referenci bez memorijskog budžeta ostaju otvoreni.                                                     |
| `application-layer`    | Solidne transakcije. Slabosti su na vanjskim granicama: preuzimanje Hoppera, provjera potpisa na macOS-u, `Info.plist` bez ograničenja veličine.                                                      |
| `domain-a-to-l`        | Granice se uglavnom provjeravaju. Superlinearni algoritmi kod JSON shapeova, Vite tablica i call pathova. Uklonjeno je oko 1.000 redaka koda koji se nigdje produktivno ne koristi.                   |
| `domain-m-to-z`        | Nativni parseri uzorno su budžetirani. Kvadratne NativeAOT i plist putanje, greška pri uvozu kod praznog naziva modula i zastarjeli kod.                                                              |
| `supply-chain-tooling` | Instalacijska skripta i workflow izdanja su dobri. Promjenjive oznake akcija u jobovima s tajnama, nepotpuni Turbo ulazi i praznine u novom Docker postavu.                                           |

## Rezultat u brojkama

| Vrsta       | Valjani nalazi | Ispravljeno | Otvoreno |
| ----------- | -------------- | ----------- | -------- |
| Sigurnost   | 16             | 10          | 6        |
| Greška      | 24             | 21          | 3        |
| Performanse | 11             | 5           | 6        |
| Mrtvi kod   | 20             | 18          | 2        |
| **Ukupno**  | 71             | 54          | 17       |

Prema ozbiljnosti (valjani nalazi): 0 kritično, 1 visoko, 17 srednje, 53 nisko. Opovrgnuto: 3.

## Ispravljeni nalazi

Svi popravci imaju regresijske testove ili uklanjaju dokazano nedostižan kod.
Stupac „Commit“ upućuje na commit na ovoj grani.

| ID                       | Vrsta       | Ozbiljnost | Nalaz                                                                                                                                                                                                                                                                                    | Commit    |
| ------------------------ | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `runtime-core-1`         | Sigurnost   | visoko     | Osjetljivi skriptirani unos pohranjuje se doslovno u terminalske okvire zbog PTY jeke, unatoč tvrdnji o redakciji                                                                                                                                                                        | `cb3681c` |
| `application-layer-2`    | Greška      | srednje    | Preuzimanje Hoppera prekida se nakon fiksnog roka od 120 s po zidnom satu, čak i dok tijelo odgovora još pristiže                                                                                                                                                                        | `6286083` |
| `domain-a-to-l-2`        | Sigurnost   | srednje    | Regularni izraz s backtrackingom (ReDoS) pri svakom pozivu `__vite__mapDeps` ponovno skenira cijelu datoteku                                                                                                                                                                             | `625a826` |
| `domain-m-to-z-1`        | Performanse | srednje    | Zatvaranje nasljeđivanja NativeAOT MethodTablea kvadratno je i troši radni proračun parsera pri oko 2000 tablica                                                                                                                                                                         | `8813d85` |
| `domain-m-to-z-2`        | Sigurnost   | srednje    | Regularni izraz za prethodno skeniranje ključeva u XML plistu kvadratan je kod neterminiranih otvarača komentara ili CDATA                                                                                                                                                               | `f3fa121` |
| `domain-m-to-z-3`        | Greška      | srednje    | Prazan specifikator modula uzrokuje neuspjeh cijelog grafa uvoza referentnih izvora                                                                                                                                                                                                      | `f3fa121` |
| `mcp-cli-adapters-1`     | Greška      | srednje    | `rea analyze Foo.app/` sa završnom kosom crtom usmjerava se na analizu JavaScript aplikacije umjesto na nativni pregled binarne datoteke                                                                                                                                                 | `a3fecb5` |
| `mcp-cli-adapters-2`     | Performanse | srednje    | Alati za istragu pri svakom pozivu kloniraju cijeli Evidence ledger pomoću `structuredClone` samo radi praćenja `evidence_links`                                                                                                                                                         | `a3fecb5` |
| `mobile-managed-misc-1`  | Performanse | srednje    | `SafeOutputTree` pri svakom zapisu datoteke ponovno čita popis roditeljskog direktorija za svakog postojećeg pretka                                                                                                                                                                      | `1aed333` |
| `mobile-managed-misc-2`  | Sigurnost   | srednje    | `pull_adb_package` koristi imena datoteka koja prijavljuje uređaj iz `pm path` kao komponente putanje na hostu bez provjere                                                                                                                                                              | `1aed333` |
| `native-providers-2`     | Sigurnost   | srednje    | Kvadratni regularni izrazi u otool parseru load commanda omogućuju ReDoS na petlji događaja kroz izlaz koji kontrolira analizirana binarna datoteka                                                                                                                                      | `6286083` |
| `supply-chain-tooling-3` | Greška      | srednje    | Dev kontejner izgrađen s `WITH_GHIDRA=1` instalira Ghidru, ali nikad ne postavlja `GHIDRA_INSTALL_DIR` pa je REA ne može koristiti                                                                                                                                                       | `e3b007f` |
| `web-javascript-1`       | Sigurnost   | srednje    | mitmproxy dekoder zadržava korisničko ime i lozinku proxyja iz `metadata.proxyauth` tokova u čistom tekstu                                                                                                                                                                               | `cdac7c3` |
| `application-layer-4`    | Greška      | nisko      | Uspješna instalacija Hoppera na macOS-u prijavljuje se kao `download_failed` kada `open` ili neka kasnija faza ne uspije                                                                                                                                                                 | `cad212d` |
| `domain-a-to-l-3`        | Performanse | nisko      | Položaji source map direktiva traže se ponovnim dijeljenjem prefiksa datoteke, što raste kvadratno s veličinom datoteke                                                                                                                                                                  | `f3fa121` |
| `domain-a-to-l-5`        | Sigurnost   | nisko      | Regularni izraz za rezervirana mjesta u prilagođenim promptovima backtrackira u kubnom vremenu na dugim nizovima praznina                                                                                                                                                                | `e3b007f` |
| `domain-a-to-l-6`        | Greška      | nisko      | Renderiranje ruši aplikaciju kada se izostavljeni neobavezni argument zove `constructor`                                                                                                                                                                                                 | `e3b007f` |
| `domain-a-to-l-7`        | Mrtvi kod   | nisko      | Tri modula za conformance paket, replay i trust gate (oko 890 redaka) koriste samo vlastiti testovi                                                                                                                                                                                      | `f3fa121` |
| `domain-a-to-l-8`        | Mrtvi kod   | nisko      | Hopperovi `parseProcedures` i `parseNames` s tri pripadajuće sheme nemaju pozivatelja u produkcijskom kodu                                                                                                                                                                               | `f3fa121` |
| `domain-m-to-z-10`       | Mrtvi kod   | nisko      | Graditelj i parser za `HistoricalSourceManifest` nemaju potrošača u produkcijskom kodu                                                                                                                                                                                                   | `f3fa121` |
| `domain-m-to-z-11`       | Mrtvi kod   | nisko      | U parseru uvoza referenci postoji neiskorišteni parametar `language` i suvišna grana specifikatora                                                                                                                                                                                       | `f3fa121` |
| `domain-m-to-z-4`        | Greška      | nisko      | Validacija trace specifikacija rekurzira bez granice i gradi O(n²) dohvatljivost bez ograničenja broja događaja Djelomično: provjera ciklusa je iterativna; ograničenja veličine u shemi ostaju otvorena.                                                                                | `e4477b5` |
| `domain-m-to-z-6`        | Greška      | nisko      | Listovi indeksiranih source mapova vraćaju se obrnutim redoslijedom sekcija                                                                                                                                                                                                              | `f3fa121` |
| `domain-m-to-z-7`        | Mrtvi kod   | nisko      | Grane za dinamički uvoz s Babel 7 `Import` pozivanim izrazom nedostižne su pod @babel/parser 8                                                                                                                                                                                           | `f3fa121` |
| `domain-m-to-z-8`        | Mrtvi kod   | nisko      | Opcija `validateOffsets` u produkciji se nikad ne postavlja, a tvrđeni zajednički prolaz zapravo je dupliciran                                                                                                                                                                           | `f3fa121` |
| `domain-m-to-z-9`        | Mrtvi kod   | nisko      | `reconcileWebScript` zamijenjen je funkcijom `reconcileCapturedWebScript`                                                                                                                                                                                                                | `f3fa121` |
| `mcp-cli-adapters-3`     | Performanse | nisko      | Dovršavanje argumenata promptova pri svakom zahtjevu klonira i ponovno parsira cijeli Evidence ledger                                                                                                                                                                                    | `a3fecb5` |
| `mcp-cli-adapters-4`     | Greška      | nisko      | `observe-native-ui` prihvaća `--steps`, ali ih šutke odbacuje pa korisnik dobiva pasivno promatranje umjesto traženog scenarija                                                                                                                                                          | `a3fecb5` |
| `mcp-cli-adapters-5`     | Greška      | nisko      | MCP alat `capture_process_scenario` čita živi `process.env` umjesto snimljenog ili ubrizganog okruženja poslužitelja                                                                                                                                                                     | `a3fecb5` |
| `mcp-cli-adapters-6`     | Mrtvi kod   | nisko      | `registerConfiguredAnalysisTools` sadrži nedostižne pričuvne grane za izradu pružatelja                                                                                                                                                                                                  | `a3fecb5` |
| `mcp-cli-adapters-7`     | Mrtvi kod   | nisko      | Pomoćne funkcije za pretvorbu naziva u ugovor dupliciraju `toolContract<Name>` i vežu tipove prema položaju u nizu                                                                                                                                                                       | `a3fecb5` |
| `mobile-managed-misc-4`  | Greška      | nisko      | Objava firmwarea predaje sirova imena datoteka u `SafeOutputTree`: jedno ime s obrnutom kosom crtom prekida izdvajanje, a NFD imena prijavljuju se na putanjama koje ne postoje Djelomično: prijavljena putanja je ispravna; imena s obrnutom kosom crtom i dalje prekidaju ekstrakciju. | `8813d85` |
| `mobile-managed-misc-5`  | Greška      | nisko      | Redoslijed izdvojenih datoteka firmwarea ovisi o zadanoj ICU lokalizaciji domaćina                                                                                                                                                                                                       | `1aed333` |
| `mobile-managed-misc-6`  | Sigurnost   | nisko      | Regularni izraz za obrezivanje praznina EVM hex nositelja kvadratičan je pri nizovima praznina unutar teksta                                                                                                                                                                             | `1aed333` |
| `mobile-managed-misc-7`  | Sigurnost   | nisko      | `collect_adb_bugreport` računa hash i prijavljuje svaku putanju hosta iz adb izlaza bez provjere nalazi li se u ciljnom direktoriju                                                                                                                                                      | `1aed333` |
| `mobile-managed-misc-8`  | Mrtvi kod   | nisko      | Provjera odabira izdvajanja sadrži uvjete koji nikada nisu istiniti                                                                                                                                                                                                                      | `1aed333` |
| `mobile-managed-misc-9`  | Mrtvi kod   | nisko      | U pwntools razrješivaču dinamičke tablice stringova jedan je uvjet uvijek istinit                                                                                                                                                                                                        | `1aed333` |
| `native-providers-4`     | Greška      | nisko      | Zajedničko pokretanje Hoppera prekida se signalom prvog pozivatelja pa propadaju i istodobni pozivatelji koji nisu otkazali                                                                                                                                                              | `cad212d` |
| `native-providers-8`     | Mrtvi kod   | nisko      | Grana normalizacije ključeva za win32 u `ghidraJavaLaunch` nikada se ne može izvršiti                                                                                                                                                                                                    | `6286083` |
| `native-providers-9`     | Mrtvi kod   | nisko      | `bridge/native/test_rea_lldb_tracer.py` nikada se ne pokreće                                                                                                                                                                                                                             | `8813d85` |
| `runtime-core-3`         | Greška      | nisko      | Nevažeća vrijednost `REA_LOG_LEVEL` ruši svaku CLI naredbu neuhvaćenim `ZodError`                                                                                                                                                                                                        | `cb3681c` |
| `runtime-core-4`         | Greška      | nisko      | Snimka datotečnog sustava prekida cijelo snimanje kada se simbolička poveznica ili direktorij ukloni tijekom popisivanja                                                                                                                                                                 | `cb3681c` |
| `runtime-core-5`         | Greška      | nisko      | MCP doctor šalje signal goloj PID oznaci nakon što je SDK već očistio podređeni proces                                                                                                                                                                                                   | `e4477b5` |
| `runtime-core-7`         | Mrtvi kod   | nisko      | Provjera prekoračenja u grani očekivane veličine funkcije `readBoundedFileBytes` nikada ne može biti istinita                                                                                                                                                                            | `cb3681c` |
| `runtime-core-8`         | Mrtvi kod   | nisko      | `jsonFileError` sadrži nedostižan razlog `invalid-json` i nedostižnu granu za nedefinirani put                                                                                                                                                                                           | `cb3681c` |
| `runtime-core-9`         | Mrtvi kod   | nisko      | `defaultHopperLauncherPath` ima injektabilni parametar `executable` koji nijedan pozivatelj ne može postaviti                                                                                                                                                                            | `cb3681c` |
| `supply-chain-tooling-2` | Greška      | nisko      | Turbo ulazi za `test:run` i `docs:check:built` izostavljaju datoteke koje ti zadaci čitaju pa lokalne provjere ponavljaju zastarjele uspjehe                                                                                                                                             | `bd273bc` |
| `supply-chain-tooling-4` | Greška      | nisko      | Filtar putanja Docker workflowa ne obuhvaća datoteke o kojima ovisi izgradnja slike i nikad se ne pokreće na `main`                                                                                                                                                                      | `e3b007f` |
| `supply-chain-tooling-5` | Greška      | nisko      | `config:print` ispisuje nepinanu registraciju `rea-agents@latest`, što proturječi pinanom identitetu registracije                                                                                                                                                                        | `bd273bc` |
| `supply-chain-tooling-6` | Mrtvi kod   | nisko      | Nakon `semver.valid(v) === v` dodatne `includes` provjere znaka `+` u alatima za izdanja suvišne su                                                                                                                                                                                      | `bd273bc` |
| `web-javascript-4`       | Greška      | nisko      | `observe_web_session` završava nakon otprilike 1 ms kada je `observation_ms` jednak 2^31 ms ili veći                                                                                                                                                                                     | `cdac7c3` |
| `web-javascript-5`       | Greška      | nisko      | `wait_for_timeout` i `timeout_ms` koraka scenarija prekoračuju 32-bitne timere Playwrighta                                                                                                                                                                                               | `cdac7c3` |
| `web-javascript-6`       | Sigurnost   | nisko      | Snimanje mrežnih zaglavlja Playwrighta zadržava userinfo iz URL-a u vrijednostima zaglavlja `Location`, `Referer` i `Origin`                                                                                                                                                             | `625a826` |
| `web-javascript-8`       | Mrtvi kod   | nisko      | `WebSourceMapFetcher` sadrži neiskorišteni parametar `callerSignal` i suvišni omotač `signalIsAborted`                                                                                                                                                                                   | `cdac7c3` |

## Otvoreni nalazi s preporukom

Ovi su nalazi stvarni, ali svjesno nisu automatski ispravljeni. Trebaju odluku o
ugovoru ili dizajnu (na primjer nove oznake skraćivanja u Evidence), pristup
koji ovo okruženje nije imalo (SHA-ovi commitova za GitHub Actions, pravi Hopper
DMG) ili su samo vjerojatni i prvo trebaju mjerenje.

| ID                       | Vrsta       | Ozbiljnost | Status     | Nalaz                                                                                                                                                                                         | Preporuka                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-a-to-l-1`        | Sigurnost   | srednje    | potvrđeno  | Zaključivanje oblika JSON-a kopira cijelu putanju u svaki čvor pa troškovi i izlaz rastu kvadratno s dubinom `src/domain/jsonShape.ts:69`                                                     | Čvorove treba interno povezati roditeljskim referencama i vlastitim segmentima, a putanje graditi tek u završnom prolasku po preorderu. Proračun za segmente putanje izveden iz stvarnih ograničenja resursa mora djelovati prije alokacije i označiti oblik kao skraćen (aditivno polje sheme).                                                                  |
| `domain-a-to-l-4`        | Performanse | srednje    | potvrđeno  | `build_call_path` nabraja sve najkraće putanje bez ograničenja pa izlaz može rasti eksponencijalno `src/domain/callPath.ts:267`                                                               | Najkraće putanje treba točno prebrojati dinamičkim programiranjem nad `goalDistances` i nabrojati samo prvih N u kanonskom redoslijedu, uz `total_paths` i `paths_truncated` u rezultatu. To mijenja izlazni ugovor i kataloge, pa se ne smije automatski ispravljati.                                                                                            |
| `mobile-managed-misc-3`  | Performanse | srednje    | potvrđeno  | Čitač referentnog izvora drži cijele bajtove svake datoteke u memoriji bez proračuna po datoteci ili ukupno `src/reference/ReferenceSourceReaderFile.ts:195`                                  | Ovo je promjena dizajna: u `src/reference/ReferenceSourceReaderFile.ts` SHA-256 treba računati strujanjem, a bajtove zadržati samo za datoteke koje treba `parseReferenceSourceImports`, uz granicu po datoteci. Ukupni proračun u `processFileEntry` pri prekoračenju treba zabilježiti ograničenje i postaviti pokrivenost na `partial`.                        |
| `native-providers-1`     | Sigurnost   | srednje    | potvrđeno  | Duljina `read_bytes` nije ograničena ni na jednom koraku: Ghidra bridge gradi cijeli raspon u memoriji, a Node linijski međuspremnici nemaju granicu `bridge/ghidra/ReaGhidraBridge.java:600` | Ne treba uvoditi javno ugovorno ograničenje, nego u `GhidraResponseBuffer` i `HopperResponseStream` ograničiti duljinu fragmenta (izvedeno iz V8 granice za nizove) i prekoračenje prijaviti postojećim putem za protokolne pogreške. U `ReaGhidraBridge.readMemoryBytes` treba prije alokacije izračunati opseg i vratiti tipiziran `resource_constraint`.       |
| `supply-chain-tooling-1` | Sigurnost   | srednje    | potvrđeno  | Akcije trećih strana u release i deploy jobovima sa tajnama vezane su uz promjenjive oznake umjesto uz commitove `.github/workflows/release.yml:51`                                           | `googleapis/release-please-action@v4` u `.github/workflows/release.yml` (retci 51, 107, 229) i `cloudflare/wrangler-action@v4` u `website-pages.yml:117` treba vezati uz pune 40-znakovne SHA-ove commitova s komentarom verzije, kao u `real-termux.yml:41`. SHA-ovi moraju potjecati iz upstream oznaka.                                                        |
| `application-layer-1`    | Sigurnost   | nisko      | vjerojatno | Instalacija Hoppera na macOS-u vjeruje promjenjivim metapodacima proizvođača i nesidrenoj `codesign` provjeri te zatim automatski pokreće aplikaciju `src/application/MacHopper.ts:217`       | U `validBundle` u `src/application/MacHopper.ts` poziv `codesign` treba dobiti designated requirement s Team ID sidrom proizvođača, koji se prvo mora potvrditi na stvarnom DMG-u. Objavljeni tekst naredbe i referentne izlaze (goldens) za setup treba uskladiti.                                                                                               |
| `application-layer-3`    | Sigurnost   | nisko      | vjerojatno | `Info.plist` paketa aplikacije čita se bez ograničenja veličine i može biti simbolička poveznica izvan analiziranog paketa `src/application/AppBundleExecutable.ts:181`                       | U `resolveLayoutExecutable` u `src/application/AppBundleExecutable.ts` treba prije čitanja provjeriti veličinu, npr. preko `withRegularFile` iz `RegularFileRead.ts` s načinom `follow` za simboličke poveznice. Prevelike plistove odbija `BinaryTargetError`, a granica mora slijediti stvarno ograničenje.                                                     |
| `application-layer-5`    | Greška      | nisko      | vjerojatno | Instalacija Hoppera na Linuxu kao nuspojavu nadograđuje već instalirane zajedničke sistemske pakete `src/application/LinuxHopper.ts:329`                                                      | U `linuxPackageManagerCommands` u `src/application/LinuxHopper.ts` treba instalirati samo nedostajuće runtime ovisnosti, npr. s `apt-get install -y --no-upgrade` prije naredbe za sam paket ili prethodnim filtriranjem pomoću `dpkg-query -W`. Objavljeni tekst naredbi i testove treba uskladiti te provjeriti na stvarnim distribucijama.                     |
| `application-layer-6`    | Greška      | nisko      | vjerojatno | Atomarno objavljivanje bez prepisivanja zahtijeva tvrde poveznice i uvijek ne uspijeva na FAT/exFAT i mnogim SMB dijeljenjima `src/application/JsonFiles.ts:224`                              | U `publishFile` u `src/application/JsonFiles.ts` pri pogreškama `link()` s `EPERM`, `ENOTSUP`, `EOPNOTSUPP` ili `ENOSYS` (samo tim) treba prijeći na kopiranje bez prepisivanja pomoću `COPYFILE_EXCL`. Izostanak atomarnosti stvar je dizajnerske odluke i ne smije se automatski ispravljati.                                                                   |
| `native-providers-10`    | Mrtvi kod   | nisko      | potvrđeno  | `GhidraResponseBuffer` i `HopperResponseStream` dupliciraju istu NDJSON logiku fragmenata i razdvajanja redaka `src/ghidra/GhidraResponseBuffer.ts:17`                                        | Zajedno s ispravkom za `read_bytes` treba uvesti jedan ograničeni NDJSON razdvajač redaka pod `src/process/` (npr. `NdjsonLineBuffer.ts`). `GhidraResponseBuffer` se njime zamjenjuje, a `HopperResponseStream` delegira uokvirivanje njemu.                                                                                                                      |
| `native-providers-5`     | Performanse | nisko      | vjerojatno | IDA headless način pri svakoj operaciji dvaput iznova računa hash cijele privatne kopije ulaza `src/ida/IdaSessionClient.ts:371`                                                              | U `src/ida/IdaWorkspace.ts` nakon provjere digesta kopije treba zabilježiti stat identitet (`dev`, `ino`, `size`, `mtimeNs`, `ctimeNs`). `IdaSessionClient.#observe` tada ponovno računa hash samo ako se identitet razlikuje; zbog promjene semantike provjere identiteta potreban je pregled.                                                                   |
| `native-providers-6`     | Performanse | nisko      | vjerojatno | Razrješavanje procedura po imenu u Ghidra bridgeu pri svakom zahtjevu izvodi upit tablice simbola za svaku funkciju `bridge/ghidra/ReaGhidraBridge.java:1778`                                 | Treba ili izgraditi leno popunjavanu `Map<String, List<Function>>` svih jednostavnih i kvalificiranih imena uz `procedureInventory` i isprazniti je u `invalidateAnalysisCaches()`, ili koristiti `symbolTable.getSymbols(name)` s razrješavanjem imenskog prostora. Redoslijed pogrešaka višeznačnosti mora ostati isti.                                         |
| `native-providers-7`     | Sigurnost   | nisko      | potvrđeno  | Windows loopback TCP bridge prije autentifikacije prihvaća točno jednu vezu pa lokalni proces koji se prvi spoji može onemogućiti sesiju `bridge/ghidra/ReaGhidraBridge.java:291`             | U `serveLoopbackTcp`/`acceptClient` u `bridge/ghidra/ReaGhidraBridge.java` treba `server.accept()` pozivati u petlji, prvi zahtjev svake veze čitati uz ograničeno čekanje i zatvarati neautentificirane klijente. Vezu treba predati `serveClient` tek nakon valjanog tokena, a petlju ograničiti rokom pokretanja.                                              |
| `runtime-core-2`         | Performanse | nisko      | vjerojatno | `TerminalRenderer` za svaki PTY chunk serijalizira cijeli scrollback na glavnoj niti, čak i nakon što je proračun iscrpljen `src/process/capture/TerminalRenderer.ts:136`                     | U `#capture` u `src/process/capture/TerminalRenderer.ts` treba prvo izračunati jeftinu donju granicu te preskočiti `serialize()` samo kada ni ona ne stane u proračun. Semantika zadržavanja ostaje ista, a sama zastavica `#truncated` ne smije zaustaviti serijalizaciju.                                                                                       |
| `runtime-core-6`         | Mrtvi kod   | nisko      | potvrđeno  | Privremeni korijenski direktorij snimanja procesa stvara se i uklanja pri svakom snimanju, ali nikad nije izložen podređenom procesu `src/process/capture/ProcessCaptureLifecycle.ts:1475`    | Kao pregledanu promjenu ugovora treba odabrati jednog vlasnika: ili izložiti direktorij podređenom procesu preko `TMPDIR`/`TMP`/`TEMP` i dokumentirati ga u `docs/process-capture.md`, ili ukloniti `createTemporaryRoot` s čišćenjem i polja `temporary_root` te ponovno generirati kataloge.                                                                    |
| `web-javascript-3`       | Performanse | nisko      | vjerojatno | Babel parsira `sourcesContent` iz dohvaćenih source mapova u procesu domaćina bez ograničenja i bez mogućnosti prekida `src/browser/WebSourceMapFetcher.ts:708`                               | Ovo nije mali lokalni popravak: izdvajanje rubova modula i idealno `analyzeScript` treba premjestiti u vlastiti JavaScript analitički worker (`src/javascript/analysis/JavaScriptAnalysisWorker.ts`) s ograničenjem heapa, što zahtijeva arhitekturnu odluku. Ograničenje veličine po izvoru dopustivo je samo s dokumentiranom vrijednošću izvedenom iz resursa. |
| `web-javascript-7`       | Greška      | nisko      | vjerojatno | CDP i V8 zahtjevi za otkrivanje nemaju ni rok ni ograničenje veličine odgovora `src/browser/CdpEndpoint.ts:311`                                                                               | U `readCdpJson` treba pratiti kumulativnu duljinu chunkova. Pri prekoračenju `WEB_RUNTIME_LIMITS.protocolBytes` treba pozvati `request_.destroy()` i odbiti zahtjev s `BrowserObservationError` i kodom `invalid_endpoint_response`; rokovi ostaju nepromijenjeni.                                                                                                |

## Opovrgnuti nalazi

| ID                   | Nalaz                                                                                                                                                             | Zašto je opovrgnut                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `native-providers-3` | Ghidra pretraživanje regularnim izrazima nema vremensko ograničenje na jedinoj niti bridgea pa katastrofalni backtracking blokira sesiju dok se proces ne prekine | Dokumentirano ponašanje: prema `docs/ghidra-provider.md` Ghidra pretraga čeka odgovor ili prekid od strane pozivatelja.        |
| `web-javascript-2`   | Snimanje događaja Playwright scenarija zadržava konzolna, WebSocket i mrežna tijela poruka bez ikakvog ograničenja                                                | Dokumentirani ugovor: `docs/browser-scenario-contract.md` izričito navodi da događaji scenarija nemaju gornje granice broja.   |
| `domain-m-to-z-5`    | Isključivanje osjetljivih vrijednosti uspoređuje sirove literale s RFC 6901 escapiranim pokazivačima                                                              | Put je ranije blokiran: oba proizvođača odbacuju ključeve objekata s označenim vrijednostima prije nego što ispišu pokazivače. |

## Ostale promjene na ovoj grani

- **Jezici:** README i web-stranica dostupni su na engleskom (izvorni jezik),
  njemačkom i hrvatskom. Ostalih 17 prijevoda uklonjeno je. Hrvatski katalog
  web-stranice potpun je (1468 od 1468 tekstova) i, kao i njemački, označen je
  kao strojno potpomognuta osnova za pregled.
- **Poveznice:** Discord, X, Trendshift, Star-History, skills.sh i reklamne
  poveznice na rea.tools uklonjeni su iz README-a, bočne trake dokumentacije i
  web-stranice. README za upute upućuje na lokalnu dokumentaciju. Poveznice na
  alate koje REA treba (Ghidra, JADX i drugi) ostaju u tehničkoj dokumentaciji
  jer su potrebne za postavljanje.
- **Docker:** Dodane su datoteke `Dockerfile`, `compose.yaml`,
  `docker/entrypoint.sh` i `docker/smoke-test.mjs`. Image se izvodi kao
  neprivilegirani korisnik, a Ghidra 12.1.4 i OpenJDK 21 neobavezni su
  (`WITH_GHIDRA=1`) i provjeravaju se SHA-256 sažetkom. `compose.yaml` prema
  zadanim postavkama pokreće kontejner bez mreže i bez capabilityja. Upute:
  [Docker i VS Code](../docker-vscode.md).
- **VS Code:** MCP poslužitelj registrira se putem `.vscode/mcp.json` (lokalno
  ili preko Dockera), a Dev Container nalazi se u `.devcontainer/`.
- **Vlastiti promptovi:** `REA_PROMPTS_DIR` učitava Markdown promptove s YAML
  front matterom kao dodatne MCP promptove za svakog klijenta koji podržava
  promptove. Format: [vlastiti promptovi](../mcp-prompts.md#custom-prompts).
- **Konfiguracija:** [Referenca za konfiguraciju](../configuration.md) sadrži sve
  varijable okoline koje postavlja korisnik, s dopuštenim vrijednostima,
  zadanim vrijednostima i izvornim datotekama.
- **Odgovorna upotreba:** Odjeljak u README-u zamjenjuje odricanje od
  odgovornosti i objašnjava da REA nije sandbox. Riječ je isključivo o
  dokumentaciji i ne ograničava nijednu funkciju.

## Provjera

Na konačnom stanju ove grane pokrenuto je sljedeće, svaki put bez grešaka:

| Provjera                                                                                                             | Rezultat                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run check` (provjera tipova, lint, format, knip, metapodaci, arhitekturni čuvari)                               | prošlo                                                                       |
| `npm run test:fast` (Domain, Services, Adapter, Composition, Conformance, Evaluation)                                | 384 datoteke, 4427 testova prošlo, 6 preskočeno                              |
| `npm run test:boundary` (Boundary, procesi, MCP, globalni procesi)                                                   | 404 datoteke, 3204 testa prošla, 119 preskočeno                              |
| `npm run test:acceptance`                                                                                            | 34 datoteke, 193 testa prošla, 3 preskočena                                  |
| `npm run docs:check` i `npm run docs:build` (činjenice dokumentacije, mrtve poveznice)                               | prošlo, nakon ispravka već ranije mrtve poveznice u `docs/wasm-artifacts.md` |
| `python3 scripts/website.py check` i stroga provjera kataloga za `de` i `hr`                                         | prošlo                                                                       |
| Docker: runtime image, Dev Container faza, Ghidra putanja s testnom arhivom, odbijanje pogrešnog sažetka, strani UID | prošlo                                                                       |
| `node docker/smoke-test.mjs` (MCP preko stdio bez mreže i bez capabilityja)                                          | 171 alat, analiza vraća Evidence                                             |

Preskočeni testovi trebaju alate ili platforme kojih ovdje nema. Izričito
**nije** provjereno: stvarno preuzimanje Ghidre u Docker buildu (preuzimanja s
GitHuba blokirana su u ovom okruženju; SHA-256 vrijednost potječe sa stranice
izdanja), stvarni provideri (Ghidra, Hopper, IDA, JEB, mitmdump, adb s
uređajem), macOS i Windows te odjek Windows ConPTY-ja za zacrnjivanje odjeka.
Prijevod web-stranice strojno je potpomognut i čeka ljudski pregled.

## Odluke za tebe

1. **Identitet forka.** Naziv paketa `rea-agents`, `mcpName`
   `io.github.morluto/rea`, URL-ovi repozitorija u `package.json` i
   `server.json` te `REPOSITORY="morluto/rea"` u `install.sh` upućuju na
   original. Dok je tako, `rea update` instalira upstream verziju s npm-a preko
   tvog builda. Za vlastitu distribuciju trebaš vlastiti naziv paketa i unos u
   registru.
2. **Domena web-stranice.** Alati web-stranice generiraju kanonske URL-ove i
   sitemap za `https://rea.tools` (`SITE_ORIGIN` u `scripts/website.py`). Za
   vlastiti hosting mijenjaš tu vrijednost i provjere u
   `scripts/verify-website.py`.
3. **Fiksiranje release akcija.** `googleapis/release-please-action@v4` i
   `cloudflare/wrangler-action@v4` izvode se u jobovima s tajnama na
   promjenjivim tagovima. Trebalo bi ih fiksirati na pune commit SHA-ove.
4. **Ograničenja resursa uz promjenu ugovora.** `read_bytes`, inferencija JSON
   shapeova i `build_call_path` trebaju gornje granice s vidljivom oznakom
   skraćivanja u Evidence. To mijenja javne sheme i generirani katalog, pa o
   tome treba odlučiti svjesno.
5. **Preuzimanje Hoppera.** Fiksni prekid nakon 120 sekundi zamijenjen je
   timeoutom zbog zastoja. Poslužitelj koji šalje izuzetno sporo, ali ravnomjerno,
   sada je ograničen samo granicom od 100 MB i ručnim prekidom. Ako dodatno
   želiš ukupnu granicu, to je jedan redak koda.
