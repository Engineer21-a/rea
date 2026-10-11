<div align="center">

[English](README.md) · [Deutsch](README_de.md) · **Hrvatski**

# REA: Obrnuti inženjering bilo čega

### Jedan MCP za obrnuti inženjering binarnih datoteka, aplikacija i ponašanja tijekom izvođenja.

**Vidiš značajku koja ti se sviđa? Shvati kako radi, sve do binarne razine.**

[![MCP tool catalog](https://img.shields.io/badge/MCP-tool_catalog-5c4ee5?style=flat-square)](docs/mcp-contracts.md#generated-catalog)
[![Node.js requirements](https://img.shields.io/badge/Node.js-requirements-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#što-možeš-analizirati)
[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)

[Brzi početak](#brzi-početak) · [Docker i VS Code](#docker-i-vs-code) · [Kako REA radi](#kako-rea-radi) · [Što možeš analizirati](#što-možeš-analizirati) · [Studije slučaja](#studije-slučaja) · [Česta pitanja](#česta-pitanja) · [Dokumentacija](#dokumentacija)

<code>npx rea-agents setup</code>

<br />

<img src="docs/assets/rea-hopper-analysis.png" alt="REA pokreće svoj most za analizu unutar Hoppera dok pregledava nativnu binarnu datoteku" width="1200" />

<br />

</div>

---

Vidiš u nekoj aplikaciji značajku koju želiš imati u vlastitom proizvodu? Zamoli svog agenta da je istraži pomoću alata REA. Agent može pregledati aplikaciju bez njezina izvornog koda, objasniti kako značajka radi, pokazati dokaze i izraditi vlastitu verziju za tvoj projekt.

REA povezuje tvog agenta s alatima za pregled nativnih binarnih datoteka, JavaScript i Electron aplikacija, .NET sklopova (assemblies) i web-mjesta. Iste alate možeš koristiti i iz terminala. Analiza se izvodi lokalno, a rezultati uključuju dokaze i ograničenja na kojima se temelji svaki zaključak.

Postavljanje registrira alat REA u tvom agentu i instalira odgovarajuće upute za tijek rada. Nativna analiza može koristiti postojeću instalaciju Hoppera, Ghidre ili IDA-e. Uz tvoje odobrenje postavljanje može instalirati i Hopper. Statička analiza JavaScripta ne treba nativni alat za analizu.

## Brzi početak

### Postavi svog agenta

Kad su Node.js i npm instalirani, pokreni ovu naredbu:

```bash
npx rea-agents setup
```

Odaberi svoje agente, pregledaj predložene promjene i odobri ih. Postavljanje dodaje MCP poslužitelj alata REA i odgovarajuće upute za tijek rada te izrađuje sigurnosne kopije postojeće konfiguracije. Nakon toga ponovno pokreni svog agenta.

Postavljanje podržava Claude Code, Codex, Cursor, Gemini CLI, Grok Build i [druge agente](docs/installation.md#supported-agents). Konfiguraciju pružatelja analize i ručnu registraciju MCP-a opisuje vodič [Instalacija i postavljanje](docs/installation.md).

### Pitaj svog agenta

```text
Istraži kako radi pretraživanje u aplikaciji Notes, pokaži mi dokaze i izradi
sličnu značajku za moj projekt.
```

Umjesto aplikacije Notes navedi svoju ciljnu aplikaciju, a umjesto pretraživanja značajku koju želiš razumjeti.

### Koristi terminal

Pregledaj raspakirani direktorij JavaScript/Electron aplikacije ili ASAR datoteku:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

Rezultat uključuje module, importe, granice Electrona i pripadajuće dokaze. Zamijeni putanju svojim ciljem, primjerice s `"D:/apps/example"` na sustavu Windows.

Za redovito korištenje instaliraj naredbu `rea`:

```bash
npm install --global rea-agents
rea --help
```

Za nativnu analizu najprije konfiguriraj pružatelja. Nativne naredbe, odabir pružatelja, snimke stanja (snapshots) i skriptiranje opisuje [vodič za CLI i Evidence](docs/cli.md).

### Ažuriraj REA

REA se brzo razvija, a nova izdanja često donose ispravke pogrešaka. Održavaj svoju instalaciju ažurnom.

Za CLI instaliran naredbom `npm install --global` ili `bun add --global`:

```bash
rea update
```

Globalna ažuriranja putem Buna zahtijevaju Bun 1.2.17 ili noviji. Sa starijim izdanjem Buna najprije ručno nadogradi Bun, a zatim pokreni `rea update`.

Za osvježavanje registracija agenata i vještine (skill) pokreni naredbu za postavljanje koju ispiše ažuriranje.

Ako koristiš `npx`, ažuriraj postavljanje agenta ovom naredbom:

```bash
npx rea-agents@latest setup
```

Pregledaj promjene postavljanja i ponovno pokreni svog agenta. Za jednokratne CLI naredbe koristi `npx rea-agents@latest`, a iza toga navedi naredbu. S Bunom koristi `bunx rea-agents@latest` umjesto `npx rea-agents@latest`.

`rea update` i `npx rea-agents@latest` instaliraju izdanje paketa `rea-agents` iz npm registra. Ako koristiš prilagođenu izgradnju (build) ovog repozitorija, ažuriraj je ponovnom izgradnjom iz izvornog koda ili ponovnom izgradnjom Docker slike. U suprotnom će izdanje iz registra zamijeniti tvoju izgradnju.

## Docker i VS Code

Izgradi sliku spremnika iz ovog repozitorija. `WITH_GHIDRA=1` dodaje JDK 21 i izdanje Ghidre s provjerenim kontrolnim zbrojem za nativnu analizu bez grafičkog sučelja (headless):

```bash
docker build -t rea:ghidra --build-arg WITH_GHIDRA=1 .
```

Pokreni MCP poslužitelj preko stdio. Montiraj direktorij sa svojim ciljevima na istu apsolutnu putanju kako bi se putanje u pozivima alata i u Evidence podudarale na obje strane:

```bash
docker run -i --rm -v "$PWD:$PWD" -w "$PWD" rea:ghidra mcp
```

[Vodič za Docker i VS Code](docs/docker-vscode.md) objašnjava kako registrirati ovaj spremnik u VS Codeu i otvoriti repozitorij u razvojnom spremniku (dev container) te navodi sve argumente izgradnje. [Referenca konfiguracije](docs/configuration.md) navodi varijable okruženja koje možeš proslijediti opcijom `-e`.

## Kako REA radi

Tvoj agent poziva REA putem MCP-a kako bi pregledao cilj i pratio relevantni kod. REA vraća nalaze zajedno s njihovim dokazima. Agent ih koristi za dodatna pitanja, za objašnjenje ponašanja ili za pisanje i testiranje implementacije. CLI naredbe koriste iste tijekove rada.

![Tijek istraživanja s alatom REA: tvoj agent pita o lokalnom cilju, REA ga pregledava i prati pomoću alata za analizu, a agent koristi vraćeni kod, reference i nepoznanice za objašnjenje, implementaciju i testiranje.](website/public/assets/figures/rea-investigation-flow.svg)

[Otvori sliku u punoj veličini](website/public/assets/figures/rea-investigation-flow.svg).

<a id="current-status"></a>

## Što možeš analizirati

REA zahtijeva Node.js 22.x (>=22.19), 24.x (>=24.11) ili 26+ te npm. Dodatni alati i podržani host sustavi ovise o cilju:

| Cilj                          | Što REA vraća                                                                                           | Zahtjevi i vodič                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Nativne binarne datoteke      | Pseudokod, asemblerski kod, nizovi znakova, simboli, pozivi i reference                                 | Hopper, Ghidra ili IDA; [nativno istraživanje](docs/native-investigation.md)                                                          |
| Izvanmrežna ELF struktura     | Sekcije, segmenti, originalni simboli/relokacije i kandidati za zaštitne mjere iz statičke analize      | pwntools koji osigurava pozivatelj, na Linuxu x64; [binarna dijagnostika](docs/binary-diagnostics.md)                                 |
| WASM artefakt                 | Validacija, sekcije, točni WAT oblici importa/eksporta i dekodirani WAT                                 | WABT 1.0.42 koji osigurava pozivatelj; `inspect_wasm_artifact`                                                                        |
| EVM bajtni kod                | Selektori za dispatch, pomaci u bajtovima, zaključeni argumenti i promjenjivost stanja                  | Lokalni ulaz sa sirovim ili heksadecimalnim podacima na Linuxu x64; [vodič za izvanmrežni EVM](docs/evm-bytecode.md)                  |
| Zabilježena rušenja na Linuxu | Sirove bilješke (notes), registri i signali svake zabilježene niti te neobavezni kandidati za mapiranje | pwntools koji osigurava pozivatelj, na Linuxu x64; po želji GDB/pwndbg; [zabilježena rušenja](docs/recorded-crashes.md)               |
| JavaScript / Electron         | Moduli, importi, source mape, rute, IPC i veze s nativnim dodacima (add-ons)                            | Node.js i npm; [analiza aplikacija](docs/javascript-application-workflows.md)                                                         |
| Web-mjesta                    | Struktura stranice, skripte, mrežna opažanja i zatražene snimke zaslona                                 | Preglednik iz obitelji Chrome; [analiza u pregledniku](docs/browser-observation.md)                                                   |
| Spremljene mrežne snimke      | Zahtjevi, odgovori, izloženi sadržaji (payloads) i lokacije u izvornom kodu                             | HAR; mitmdump na Linuxu za snimke u izvornom mitmproxy formatu; [vodič za mrežne snimke](docs/web-network-captures.md)                |
| .NET sklopovi                 | Metapodaci, CIL instrukcije, deklarirane nativne ovisnosti i usporedbe izgradnji                        | Ništa (samo statički); [vodič za upravljani kod](docs/managed-code-analysis.md)                                                       |
| Android APK-ovi               | Deklaracije manifesta, klase, dekompilirane metode i reference                                          | JADX bez grafičkog sučelja i potpuni JDK na Linuxu/macOS-u/Windowsima x64; [vodič za Android](docs/android-analysis.md)               |
| Android uređaji               | Uređaji, paketi, procesi, zapisnici, ispisi (dumps), snimke zaslona te prijenosi APK-ova i datoteka     | adb koji osigurava pozivatelj (emulator ili hardver); [vodič za ADB](docs/adb-device-analysis.md)                                     |
| JEB projekti                  | Projektne jedinice iz JEB enginea, hash sažeci artefakata i pseudokod tipova/metoda                     | JEB klijent koji pokreće pozivatelj i koji poslužuje MCP, odabran varijablom REA_JEB_MCP_URL; [vodič za JEB](docs/jeb-analysis.md)    |
| Android resursi               | Dekodirani manifest, tablice nizova znakova, lokaliteti i podaci o verziji                              | Pokretač za Apktool koji osigurava pozivatelj; [vodič za resurse](docs/apktool-resource-analysis.md)                                  |
| Firmver                       | Regije, rezultati raspakiravanja i predaje nativnoj analizi                                             | Binwalk / Unblob na Linuxu; [vodič za firmver](docs/firmware-analysis.md)                                                             |
| Paketi i resursi              | Popisi datoteka, hash sažeci, plist datoteke, anatomija Apple paketa (bundle) i izdvojeni resursi       | [Vodič za artefakte i JavaScript](docs/javascript-artifact-reconstruction.md), [Apple aplikacije](docs/apple-application-analysis.md) |
| Ponašanje procesa             | Izlaz terminala, interakcije, opažanja završetka procesa i datotečnog sustava te usporedbe pokretanja   | Linux/macOS s nativnim PTY-jem; [snimanje procesa](docs/process-capture.md)                                                           |

Statička inspekcija JavaScripta i .NET-a čita dostavljene datoteke bez pokretanja aplikacije. Snimanje tijekom izvođenja pokreće odabrani cilj ili s njim komunicira s tvojim korisničkim dopuštenjima. Svaki vodič za izvođenje opisuje svoje učinke.

<a id="choosing-a-deep-analysis-provider"></a>

Nativni formati i podržani host sustavi razlikuju se od pružatelja do pružatelja. Pogledaj [postavljanje Hoppera i Ghidre](docs/installation.md#hopper), [vodič za IDA-u](docs/ida-provider.md) i [eksperimentalnu podršku za Ghidru na Windowsima](docs/windows-ghidra-p0.md). Ghidra podržava i [analizu 16-bitnog DOS-a](docs/ghidra-dos.md). Za velike binarne datoteke povećaj Ghidrin rok za pokretanje varijablom `REA_GHIDRA_STARTUP_TIMEOUT_MS`. Odabir pružatelja opisuje [vodič za CLI](docs/cli.md#choose-a-provider). Provjeri [dostupnost u izdanjima](docs/installation.md#released-package-and-main) za značajke dodane nakon posljednjeg izdanja na npm-u.

## Studije slučaja

![Ilustracije studija slučaja: panoramiranje zvuka u igri DX-Ball, most međuspremnika u Notionu i prsten metaka u igri TH04](docs/assets/rea-showcases.png)

### DX-Ball: rekonstruiraj izračun panoramiranja zvuka

Prati poziv zvuka do pomoćne funkcije koja poziciju pretvara u vrijednost panoramiranja, pregledaj instrukcije i pretvori nepotpuni pseudokod u C. Rekonstrukcija prolazi 3.205 testnih slučajeva s originalnim x86 kodom i reproducira svih 63 bajta kompilirane funkcije.

### Notion: prati Electronov most međuspremnika

Pronađi API međuspremnika u procesu renderera, prati ga kroz preload i IPC do glavnog procesa te pregledaj format bogatog sadržaja u međuspremniku.

### TH04: oporavi izračun prstena metaka u DOS-u

Pregledaj 16-bitne instrukcije originalne igre za PC-98, oporavi izračune fiksnih i ciljanih kutova te usporedi rekonstruirani C++ kod s izlazom povijesnog prevoditelja.

Potpune studije slučaja isporučuju se s lokalnim izvorima web-mjesta u `website/public/showcase/`. Pregledaj ih izvanmrežno naredbom `python3 scripts/website.py serve` (pogledaj [website/README.md](website/README.md)).

## Česta pitanja

<details>
<summary><strong>Koji agenti mogu koristiti REA?</strong></summary>

Može ga koristiti svaki agent koji podržava lokalne MCP poslužitelje. Postavljanje konfigurira [podržane agente](docs/installation.md#supported-agents), a ostali klijenti mogu koristiti [ručnu registraciju MCP-a](docs/installation.md#mcp-registry).

</details>

<details>
<summary><strong>Trebam li Hopper, Ghidru ili IDA-u?</strong></summary>

Dubinska nativna analiza koristi jedan od njih. Statička inspekcija JavaScripta i .NET-a radi bez nativnog alata za analizu. Postavljanje može instalirati Hopper nakon tvog odobrenja, a Ghidra i IDA koriste tvoje postojeće instalacije. Pogledaj [postavljanje pružatelja](docs/installation.md#hopper).

</details>

<details>
<summary><strong>Moram li najprije pokrenuti Hopper?</strong></summary>

REA pokreće Hopper kad ga neka operacija treba. Na macOS-u te dijaloški okvir pri prvom pokretanju može pitati da odabereš demo način rada ili aktiviraš svoju licenciju. Pogledaj [pokretanje Hoppera i rješavanje problema](docs/installation.md#launcher-paths-and-troubleshooting).

</details>

<details>
<summary><strong>Mogu li pokretati REA u Dockeru ili iz VS Codea?</strong></summary>

Da. [Vodič za Docker i VS Code](docs/docker-vscode.md) pokazuje kako izgraditi sliku s neobaveznom Ghidrom i JDK-om, registrirati spremnik kao MCP poslužitelj u VS Codeu i otvoriti repozitorij u razvojnom spremniku.

</details>

<details>
<summary><strong>Kakav kod vraća REA?</strong></summary>

Nativna analiza vraća pseudokod i asemblerski kod. Analiza JavaScripta/Electrona oporavlja module i njihove međusobne veze. Tvoj agent koristi te nalaze za pisanje i testiranje implementacije, a [studije slučaja](#studije-slučaja) daju razrađene primjere.

</details>

<details>
<summary><strong>Prenosi li REA moju aplikaciju na neki poslužitelj?</strong></summary>

REA analizira ciljeve lokalno. Tvoj agent prima rezultate alata, a njegov pružatelj modela ima vlastita pravila o podacima.

</details>

<details>
<summary><strong>Što trebam učiniti ako naiđem na pogrešku?</strong></summary>

Najprije ažuriraj instalaciju, jer je novije izdanje možda već ispravilo pogrešku.

Za CLI instaliran naredbom `npm install --global` ili `bun add --global`:

```bash
rea update
```

Za postavljanje agenta putem naredbe `npx`:

```bash
npx rea-agents@latest setup
```

Ako koristiš agenta, dovrši [osvježavanje postavljanja](#ažuriraj-rea) i ponovno ga pokreni. Ponovi isti zadatak. Ako problem i dalje postoji, otvori issue u ovom repozitoriju i navedi verziju alata REA, vrstu cilja, korake za reprodukciju i ispis pogreške.

</details>

## Dokumentacija

Započni s [indeksom dokumentacije](docs/index.md). Točne opcije, preduvjete i ugovore o rezultatima pronaći ćeš ovdje:

- [Instalacija i postavljanje](docs/installation.md): registracija agenata, konfiguracija pružatelja, ažuriranja i deinstalacija.
- [Docker i VS Code](docs/docker-vscode.md): slika spremnika, registracija MCP-a u VS Codeu i razvojni spremnik.
- [Referenca konfiguracije](docs/configuration.md): sve korisničke varijable okruženja u jednoj tablici.
- [Spremnost i rješavanje problema](docs/installation.md#check-readiness-for-your-task): dijagnoza pojedinog agenta ili alata za analizu.
- [CLI i Evidence](docs/cli.md): naredbe, odabir pružatelja, snimke stanja, uvoz/izvoz i izlazni statusi.
- [MCP ugovori](docs/mcp-contracts.md) i [upute za agente](docs/mcp-prompts.md): rezultati alata, sesije i vođena istraživanja.
- [Katalog alata](docs/mcp-contracts.md#generated-catalog): generirani popis alata, pružatelja i CLI naredbi.
- [Plan razvoja](docs/roadmap.md): planirani rad i praćenje mogućnosti.
- Revizija, listopad 2026 ([Deutsch](docs/audit/audit-2026-10_de.md), [Hrvatski](docs/audit/audit-2026-10_hr.md)): nalazi o performansama, sigurnosti, greškama i mrtvom kodu.

Ranjivosti prijavi prema uputama u [SECURITY.md](SECURITY.md).

## Odgovorno korištenje

REA pruža alate za zakonito istraživanje, analizu i rekonstrukciju u području obrnutog inženjeringa. Na tebi je odgovornost da pribaviš sva potrebna odobrenja i poštuješ mjerodavne zakone, licencije i uvjete korištenja. Projekt ne podržava nezakonito ni neovlašteno korištenje.

- Analiziraj samo ciljeve koji su tvoji ili za koje imaš izričito dopuštenje za ispitivanje. Zapis o tom dopuštenju čuvaj zajedno sa svojim dokazima.
- Nepoznate binarne datoteke, arhive, stranice i snimke smatraj zlonamjernima. REA nije sandbox: pružatelji parsiraju ciljeve s dopuštenjima tvog korisnika, a Docker slika izolira datotečni sustav, ali ni ona nije sandbox za zlonamjerni softver. Za sumnjive uzorke koristi jednokratni virtualni stroj bez vjerodajnica.
- Evidence čuvaj lokalno. Paketi (bundles) mogu sadržavati putanje, nizove znakova, URL-ove i snimljene mrežne podatke iz cilja, pa ih pregledaj prije nego što ih podijeliš.
- Snimanje tijekom izvođenja pokreće cilj ili upravlja njime. Koristi ga samo ondje gdje je pokretanje tog cilja prihvatljivo.

REA je softverski projekt otvorenog koda. Nismo izdali niti podržali nikakvu kriptovalutu ni token. Tokeni koji koriste ime REA nisu povezani s projektom.

## Doprinos projektu

Za prijavu pogreške ili prijedlog značajke otvori issue u ovom repozitoriju. Za poboljšanje koda ili dokumentacije pošalji pull request.

Postavljanje razvojnog okruženja i provjere opisuje [CONTRIBUTING.md](CONTRIBUTING.md), razine provjere opisuje vodič za [testiranje](docs/testing.md), a strukturu projekta prikazuje [karta arhitekture](docs/architecture.mermaid).

## Licencija

[MIT](LICENSE)
