<div align="center">

[English](README.md) · **Deutsch** · [Hrvatski](README_hr.md)

# REA: Alles reverse-engineeren

### Ein MCP für das Reverse Engineering von Binärdateien, Anwendungen und Laufzeitverhalten.

**Eine Funktion gefällt dir? Verstehe, wie sie funktioniert, bis hinunter auf die Binärebene.**

[![MCP tool catalog](https://img.shields.io/badge/MCP-tool_catalog-5c4ee5?style=flat-square)](docs/mcp-contracts.md#generated-catalog)
[![Node.js requirements](https://img.shields.io/badge/Node.js-requirements-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#was-du-analysieren-kannst)
[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)

[Schnellstart](#schnellstart) · [Docker und VS Code](#docker-und-vs-code) · [So funktioniert REA](#so-funktioniert-rea) · [Was du analysieren kannst](#was-du-analysieren-kannst) · [Fallstudien](#fallstudien) · [Häufige Fragen](#häufige-fragen) · [Dokumentation](#dokumentation)

<code>npx rea-agents setup</code>

<br />

<img src="docs/assets/rea-hopper-analysis.png" alt="REA startet seine Analysebrücke in Hopper und untersucht eine native Binärdatei" width="1200" />

<br />

</div>

---

Du hast in einer App eine Funktion entdeckt, die du in dein eigenes Produkt übernehmen möchtest? Lass deinen Agenten sie mit REA untersuchen. Er kann die App ohne ihren Quellcode analysieren, die Funktionsweise erklären, Belege zeigen und eine passende Umsetzung für dein Projekt entwickeln.

REA verbindet deinen Agenten mit Werkzeugen zum Untersuchen nativer Binärdateien, von JavaScript- und Electron-Apps, .NET-Assemblies und Websites. Dieselben Werkzeuge kannst du auch im Terminal nutzen. Die Analyse läuft lokal; die Ergebnisse enthalten die Belege und Einschränkungen hinter jeder Schlussfolgerung.

Die Einrichtung registriert REA bei deinem Agenten und installiert passende Workflow-Anweisungen. Für native Analysen kannst du eine vorhandene Hopper-, Ghidra- oder IDA-Installation verwenden. Mit deiner Zustimmung kann die Einrichtung auch Hopper installieren. Statische JavaScript-Analysen benötigen keine native Analyse-Engine.

## Schnellstart

### Deinen Agenten einrichten

Wenn Node.js und npm installiert sind, führe diesen Befehl aus:

```bash
npx rea-agents setup
```

Wähle deine Agenten aus, prüfe die geplanten Änderungen und bestätige sie. Die Einrichtung fügt den MCP-Server von REA und passende Workflow-Anweisungen hinzu und sichert vorhandene Konfigurationen. Starte deinen Agenten anschließend neu.

Die Einrichtung unterstützt Claude Code, Codex, Cursor, Gemini CLI, Grok Build und [weitere Agenten](docs/installation.md#supported-agents). Informationen zur Provider-Konfiguration und manuellen MCP-Registrierung findest du unter [Installation und Einrichtung](docs/installation.md).

### Deinen Agenten fragen

```text
Untersuche, wie die Suche in der Notes-App funktioniert, zeige mir die Belege und entwickle eine ähnliche Funktion für mein Projekt.
```

Ersetze Notes durch deine Ziel-App und benenne die Funktion, die du verstehen möchtest.

### Das Terminal verwenden

Untersuche ein entpacktes JavaScript-/Electron-App-Verzeichnis oder eine ASAR-Datei:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

Das Ergebnis enthält Module, Imports, Electron-Grenzen und die zugehörigen Belege. Ersetze den Pfad durch dein Ziel, beispielsweise `"D:/apps/example"` unter Windows.

Für die regelmäßige Nutzung kannst du den Befehl `rea` installieren:

```bash
npm install --global rea-agents
rea --help
```

Konfiguriere für native Analysen zuerst einen Provider. Native Befehle, Provider-Auswahl, Snapshots und Skriptnutzung beschreibt der [CLI- und Evidence-Leitfaden](docs/cli.md).

### REA aktualisieren

REA entwickelt sich schnell weiter, und neue Versionen enthalten häufig Fehlerbehebungen. Halte deine Installation aktuell.

Für eine mit `npm install --global` oder `bun add --global` installierte CLI:

```bash
rea update
```

Globale Updates mit Bun erfordern Bun 1.2.17 oder neuer. Mit einer älteren Bun-Version aktualisierst du Bun zuerst manuell, bevor du `rea update` ausführst.

Um die Agentenregistrierungen und den Skill zu aktualisieren, führe den Einrichtungsbefehl aus, den das Update ausgibt.

Wenn du `npx` verwendest, aktualisiere die Agenteneinrichtung mit:

```bash
npx rea-agents@latest setup
```

Prüfe die Änderungen der Einrichtung und starte deinen Agenten neu. Für einzelne CLI-Aufrufe verwende `npx rea-agents@latest`, gefolgt vom gewünschten Befehl. Mit Bun verwendest du `bunx rea-agents@latest` anstelle von `npx rea-agents@latest`.

`rea update` und `npx rea-agents@latest` installieren das `rea-agents`-Release aus der npm-Registry. Wenn du einen angepassten Build dieses Repositorys verwendest, aktualisiere ihn stattdessen, indem du ihn aus dem Quellcode neu baust oder das Docker-Image neu erstellst. Andernfalls ersetzt das Release aus der Registry deinen Build.

## Docker und VS Code

Erstelle aus diesem Repository ein Container-Image. `WITH_GHIDRA=1` fügt JDK 21 und ein Ghidra-Release mit geprüfter Prüfsumme für native Analysen ohne grafische Oberfläche hinzu:

```bash
docker build -t rea:ghidra --build-arg WITH_GHIDRA=1 .
```

Starte den MCP-Server über stdio. Binde das Verzeichnis mit deinen Zielen unter demselben absoluten Pfad ein, damit die Pfade in Werkzeugaufrufen und in Evidence auf beiden Seiten übereinstimmen:

```bash
docker run -i --rm -v "$PWD:$PWD" -w "$PWD" rea:ghidra mcp
```

Der [Leitfaden zu Docker und VS Code](docs/docker-vscode.md) beschreibt, wie du diesen Container in VS Code registrierst und das Repository in einem Dev-Container öffnest, und listet alle Build-Argumente auf. Die [Konfigurationsreferenz](docs/configuration.md) listet die Umgebungsvariablen auf, die du mit `-e` übergeben kannst.

## So funktioniert REA

Dein Agent ruft REA über MCP auf, um das Ziel zu untersuchen und relevanten Code zu verfolgen. REA liefert Ergebnisse mit ihren Belegen zurück. Der Agent nutzt sie für weitere Fragen, Erklärungen oder zum Schreiben und Testen einer Implementierung. CLI-Befehle verwenden dieselben Workflows.

![REA-Untersuchungsablauf: Dein Agent fragt nach einem lokalen Ziel, REA untersucht und verfolgt es mit Analysewerkzeugen, und der Agent nutzt den zurückgegebenen Code, Verweise und offene Fragen zum Erklären, Implementieren und Testen.](website/public/assets/figures/rea-investigation-flow.svg)

[Abbildung in voller Größe öffnen](website/public/assets/figures/rea-investigation-flow.svg).

<a id="current-status"></a>

## Was du analysieren kannst

REA benötigt Node.js 22.x (>=22.19), 24.x (>=24.11) oder 26+ sowie npm. Zusätzliche Werkzeuge und unterstützte Hostsysteme hängen vom Ziel ab:

| Ziel                                | Was REA zurückgibt                                                                                              | Voraussetzungen und Anleitung                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Binärdateien                 | Pseudocode, Assemblercode, Zeichenketten, Symbole, Aufrufe und Verweise                                         | Hopper, Ghidra oder IDA; [native Analyse](docs/native-investigation.md)                                                                       |
| Offline-ELF-Struktur                | Sektionen, Segmente, ursprüngliche Symbole/Relokationen und mögliche Schutzmaßnahmen aus statischer Analyse     | Vom Aufrufer bereitgestelltes pwntools unter Linux x64; [Binärdiagnostik](docs/binary-diagnostics.md)                                         |
| WASM-Artefakt                       | Validierung, Sektionen, exakte WAT-Formen der Importe/Exporte und dekodiertes WAT                               | Vom Aufrufer bereitgestelltes WABT 1.0.42; `inspect_wasm_artifact`                                                                            |
| EVM-Bytecode                        | Dispatch-Selektoren, Byte-Offsets, abgeleitete Argumente und Veränderbarkeit des Zustands                       | Lokale Eingabe mit Rohbytes oder Hexdarstellung unter Linux x64; [Offline-EVM-Leitfaden](docs/evm-bytecode.md)                                |
| Aufgezeichnete Linux-Abstürze       | Unverarbeitete Note-Einträge, Register/Signale aller aufgezeichneten Threads und optionale Zuordnungskandidaten | Vom Aufrufer bereitgestelltes pwntools unter Linux x64; optional GDB/pwndbg; [aufgezeichnete Abstürze](docs/recorded-crashes.md)              |
| JavaScript / Electron               | Module, Imports, Source Maps, Routen, IPC und Beziehungen zu nativen Add-ons                                    | Node.js und npm; [Anwendungsanalyse](docs/javascript-application-workflows.md)                                                                |
| Websites                            | Seitenstruktur, Skripte, Netzwerkbeobachtungen und angeforderte Screenshots                                     | Ein Browser aus der Chrome-Familie; [Browseranalyse](docs/browser-observation.md)                                                             |
| Gespeicherte Netzwerkaufzeichnungen | Anfragen, Antworten, zugängliche Nutzdaten und Quellpositionen                                                  | HAR; mitmdump unter Linux für Aufzeichnungen im nativen mitmproxy-Format; [Leitfaden zu Netzwerkaufzeichnungen](docs/web-network-captures.md) |
| .NET-Assemblies                     | Metadaten, CIL-Anweisungen, deklarierte native Abhängigkeiten und Build-Vergleiche                              | Keine (nur statisch); [Leitfaden für verwalteten Code](docs/managed-code-analysis.md)                                                         |
| Android-APKs                        | Manifest-Deklarationen, Klassen, dekompilierte Methoden und Verweise                                            | JADX ohne grafische Oberfläche und ein vollständiges JDK unter Linux/macOS/Windows x64; [Android-Leitfaden](docs/android-analysis.md)         |
| Android-Geräte                      | Geräte, Pakete, Prozesse, Logs, Dumps, Bildschirmaufnahmen sowie APK- und Dateiübertragungen                    | Vom Aufrufer bereitgestelltes adb (Emulator oder Gerät); [ADB-Leitfaden](docs/adb-device-analysis.md)                                         |
| JEB-Projekte                        | Engine-gestützte Projekteinheiten, Artefakt-Prüfsummen und Pseudocode von Typen/Methoden                        | Ein vom Aufrufer gestarteter JEB-Client mit MCP, ausgewählt über REA_JEB_MCP_URL; [JEB-Leitfaden](docs/jeb-analysis.md)                       |
| Android-Ressourcen                  | Dekodiertes Manifest, String-Tabellen, Sprachen und Versionsfakten                                              | Vom Aufrufer bereitgestellter Apktool-Starter; [Ressourcen-Leitfaden](docs/apktool-resource-analysis.md)                                      |
| Firmware                            | Bereiche, Extraktionsergebnisse und Übergaben an die native Analyse                                             | Binwalk / Unblob unter Linux; [Firmware-Leitfaden](docs/firmware-analysis.md)                                                                 |
| Pakete und Ressourcen               | Dateiinventare, Hashwerte, plists, Aufbau von Apple-Bundles und extrahierte Ressourcen                          | [Artefakt- und JavaScript-Leitfaden](docs/javascript-artifact-reconstruction.md), [Apple-Anwendungen](docs/apple-application-analysis.md)     |
| Prozessverhalten                    | Terminalausgabe, Interaktionen, Beobachtungen zu Prozessende und Dateisystem sowie Laufvergleiche               | Linux/macOS mit nativer PTY; [Prozessaufzeichnung](docs/process-capture.md)                                                                   |

Statische JavaScript- und .NET-Untersuchungen lesen die bereitgestellten Dateien, ohne die Anwendung auszuführen. Laufzeitaufzeichnungen führen das gewählte Ziel mit deinen Benutzerrechten aus oder interagieren damit; die jeweiligen Anleitungen beschreiben die Auswirkungen.

<a id="choosing-a-deep-analysis-provider"></a>

Native Formate und unterstützte Hostsysteme unterscheiden sich je nach Provider. Siehe [Hopper- und Ghidra-Einrichtung](docs/installation.md#hopper), den [IDA-Leitfaden](docs/ida-provider.md) und die [experimentelle Ghidra-Unterstützung unter Windows](docs/windows-ghidra-p0.md). Ghidra unterstützt auch [16-Bit-DOS-Analyse](docs/ghidra-dos.md). Für große Binärdateien erhöhst du die Startfrist von Ghidra mit `REA_GHIDRA_STARTUP_TIMEOUT_MS`. Die Provider-Auswahl beschreibt der [CLI-Leitfaden](docs/cli.md#choose-a-provider). Prüfe die [Verfügbarkeit in Releases](docs/installation.md#released-package-and-main) für Funktionen, die seit der neuesten npm-Version hinzugekommen sind.

## Fallstudien

![Illustrationen der Fallstudien zu DX-Balls Klangbalance, Notions Zwischenablage-Brücke und TH04s Geschossring](docs/assets/rea-showcases.png)

### DX-Ball: Eine Stereo-Panning-Berechnung rekonstruieren

Verfolge einen Sound-Aufruf zur Hilfsfunktion, die Positionen in Panning-Werte umrechnet, untersuche die Anweisungen und überführe unvollständigen Pseudocode in C. Die Rekonstruktion besteht 3.205 Tests mit dem ursprünglichen x86-Code und reproduziert alle 63 Bytes der kompilierten Funktion.

### Notion: Die Electron-Zwischenablagebrücke verfolgen

Finde die Zwischenablage-API des Renderers, verfolge sie über preload und IPC bis zum Hauptprozess und untersuche das Zwischenablageformat samt Formatierungsdaten.

### TH04: Eine DOS-Geschossring-Berechnung wiederherstellen

Untersuche die 16-Bit-Anweisungen des ursprünglichen PC-98-Spiels, rekonstruiere die festen und zielgerichteten Winkelberechnungen und vergleiche das rekonstruierte C++ mit der Ausgabe des damaligen Compilers.

Die vollständigen Fallstudien liegen den lokalen Website-Quellen in `website/public/showcase/` bei. Du kannst sie mit `python3 scripts/website.py serve` offline ansehen (siehe [website/README.md](website/README.md)).

## Häufige Fragen

<details>
<summary><strong>Welche Agenten können REA verwenden?</strong></summary>

Jeder Agent, der lokale MCP-Server unterstützt. Die Einrichtung konfiguriert die [unterstützten Agenten](docs/installation.md#supported-agents); andere Clients können die [manuelle MCP-Registrierung](docs/installation.md#mcp-registry) nutzen.

</details>

<details>
<summary><strong>Brauche ich Hopper, Ghidra oder IDA?</strong></summary>

Für tiefgehende native Analysen wird eines dieser Programme verwendet. Statische JavaScript- und .NET-Untersuchungen funktionieren ohne native Analyse-Engine. Die Einrichtung kann Hopper nach Zustimmung installieren; Ghidra und IDA nutzen deine vorhandenen Installationen. Siehe [Provider-Einrichtung](docs/installation.md#hopper).

</details>

<details>
<summary><strong>Muss ich Hopper vorher starten?</strong></summary>

REA startet Hopper, wenn eine Operation es benötigt. Unter macOS kann beim ersten Start ein Dialog erscheinen, in dem du den Demomodus auswählst oder deine Lizenz aktivierst. Siehe [Hopper-Start und Fehlerbehebung](docs/installation.md#launcher-paths-and-troubleshooting).

</details>

<details>
<summary><strong>Kann ich REA in Docker oder aus VS Code heraus verwenden?</strong></summary>

Ja. Der [Leitfaden zu Docker und VS Code](docs/docker-vscode.md) zeigt, wie du ein Image mit optionalem Ghidra und JDK erstellst, den Container in VS Code als MCP-Server registrierst und das Repository in einem Dev-Container öffnest.

</details>

<details>
<summary><strong>Welchen Code liefert REA zurück?</strong></summary>

Native Analysen liefern Pseudocode und Assemblercode. JavaScript-/Electron-Analysen rekonstruieren Module und ihre Beziehungen. Dein Agent nutzt diese Ergebnisse zum Schreiben und Testen einer Implementierung; die [Fallstudien](#fallstudien) zeigen konkrete Beispiele.

</details>

<details>
<summary><strong>Lädt REA meine App hoch?</strong></summary>

REA analysiert Ziele lokal. Dein Agent erhält die Werkzeugergebnisse; sein Modellanbieter hat eine eigene Datenrichtlinie.

</details>

<details>
<summary><strong>Was soll ich tun, wenn ich einen Fehler finde?</strong></summary>

Aktualisiere zuerst; eine neuere Version könnte den Fehler bereits behoben haben.

Für eine mit `npm install --global` oder `bun add --global` installierte CLI:

```bash
rea update
```

Für die Agenteneinrichtung über `npx`:

```bash
npx rea-agents@latest setup
```

Wenn du einen Agenten verwendest, schließe die [Aktualisierung der Einrichtung](#rea-aktualisieren) ab und starte ihn neu. Wiederhole dieselbe Aufgabe. Besteht das Problem weiterhin, öffne in diesem Repository ein Issue mit deiner REA-Version, dem Zieltyp, den Reproduktionsschritten und der Fehlerausgabe.

</details>

## Dokumentation

Beginne mit dem [Dokumentationsindex](docs/index.md). Genaue Optionen, Voraussetzungen und Ergebniskontrakte findest du hier:

- [Installation und Einrichtung](docs/installation.md): Agentenregistrierung, Provider-Konfiguration, Updates und Deinstallation.
- [Docker und VS Code](docs/docker-vscode.md): Container-Image, MCP-Registrierung in VS Code und Dev-Container.
- [Konfigurationsreferenz](docs/configuration.md): Alle benutzerseitigen Umgebungsvariablen in einer Tabelle.
- [Bereitschaft und Fehlerbehebung](docs/installation.md#check-readiness-for-your-task): Diagnose eines bestimmten Agenten oder einer Analyse-Engine.
- [CLI und Evidence](docs/cli.md): Befehle, Provider-Auswahl, Snapshots, Import/Export und Exit-Status.
- [MCP-Kontrakte](docs/mcp-contracts.md) und [Agenten-Prompts](docs/mcp-prompts.md): Werkzeugergebnisse, Sitzungen und geführte Untersuchungen.
- [Werkzeugkatalog](docs/mcp-contracts.md#generated-catalog): Beim Build erzeugtes Inventar von Werkzeugen, Providern und CLI-Befehlen.
- [Roadmap](docs/roadmap.md): Geplante Arbeiten und Fortschrittsübersichten zu Fähigkeiten.
- Audit Oktober 2026 ([Deutsch](docs/audit/audit-2026-10_de.md), [Hrvatski](docs/audit/audit-2026-10_hr.md)): Befunde zu Performance, Sicherheit, Fehlern und totem Code.

Melde Sicherheitslücken gemäß [SECURITY.md](SECURITY.md).

## Verantwortungsvolle Nutzung

REA stellt Werkzeuge für rechtmäßige Reverse-Engineering-Forschung, Analyse und Rekonstruktion bereit. Du bist dafür verantwortlich, erforderliche Genehmigungen einzuholen und geltendes Recht, Lizenzen und Nutzungsbedingungen einzuhalten. Das Projekt unterstützt keine rechtswidrige oder unbefugte Nutzung.

- Analysiere nur Ziele, die dir gehören oder deren Untersuchung dir ausdrücklich erlaubt ist, und bewahre einen Nachweis dieser Erlaubnis zusammen mit deinen Belegen auf.
- Behandle unbekannte Binärdateien, Archive, Seiten und Aufzeichnungen als feindlich. REA ist keine Sandbox: Provider parsen Ziele mit den Rechten deines Benutzers, und das Docker-Image isoliert zwar das Dateisystem, ist aber ebenfalls keine Malware-Sandbox. Verwende für verdächtige Samples eine Wegwerf-VM ohne Zugangsdaten.
- Behalte Evidence lokal. Bundles können Pfade, Zeichenketten, URLs und aufgezeichnete Netzwerkdaten des Ziels enthalten; prüfe sie, bevor du sie teilst.
- Laufzeitaufzeichnungen führen das Ziel aus oder steuern es. Verwende sie nur dort, wo die Ausführung dieses Ziels vertretbar ist.

REA ist ein Open-Source-Softwareprojekt. Wir haben keine Kryptowährung und keinen Token herausgegeben oder unterstützt. Token, die den Namen REA verwenden, stehen in keiner Verbindung zum Projekt.

## Mitwirken

Öffne in diesem Repository ein Issue, um einen Fehler zu melden oder eine Funktion vorzuschlagen, oder sende einen Pull Request, um Code oder Dokumentation zu verbessern.

Die Entwicklungsumgebung und Prüfungen beschreibt [CONTRIBUTING.md](CONTRIBUTING.md), die Verifikationspfade der [Testleitfaden](docs/testing.md) und die Projektstruktur die [Architekturübersicht](docs/architecture.mermaid).

## Lizenz

[MIT](LICENSE)
