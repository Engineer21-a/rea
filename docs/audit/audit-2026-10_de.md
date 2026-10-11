# REA-Audit Oktober 2026

Stand: 11.10.2026. Geprüft wurde `rea-agents` 6.4.0 (Commit `ffaf2c1`); alle
Änderungen liegen auf dem Branch `ccr-8e3a09ec-u55qv0`.
[Hrvatska verzija](audit-2026-10_hr.md)

## TL;DR

Der Audit hat in 9 Bereichen 74 Befundkandidaten gefunden. Nach adversarialer Gegenprüfung sind 71 echt und 3 widerlegt; 54 davon sind mit Regressionstests behoben und auf `ccr-8e3a09ec-u55qv0` gepusht, darunter der einzige Befund mit hoher Schwere: Als sensibel markierte PTY-Eingaben landeten über das Terminal-Echo im Klartext in der Evidence. Offen bleiben 17 Befunde (5 mittel, 12 niedrig), weil sie eine Vertrags- oder Designentscheidung brauchen; die wichtigsten sind fehlende Ressourcengrenzen bei `read_bytes`, der JSON-Shape-Inferenz und `build_call_path` sowie Release-Actions auf veränderlichen Tags. Keine Analysefunktion wurde entfernt oder eingeschränkt, entfernt wurde nur Code ohne produktiven Verwender (netto rund 1.600 Zeilen samt der Tests, die nur diesen Code abdeckten). Neu sind ein getestetes Docker-Image mit optionalem Ghidra, VS-Code- und Dev-Container-Einrichtung, eigene MCP-Prompts über `REA_PROMPTS_DIR`, eine Konfigurationsreferenz sowie README und Website auf Englisch, Deutsch und Kroatisch.

## Umfang und Methode

Der Audit deckt den gesamten Produktcode in neun Bereichen ab und prüft jeden
Bereich auf vier Dimensionen: Performance, Sicherheit, Fehler und toten Code.

| Bereich                | Umfang                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `runtime-core`         | Prozessüberwachung, PTY-Erfassung, Konfiguration, Einstiegspunkte, Windows-Hilfen               |
| `mcp-cli-adapters`     | MCP-Server, CLI, öffentliche Verträge                                                           |
| `native-providers`     | Ghidra, Hopper, IDA, native Parser und ihre Java-, Python- und Swift-Brücken                    |
| `web-javascript`       | Browser- und Electron-Beobachtung, JavaScript-Analyse, mitmproxy                                |
| `mobile-managed-misc`  | ADB, Android, Apktool, JEB, .NET, Firmware, EVM, WASM, Referenzquellen, Artefakte, pwntools     |
| `application-layer`    | Einrichtung, Hopper-Installation, Doctor, Evidence-Bündel, gemeinsame Workflows                 |
| `domain-a-to-l`        | Reine Parser und Evidence-Modelle in `src/domain/` (Dateinamen A bis L)                         |
| `domain-m-to-z`        | Reine Parser und Evidence-Modelle in `src/domain/` (Dateinamen M bis Z)                         |
| `supply-chain-tooling` | `install.sh`, CI-Workflows, Release-Skripte, Turbo, die neuen Docker- und Dev-Container-Dateien |

Jeder Befund durchlief vier Stufen:

1. Ein Prüfer pro Bereich hat nur lesend gearbeitet und jeden Befund mit Datei,
   Zeile, Fehlerszenario und Beleg festgehalten.
2. Ein zweiter, unabhängiger Prüfer hat versucht, jeden Befund zu widerlegen:
   Er hat Aufrufer, vorhandene Schutzmechanismen, Tests und die Regeln in
   `AGENTS.md` geprüft. Unentscheidbare Fälle gelten als „plausibel“.
3. Nur bestätigte oder plausible Befunde mit kleinem, lokalem Fix wurden
   behoben, jeweils mit Regressionstest. Fixes, die öffentliche Verträge,
   Evidence-Felder oder Schemas ändern würden, blieben offen.
4. Weitere Prüfer haben jeden Fix-Satz auf Regressionen untersucht. Sie haben
   drei Fehler in den Fixes selbst gefunden, die sofort behoben wurden: eine
   Zeitmessung über die Wanduhr statt monoton, eine falsche Reihenfolge
   zurückgehaltener Terminalausgabe und fehlende Turbo-Cache-Eingaben. Eine
   vierte Schwäche aus diesen Reviews, die Überschwärzung kurzer sensibler
   Eingaben, ist ebenfalls behoben: Jede sensible Eingabe schwärzt jetzt genau
   ihr eigenes Echo.

Ausgangslage vor dem Audit: `tsc --noEmit` war fehlerfrei, `npm audit` meldete
0 Schwachstellen, knip meldete nur den ungebauten Worker-Import, oxlint nur
Warnungen (überwiegend in Verifikationsskripten), und jscpd fand 2,5 %
duplizierte Zeilen.

## Gesamtbild

Der Code ist insgesamt in gutem Zustand. Die Prüfer haben die Kernmechanismen
ausdrücklich als solide bewertet: Brücken-Tokens werden in konstanter Zeit
verglichen, Unix-Sockets liegen in privaten Laufzeitverzeichnissen,
`SafeOutputTree` blockiert Zip-Slip und Symlink-Angriffe, Konfigurationsdateien
werden mit Backup, atomarem Schreiben und Rücklesen geändert, und
`install.sh` prüft exakte Versionen. Die Befunde sitzen fast alle an den
Rändern: bei Eingaben, die ein analysiertes Ziel kontrolliert (Binärdateien,
Bundles, Webseiten, Geräte), und an externen Grenzen (Downloads, Timer,
Dateisysteme).

| Bereich                | Einschätzung                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-core`         | Solide Prozessbereinigung und Pfadvalidierung. Wichtigster Fehler: sensible PTY-Eingaben im Terminal-Echo (behoben).                                              |
| `mcp-cli-adapters`     | Gut. Antwortbudgets werden vor der Allokation berechnet. Fehler bei `.app/`-Routing und unnötigen Ledger-Kopien (behoben).                                        |
| `native-providers`     | Größtenteils solide. Offene Risiken sind fehlende Obergrenzen (`read_bytes`, NDJSON-Zeilen). Quadratische otool-Regexes sind behoben.                             |
| `web-javascript`       | CDP-Pfade gut budgetiert. mitmproxy behielt Proxy-Passwörter, lange Timer liefen über (behoben). Szenario-Erfassung ohne Obergrenzen ist dokumentierte Absicht.   |
| `mobile-managed-misc`  | Gut. Gerätegemeldete ADB-Pfade und quadratische Ausgabeschreibung sind behoben. Referenzquellen ohne Speicherbudget bleiben offen.                                |
| `application-layer`    | Solide Transaktionen. Schwächen an externen Grenzen: Hopper-Download, Signaturprüfung unter macOS, `Info.plist` ohne Größengrenze.                                |
| `domain-a-to-l`        | Grenzen werden meist geprüft. Superlineare Algorithmen bei JSON-Shapes, Vite-Tabellen und Call-Paths. Rund 1.000 Zeilen Code ohne produktiven Verwender entfernt. |
| `domain-m-to-z`        | Native Parser vorbildlich budgetiert. Quadratische NativeAOT- und Plist-Pfade, ein Importfehler bei leerem Modulnamen und überholter Code.                        |
| `supply-chain-tooling` | Installer und Release-Workflow gut. Mutable Action-Tags in Jobs mit Secrets, unvollständige Turbo-Eingaben und Lücken im neuen Docker-Setup.                      |

## Ergebnis in Zahlen

| Art         | Gültige Befunde | Behoben | Offen |
| ----------- | --------------- | ------- | ----- |
| Sicherheit  | 16              | 10      | 6     |
| Fehler      | 24              | 21      | 3     |
| Performance | 11              | 5       | 6     |
| Toter Code  | 20              | 18      | 2     |
| **Summe**   | 71              | 54      | 17    |

Nach Schwere (gültige Befunde): 0 kritisch, 1 hoch, 17 mittel, 53 niedrig. Widerlegt: 3.

## Behobene Befunde

Alle Fixes haben Regressionstests oder entfernen nachweislich unerreichbaren
Code. Die Spalte „Commit“ verweist auf den Commit auf diesem Branch.

| ID                       | Art         | Schwere | Befund                                                                                                                                                                                                                                                                          | Commit    |
| ------------------------ | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `runtime-core-1`         | Sicherheit  | hoch    | Sensible skriptgesteuerte Eingaben werden durch das PTY-Echo unverändert in Terminal-Frames gespeichert, obwohl Schwärzung zugesichert ist                                                                                                                                      | `cb3681c` |
| `application-layer-2`    | Fehler      | mittel  | Der Hopper-Download bricht nach einer festen Wanduhrfrist von 120 s ab, auch wenn der Body noch gestreamt wird                                                                                                                                                                  | `6286083` |
| `domain-a-to-l-2`        | Sicherheit  | mittel  | Ein Regex mit Backtracking (ReDoS) scannt bei jedem Aufruf von `__vite__mapDeps` die gesamte Datei erneut                                                                                                                                                                       | `625a826` |
| `domain-m-to-z-1`        | Performance | mittel  | Der Vererbungsabschluss der NativeAOT-MethodTables ist quadratisch und verbraucht das Parser-Arbeitsbudget bei etwa 2000 Tabellen                                                                                                                                               | `8813d85` |
| `domain-m-to-z-2`        | Sicherheit  | mittel  | Der Regex für den Schlüssel-Vorabscan in XML-Plists ist bei nicht terminierten Kommentar- oder CDATA-Öffnern quadratisch                                                                                                                                                        | `f3fa121` |
| `domain-m-to-z-3`        | Fehler      | mittel  | Ein leerer Modulspezifizierer lässt den gesamten Importgraphen der Referenzquellen fehlschlagen                                                                                                                                                                                 | `f3fa121` |
| `mcp-cli-adapters-1`     | Fehler      | mittel  | `rea analyze Foo.app/` mit abschließendem Schrägstrich wird an die JavaScript-Anwendungsanalyse statt an die native Binärübersicht geleitet                                                                                                                                     | `a3fecb5` |
| `mcp-cli-adapters-2`     | Performance | mittel  | Untersuchungswerkzeuge klonen bei jedem Aufruf das gesamte Evidence-Ledger per `structuredClone`, nur um `evidence_links` zu verfolgen                                                                                                                                          | `a3fecb5` |
| `mobile-managed-misc-1`  | Performance | mittel  | `SafeOutputTree` liest bei jedem Schreibvorgang das Verzeichnislisting des Elternverzeichnisses für jeden vorhandenen Vorfahren erneut                                                                                                                                          | `1aed333` |
| `mobile-managed-misc-2`  | Sicherheit  | mittel  | `pull_adb_package` verwendet vom Gerät gemeldete Dateinamen aus `pm path` ungeprüft als Pfadkomponenten auf dem Host                                                                                                                                                            | `1aed333` |
| `native-providers-2`     | Sicherheit  | mittel  | Quadratische reguläre Ausdrücke im otool-Load-Command-Parser ermöglichen ReDoS auf der Event-Loop durch vom analysierten Binary kontrollierte Ausgaben                                                                                                                          | `6286083` |
| `supply-chain-tooling-3` | Fehler      | mittel  | Der mit `WITH_GHIDRA=1` gebaute Dev-Container installiert Ghidra, setzt aber nie `GHIDRA_INSTALL_DIR`, sodass REA es nicht nutzen kann                                                                                                                                          | `e3b007f` |
| `web-javascript-1`       | Sicherheit  | mittel  | Der mitmproxy-Decoder behält Proxy-Benutzername und -Passwort aus `metadata.proxyauth` der Flows im Klartext                                                                                                                                                                    | `cdac7c3` |
| `application-layer-4`    | Fehler      | niedrig | Eine erfolgreiche macOS-Hopper-Installation wird als `download_failed` gemeldet, wenn `open` oder eine spätere Stufe fehlschlägt                                                                                                                                                | `cad212d` |
| `domain-a-to-l-3`        | Performance | niedrig | Positionen von Source-Map-Direktiven werden durch erneutes Zerlegen des Dateipräfixes ermittelt, was quadratisch mit der Dateigröße wächst                                                                                                                                      | `f3fa121` |
| `domain-a-to-l-5`        | Sicherheit  | niedrig | Der Regex für Platzhalter in benutzerdefinierten Prompts backtrackt bei langen Whitespace-Folgen in kubischer Zeit                                                                                                                                                              | `e3b007f` |
| `domain-a-to-l-6`        | Fehler      | niedrig | Das Rendern stürzt ab, wenn ein weggelassenes optionales Argument `constructor` heißt                                                                                                                                                                                           | `e3b007f` |
| `domain-a-to-l-7`        | Toter Code  | niedrig | Die drei Module für Conformance-Paket, Replay und Trust-Gate (rund 890 Zeilen) werden nur von ihren eigenen Tests verwendet                                                                                                                                                     | `f3fa121` |
| `domain-a-to-l-8`        | Toter Code  | niedrig | Hopper `parseProcedures` und `parseNames` samt ihren drei Schemas haben keine Aufrufer im Produktivcode                                                                                                                                                                         | `f3fa121` |
| `domain-m-to-z-10`       | Toter Code  | niedrig | Builder und Parser für `HistoricalSourceManifest` haben keinen Verbraucher im Produktivcode                                                                                                                                                                                     | `f3fa121` |
| `domain-m-to-z-11`       | Toter Code  | niedrig | Im Parser für Referenz-Imports gibt es einen ungenutzten Parameter `language` und einen überflüssigen Spezifizierer-Zweig                                                                                                                                                       | `f3fa121` |
| `domain-m-to-z-4`        | Fehler      | niedrig | Die Validierung von Trace-Spezifikationen rekursiert ohne Schranke und baut O(n²)-Erreichbarkeit ohne Ereignislimit auf Teilweise: Die Zyklenprüfung ist iterativ; Größengrenzen im Schema bleiben offen.                                                                       | `e4477b5` |
| `domain-m-to-z-6`        | Fehler      | niedrig | Indizierte Source-Map-Blätter werden in umgekehrter Reihenfolge der Abschnitte zurückgegeben                                                                                                                                                                                    | `f3fa121` |
| `domain-m-to-z-7`        | Toter Code  | niedrig | Die Zweige für dynamische Imports mit `Import`-Callee aus Babel 7 sind unter @babel/parser 8 unerreichbar                                                                                                                                                                       | `f3fa121` |
| `domain-m-to-z-8`        | Toter Code  | niedrig | Die Option `validateOffsets` wird im Produktivcode nie gesetzt, und der behauptete gemeinsame Durchlauf ist dupliziert                                                                                                                                                          | `f3fa121` |
| `domain-m-to-z-9`        | Toter Code  | niedrig | `reconcileWebScript` wurde durch `reconcileCapturedWebScript` abgelöst                                                                                                                                                                                                          | `f3fa121` |
| `mcp-cli-adapters-3`     | Performance | niedrig | Die Vervollständigung von Prompt-Argumenten klont und parst bei jeder Anfrage das gesamte Evidence-Ledger erneut                                                                                                                                                                | `a3fecb5` |
| `mcp-cli-adapters-4`     | Fehler      | niedrig | `observe-native-ui` akzeptiert `--steps`, verwirft die Schritte aber stillschweigend, sodass statt des angeforderten Szenarios nur eine passive Beobachtung erfolgt                                                                                                             | `a3fecb5` |
| `mcp-cli-adapters-5`     | Fehler      | niedrig | MCP `capture_process_scenario` liest das aktuelle `process.env` statt der zwischengespeicherten oder injizierten Umgebung des Servers                                                                                                                                           | `a3fecb5` |
| `mcp-cli-adapters-6`     | Toter Code  | niedrig | `registerConfiguredAnalysisTools` enthält unerreichbare Rückfälle zur Konstruktion von Providern                                                                                                                                                                                | `a3fecb5` |
| `mcp-cli-adapters-7`     | Toter Code  | niedrig | Hilfsfunktionen zur Auflösung von Namen auf Verträge duplizieren `toolContract<Name>` und binden ihre Typen über die Array-Position                                                                                                                                             | `a3fecb5` |
| `mobile-managed-misc-4`  | Fehler      | niedrig | Die Firmware-Veröffentlichung übergibt rohe Dateinamen an `SafeOutputTree`: Ein Backslash-Name bricht die Extraktion ab, NFD-Namen werden an nicht existierenden Pfaden gemeldet Teilweise: Der gemeldete Pfad stimmt; Namen mit Backslash brechen die Extraktion weiterhin ab. | `8813d85` |
| `mobile-managed-misc-5`  | Fehler      | niedrig | Die Reihenfolge extrahierter Firmware-Dateien hängt von der Standard-ICU-Locale des Hosts ab                                                                                                                                                                                    | `1aed333` |
| `mobile-managed-misc-6`  | Sicherheit  | niedrig | Der Regex zum Trimmen von Whitespace bei EVM-Hex-Carriern ist bei Whitespace-Folgen im Inneren quadratisch                                                                                                                                                                      | `1aed333` |
| `mobile-managed-misc-7`  | Sicherheit  | niedrig | `collect_adb_bugreport` hasht und meldet jeden Host-Pfad aus der adb-Ausgabe ohne Prüfung auf Enthaltensein im Zielverzeichnis                                                                                                                                                  | `1aed333` |
| `mobile-managed-misc-8`  | Toter Code  | niedrig | Die Auswahlprüfung der Extraktion enthält Bedingungen, die nie wahr werden                                                                                                                                                                                                      | `1aed333` |
| `mobile-managed-misc-9`  | Toter Code  | niedrig | Im dynamischen String-Tabellen-Resolver von pwntools ist eine Bedingung immer wahr                                                                                                                                                                                              | `1aed333` |
| `native-providers-4`     | Fehler      | niedrig | Der gemeinsame Hopper-Start wird durch das Signal des ersten Aufrufers abgebrochen, sodass auch gleichzeitige Aufrufer ohne Abbruch scheitern                                                                                                                                   | `cad212d` |
| `native-providers-8`     | Toter Code  | niedrig | Der Zweig zur win32-Schlüsselnormalisierung in `ghidraJavaLaunch` kann nie ausgeführt werden                                                                                                                                                                                    | `6286083` |
| `native-providers-9`     | Toter Code  | niedrig | `bridge/native/test_rea_lldb_tracer.py` wird nie ausgeführt                                                                                                                                                                                                                     | `8813d85` |
| `runtime-core-3`         | Fehler      | niedrig | Ein ungültiger Wert für `REA_LOG_LEVEL` bringt jeden CLI-Befehl mit einem unbehandelten `ZodError` zum Absturz                                                                                                                                                                  | `cb3681c` |
| `runtime-core-4`         | Fehler      | niedrig | Der Dateisystem-Snapshot bricht die gesamte Erfassung ab, wenn ein Symlink oder Verzeichnis während der Aufzählung entfernt wird                                                                                                                                                | `cb3681c` |
| `runtime-core-5`         | Fehler      | niedrig | MCP Doctor sendet ein Signal an eine nackte PID, nachdem das SDK den Kindprozess bereits abgeräumt hat                                                                                                                                                                          | `e4477b5` |
| `runtime-core-7`         | Toter Code  | niedrig | Die Überlaufprüfung im Zweig mit erwarteter Größe von `readBoundedFileBytes` kann nie wahr werden                                                                                                                                                                               | `cb3681c` |
| `runtime-core-8`         | Toter Code  | niedrig | `jsonFileError` enthält den unerreichbaren Grund `invalid-json` und einen unerreichbaren Zweig für undefinierte Pfade                                                                                                                                                           | `cb3681c` |
| `runtime-core-9`         | Toter Code  | niedrig | `defaultHopperLauncherPath` hat einen injizierbaren Parameter `executable`, den kein Aufrufer setzen kann                                                                                                                                                                       | `cb3681c` |
| `supply-chain-tooling-2` | Fehler      | niedrig | Die Turbo-Inputs für `test:run` und `docs:check:built` lassen Dateien aus, die diese Tasks lesen, sodass lokale Gates veraltete Erfolge wiederholen                                                                                                                             | `bd273bc` |
| `supply-chain-tooling-4` | Fehler      | niedrig | Der Pfadfilter des Docker-Workflows erfasst Dateien nicht, von denen der Image-Build abhängt, und läuft nie auf `main`                                                                                                                                                          | `e3b007f` |
| `supply-chain-tooling-5` | Fehler      | niedrig | `config:print` gibt eine nicht gepinnte Registrierung `rea-agents@latest` aus, im Widerspruch zur gepinnten Registrierungsidentität                                                                                                                                             | `bd273bc` |
| `supply-chain-tooling-6` | Toter Code  | niedrig | Nach `semver.valid(v) === v` sind die zusätzlichen `includes`-Prüfungen auf das Zeichen `+` in den Release-Werkzeugen überflüssig                                                                                                                                               | `bd273bc` |
| `web-javascript-4`       | Fehler      | niedrig | `observe_web_session` endet nach etwa 1 ms, wenn `observation_ms` den Wert 2^31 ms oder mehr hat                                                                                                                                                                                | `cdac7c3` |
| `web-javascript-5`       | Fehler      | niedrig | `wait_for_timeout` und `timeout_ms` von Szenarioschritten laufen über die 32-Bit-Timer von Playwright hinaus                                                                                                                                                                    | `cdac7c3` |
| `web-javascript-6`       | Sicherheit  | niedrig | Die Netzwerk-Header-Erfassung von Playwright behält URL-Userinfo in den Werten von `Location`, `Referer` und `Origin`                                                                                                                                                           | `625a826` |
| `web-javascript-8`       | Toter Code  | niedrig | `WebSourceMapFetcher` enthält einen ungenutzten Parameter `callerSignal` und einen überflüssigen Wrapper `signalIsAborted`                                                                                                                                                      | `cdac7c3` |

## Offene Befunde mit Empfehlung

Diese Befunde sind echt, wurden aber bewusst nicht automatisch behoben. Sie
brauchen eine Vertrags- oder Designentscheidung (zum Beispiel neue
Kürzungsmarkierungen in der Evidence), Zugriff, den diese Umgebung nicht hatte
(Commit-SHAs von GitHub Actions, ein echtes Hopper-DMG), oder sie sind nur
plausibel und brauchen erst eine Messung.

| ID                       | Art         | Schwere | Status    | Befund                                                                                                                                                                                                         | Empfehlung                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ----------- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-a-to-l-1`        | Sicherheit  | mittel  | bestätigt | Die JSON-Strukturableitung kopiert den vollständigen Pfad in jeden Knoten, sodass Kosten und Ausgabe quadratisch mit der Tiefe wachsen `src/domain/jsonShape.ts:69`                                            | Knoten sollten intern über Elternverweise und eigene Segmente verbunden und Pfade erst im abschließenden Preorder-Durchlauf gebildet werden. Ein aus realen Ressourcengrenzen abgeleitetes Budget für Pfadsegmente muss vor der Allokation greifen und die Form als gekürzt markieren (additives Schemafeld).                                                                                                        |
| `domain-a-to-l-4`        | Performance | mittel  | bestätigt | `build_call_path` zählt alle kürzesten Pfade ohne Obergrenze auf, sodass die Ausgabe exponentiell wachsen kann `src/domain/callPath.ts:267`                                                                    | Die kürzesten Pfade sollten per dynamischer Programmierung über `goalDistances` exakt gezählt und nur die ersten N in kanonischer Reihenfolge aufgezählt werden, mit `total_paths` und `paths_truncated` im Ergebnis. Das ändert den Ausgabevertrag und die Kataloge, daher ist kein Autofix angebracht.                                                                                                             |
| `mobile-managed-misc-3`  | Performance | mittel  | bestätigt | Der Reference-Source-Reader hält die vollständigen Bytes jeder Datei ohne Budget pro Datei oder insgesamt im Speicher `src/reference/ReferenceSourceReaderFile.ts:195`                                         | Das ist eine Designänderung: In `src/reference/ReferenceSourceReaderFile.ts` sollte SHA-256 gestreamt und Bytes nur für Dateien behalten werden, die `parseReferenceSourceImports` benötigt, mit Grenze pro Datei. Ein aggregiertes Budget in `processFileEntry` soll bei Überschreitung eine Einschränkung vermerken und die Abdeckung auf `partial` setzen.                                                        |
| `native-providers-1`     | Sicherheit  | mittel  | bestätigt | Die Länge von `read_bytes` ist durchgängig unbegrenzt: Die Ghidra-Bridge baut den ganzen Bereich im Speicher auf, und die Node-Zeilenpuffer haben keine Obergrenze `bridge/ghidra/ReaGhidraBridge.java:600`    | Es sollte keine öffentliche Vertragsobergrenze eingeführt werden. Stattdessen ist in `GhidraResponseBuffer` und `HopperResponseStream` die Fragmentlänge zu begrenzen (abgeleitet vom V8-String-Limit) und Überlauf über den bestehenden Protokollfehlerpfad zu melden. In `ReaGhidraBridge.readMemoryBytes` ist der Umfang vor der Allokation zu berechnen und als typisierter `resource_constraint` zurückzugeben. |
| `supply-chain-tooling-1` | Sicherheit  | mittel  | bestätigt | Drittanbieter-Actions in Release- und Deploy-Jobs mit Secrets sind an veränderliche Tags statt an Commits gepinnt `.github/workflows/release.yml:51`                                                           | `googleapis/release-please-action@v4` in `.github/workflows/release.yml` (Zeilen 51, 107, 229) und `cloudflare/wrangler-action@v4` in `website-pages.yml:117` sollten auf vollständige 40-stellige Commit-SHAs mit Versionskommentar gepinnt werden, wie in `real-termux.yml:41`. Die SHAs müssen aus den Upstream-Tags stammen.                                                                                     |
| `application-layer-1`    | Sicherheit  | niedrig | plausibel | Die macOS-Hopper-Installation vertraut veränderlichen Hersteller-Metadaten und einer nicht verankerten `codesign`-Prüfung und startet die App danach automatisch `src/application/MacHopper.ts:217`            | In `validBundle` in `src/application/MacHopper.ts` sollte der `codesign`-Aufruf eine Designated Requirement mit dem Team-ID-Anker des Herstellers erhalten, der zuvor an einem echten DMG zu bestätigen ist. Der offengelegte Befehlstext und die Setup-Goldens müssen angepasst werden.                                                                                                                             |
| `application-layer-3`    | Sicherheit  | niedrig | plausibel | Die `Info.plist` eines App-Bundles wird ohne Größenlimit gelesen und kann ein Symlink außerhalb des analysierten Bundles sein `src/application/AppBundleExecutable.ts:181`                                     | In `resolveLayoutExecutable` in `src/application/AppBundleExecutable.ts` sollte die Größe vor dem Lesen geprüft werden, etwa über `withRegularFile` aus `RegularFileRead.ts` mit Symlink-Modus `follow`. Zu große Plists lehnt ein `BinaryTargetError` ab; das Limit muss einer realen Grenze folgen.                                                                                                                |
| `application-layer-5`    | Fehler      | niedrig | plausibel | Die Hopper-Installation unter Linux aktualisiert als Nebeneffekt bereits installierte gemeinsame Systempakete `src/application/LinuxHopper.ts:329`                                                             | In `linuxPackageManagerCommands` in `src/application/LinuxHopper.ts` sollten nur fehlende Laufzeitabhängigkeiten installiert werden, etwa per `apt-get install -y --no-upgrade` vor dem eigentlichen Paketbefehl oder durch Vorfilterung mit `dpkg-query -W`. Offengelegter Befehlstext und Tests müssen angepasst und auf echten Distributionen geprüft werden.                                                     |
| `application-layer-6`    | Fehler      | niedrig | plausibel | Die atomare Veröffentlichung ohne Überschreiben erfordert Hard Links und scheitert auf FAT/exFAT und vielen SMB-Freigaben immer `src/application/JsonFiles.ts:224`                                             | In `publishFile` in `src/application/JsonFiles.ts` sollte bei `link()`-Fehlern mit `EPERM`, `ENOTSUP`, `EOPNOTSUPP` oder `ENOSYS` (nur diesen) auf ein nicht überschreibendes Kopieren mit `COPYFILE_EXCL` ausgewichen werden. Die fehlende Atomarität ist eine Designentscheidung und kein Fall für einen Autofix.                                                                                                  |
| `native-providers-10`    | Toter Code  | niedrig | bestätigt | `GhidraResponseBuffer` und `HopperResponseStream` duplizieren dieselbe NDJSON-Fragment- und Zeilentrennungslogik `src/ghidra/GhidraResponseBuffer.ts:17`                                                       | Gemeinsam mit der Korrektur zu `read_bytes` sollte ein begrenzter NDJSON-Zeilentrenner unter `src/process/` (etwa `NdjsonLineBuffer.ts`) entstehen. `GhidraResponseBuffer` wird dadurch ersetzt, und `HopperResponseStream` delegiert sein Framing daran.                                                                                                                                                            |
| `native-providers-5`     | Performance | niedrig | plausibel | Der IDA-Headless-Modus berechnet bei jeder Operation zweimal den Hash der gesamten privaten Eingabekopie neu `src/ida/IdaSessionClient.ts:371`                                                                 | In `src/ida/IdaWorkspace.ts` sollte nach der Digest-Prüfung der Kopie eine Stat-Identität (`dev`, `ino`, `size`, `mtimeNs`, `ctimeNs`) festgehalten werden. `IdaSessionClient.#observe` hasht dann nur bei abweichender Identität erneut; da sich die Identitätsprüfung ändert, ist ein Review nötig.                                                                                                                |
| `native-providers-6`     | Performance | niedrig | plausibel | Die namensbasierte Prozedurauflösung in der Ghidra-Bridge führt bei jeder Anfrage für jede Funktion eine Symboltabellenabfrage aus `bridge/ghidra/ReaGhidraBridge.java:1778`                                   | Entweder sollte eine lazy befüllte `Map<String, List<Function>>` aller einfachen und qualifizierten Namen neben `procedureInventory` aufgebaut und in `invalidateAnalysisCaches()` geleert werden, oder `symbolTable.getSymbols(name)` mit Namespace-Auflösung genutzt werden. Die Reihenfolge der Mehrdeutigkeitsfehler bleibt erhalten.                                                                            |
| `native-providers-7`     | Sicherheit  | niedrig | bestätigt | Die Windows-Loopback-TCP-Bridge akzeptiert vor der Authentifizierung genau eine Verbindung, sodass ein zuerst verbindender lokaler Prozess die Session lahmlegen kann `bridge/ghidra/ReaGhidraBridge.java:291` | In `serveLoopbackTcp`/`acceptClient` in `bridge/ghidra/ReaGhidraBridge.java` sollte `server.accept()` in einer Schleife laufen, pro Verbindung die erste Anfrage mit begrenzter Wartezeit gelesen und ein unauthentifizierter Client geschlossen werden. Erst nach gültigem Token wird die Verbindung an `serveClient` übergeben; die Schleife endet mit der Startfrist.                                             |
| `runtime-core-2`         | Performance | niedrig | plausibel | `TerminalRenderer` serialisiert bei jedem PTY-Chunk den gesamten Scrollback im Hauptthread, auch nachdem das Budget erschöpft ist `src/process/capture/TerminalRenderer.ts:136`                                | In `#capture` in `src/process/capture/TerminalRenderer.ts` sollte zuerst eine billige untere Schranke berechnet und `serialize()` nur übersprungen werden, wenn selbst diese nicht mehr ins Budget passt. Die Aufbewahrungssemantik bleibt erhalten, und `#truncated` allein darf die Serialisierung nicht stoppen.                                                                                                  |
| `runtime-core-6`         | Toter Code  | niedrig | bestätigt | Das temporäre Wurzelverzeichnis der Prozesserfassung wird bei jeder Erfassung angelegt und entfernt, dem Kindprozess aber nie bereitgestellt `src/process/capture/ProcessCaptureLifecycle.ts:1475`             | Als geprüfte Vertragsänderung ist ein Eigentümer zu wählen: entweder das Verzeichnis per `TMPDIR`/`TMP`/`TEMP` an das Kind exportieren und in `docs/process-capture.md` dokumentieren, oder `createTemporaryRoot` samt Cleanup und den `temporary_root`-Feldern entfernen und die Kataloge neu erzeugen.                                                                                                             |
| `web-javascript-3`       | Performance | niedrig | plausibel | Babel parst `sourcesContent` aus abgerufenen Source Maps im Host-Prozess unbegrenzt und nicht unterbrechbar `src/browser/WebSourceMapFetcher.ts:708`                                                           | Das ist keine kleine lokale Korrektur: Die Modulkanten-Extraktion und idealerweise `analyzeScript` gehören in den eigenen JavaScript-Analyse-Worker (`src/javascript/analysis/JavaScriptAnalysisWorker.ts`) mit Heap-Limit, was eine Architekturentscheidung erfordert. Ein Größenlimit pro Quelle wäre nur mit dokumentiertem, ressourcenbasiertem Wert zulässig.                                                   |
| `web-javascript-7`       | Fehler      | niedrig | plausibel | CDP- und V8-Discovery-Anfragen haben weder eine Frist noch eine Obergrenze für die Antwortgröße `src/browser/CdpEndpoint.ts:311`                                                                               | In `readCdpJson` sollte die kumulative Chunk-Länge verfolgt werden. Bei Überschreitung von `WEB_RUNTIME_LIMITS.protocolBytes` ist `request_.destroy()` aufzurufen und mit `BrowserObservationError` und dem Code `invalid_endpoint_response` abzulehnen; Fristen bleiben unverändert.                                                                                                                                |

## Widerlegte Befunde

| ID                   | Befund                                                                                                                                                 | Warum widerlegt                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `native-providers-3` | Die Regex-Suche in Ghidra hat kein Zeitlimit auf dem einzelnen Bridge-Thread, sodass katastrophales Backtracking die Session bis zum Beenden blockiert | Dokumentiertes Verhalten: Die Ghidra-Suche wartet laut `docs/ghidra-provider.md` auf eine Antwort oder den Abbruch durch den Aufrufer.       |
| `web-javascript-2`   | Die Ereigniserfassung von Playwright-Szenarien behält Konsolen-, WebSocket- und Netzwerk-Bodys ohne jede Obergrenze                                    | Dokumentierter Vertrag: `docs/browser-scenario-contract.md` legt ausdrücklich fest, dass Szenario-Ereignisse keine Anzahl-Obergrenzen haben. |
| `domain-m-to-z-5`    | Der Ausschluss sensibler Werte vergleicht rohe Literale mit RFC-6901-maskierten Pointern                                                               | Der Pfad ist vorher blockiert: Beide Erzeuger verwerfen Objektschlüssel mit markierten Werten, bevor sie Pointer ausgeben.                   |

## Weitere Änderungen auf diesem Branch

- **Sprachen:** README und Website gibt es auf Englisch (Quellsprache),
  Deutsch und Kroatisch. Die 17 übrigen Übersetzungen sind entfernt. Der
  kroatische Website-Katalog ist vollständig (1468 von 1468 Texten) und wie der
  deutsche als maschinell unterstützte Basis zur Durchsicht markiert.
- **Links:** Discord, X, Trendshift, Star-History, skills.sh und die Werbe-Links
  auf rea.tools sind aus README, Doku-Seitenleiste und Website entfernt. Die
  README verweist für Anleitungen auf die lokale Doku. Links zu Werkzeugen, die
  REA braucht (Ghidra, JADX und andere), bleiben in der Fach-Doku, weil sie für
  die Einrichtung nötig sind.
- **Docker:** `Dockerfile`, `compose.yaml`, `docker/entrypoint.sh` und
  `docker/smoke-test.mjs`. Das Image läuft als unprivilegierter Nutzer, Ghidra
  12.1.4 und OpenJDK 21 sind optional (`WITH_GHIDRA=1`) und per SHA-256
  geprüft. `compose.yaml` startet standardmäßig ohne Netzwerk und ohne
  Capabilities. Anleitung: [Docker und VS Code](../docker-vscode.md).
- **VS Code:** Registrierung als MCP-Server über `.vscode/mcp.json` (lokal oder
  per Docker) und ein Dev-Container in `.devcontainer/`.
- **Eigene Prompts:** `REA_PROMPTS_DIR` lädt Markdown-Prompts mit
  YAML-Front-Matter als zusätzliche MCP-Prompts für jeden Client mit
  Prompt-Unterstützung. Format: [eigene Prompts](../mcp-prompts.md#custom-prompts).
- **Konfiguration:** [Konfigurationsreferenz](../configuration.md) mit allen
  nutzerseitigen Umgebungsvariablen, erlaubten Werten, Defaults und Quelldateien.
- **Verantwortungsvolle Nutzung:** Der README-Abschnitt ersetzt den
  Haftungsausschluss und erklärt, dass REA keine Sandbox ist. Er ist reine Doku
  und schränkt keine Funktion ein.

## Verifikation

Auf dem Endstand dieses Branches lief Folgendes, jeweils ohne Fehler:

| Prüfung                                                                                                           | Ergebnis                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run check` (Typecheck, Lint, Format, knip, Metadaten, Architektur-Guards)                                    | bestanden                                                                            |
| `npm run test:fast` (Domain, Services, Adapter, Composition, Conformance, Evaluation)                             | 384 Dateien, 4427 Tests bestanden, 6 übersprungen                                    |
| `npm run test:boundary` (Boundary, Prozess, MCP, prozessglobal)                                                   | 404 Dateien, 3204 Tests bestanden, 119 übersprungen                                  |
| `npm run test:acceptance`                                                                                         | 34 Dateien, 193 Tests bestanden, 3 übersprungen                                      |
| `npm run docs:check` und `npm run docs:build` (Doku-Fakten, tote Links)                                           | bestanden, nach Korrektur eines schon vorher toten Links in `docs/wasm-artifacts.md` |
| `python3 scripts/website.py check` und strenge Katalogprüfung für `de` und `hr`                                   | bestanden                                                                            |
| Docker: Runtime-Image, Dev-Container-Stage, Ghidra-Pfad mit Test-Archiv, Abweisung falscher Prüfsumme, fremde UID | bestanden                                                                            |
| `node docker/smoke-test.mjs` (MCP über stdio ohne Netz und ohne Capabilities)                                     | 171 Tools, Analyse liefert Evidence                                                  |

Übersprungene Tests brauchen Werkzeuge oder Plattformen, die hier fehlen.
Ausdrücklich **nicht** geprüft wurden: der echte Ghidra-Download im
Docker-Build (GitHub-Downloads sind in dieser Umgebung gesperrt; der
SHA-256-Wert stammt von der Release-Seite), echte Provider (Ghidra, Hopper,
IDA, JEB, mitmdump, adb mit Gerät), macOS und Windows sowie Windows-ConPTY-Echo
für die Echo-Schwärzung. Die Website-Übersetzung ist maschinell unterstützt und
wartet auf eine menschliche Durchsicht.

## Entscheidungen für dich

1. **Identität des Forks.** Paketname `rea-agents`, `mcpName`
   `io.github.morluto/rea`, die Repository-URLs in `package.json` und
   `server.json` sowie `REPOSITORY="morluto/rea"` in `install.sh` zeigen auf das
   Original. Solange das so bleibt, installiert `rea update` die
   Upstream-Version von npm über deinen Build. Für eine eigene Verteilung
   brauchst du einen eigenen Paketnamen und Registry-Eintrag.
2. **Website-Domain.** Die Website-Werkzeuge erzeugen kanonische URLs und die
   Sitemap für `https://rea.tools` (`SITE_ORIGIN` in `scripts/website.py`). Für
   eigenes Hosting änderst du diesen Wert und die Prüfungen in
   `scripts/verify-website.py`.
3. **Release-Actions pinnen.** `googleapis/release-please-action@v4` und
   `cloudflare/wrangler-action@v4` laufen in Jobs mit Secrets auf veränderlichen
   Tags. Sie sollten auf vollständige Commit-SHAs gepinnt werden.
4. **Ressourcengrenzen mit Vertragsänderung.** `read_bytes`, JSON-Shape-Inferenz
   und `build_call_path` brauchen Obergrenzen mit einer sichtbaren
   Kürzungsmarkierung in der Evidence. Das ändert öffentliche Schemas und den
   generierten Katalog und sollte bewusst entschieden werden.
5. **Hopper-Download.** Der feste 120-Sekunden-Abbruch ist durch einen
   Stillstands-Timeout ersetzt. Ein Server, der extrem langsam, aber stetig
   sendet, wird jetzt nur noch durch die 100-MB-Grenze und manuellen Abbruch
   begrenzt. Falls du zusätzlich eine Gesamtgrenze willst, ist das eine Zeile.
