# REA sicher unter Windows einrichten

Diese Anleitung beschreibt, wie du REA unter Windows als MCP-Server in Claude
Code, Cline oder VS Code einbindest und dabei die Kontrolle darüber behältst,
was ausgeführt wird und welche Daten an ein Sprachmodell gehen. Sie ergänzt die
[Installationsanleitung](installation.md) und den
[Windows-Ghidra-Leitfaden](windows-ghidra-p0.md).

Die Aussagen beruhen auf einem Lese-Audit des Quellcodes von Version 6.4.0.
REA wurde dafür nicht auf einem Windows-Rechner ausgeführt.

## Was REA auf Windows kann

| Funktion                                   | Windows       | Hinweis                                                |
| ------------------------------------------ | ------------- | ------------------------------------------------------ |
| JavaScript-, Electron- und ASAR-Analyse    | ja            | Braucht nur Node.js.                                   |
| .NET-Programme statisch untersuchen        | ja            |                                                        |
| PE-Dateien (`.exe`, `.dll`) mit Ghidra     | experimentell | Ghidra 12.1.x und JDK 21+, strikt read-only.           |
| Passiv an Electron oder Node andocken      | ja            | Nur über Loopback, die App startest du selbst.         |
| Android-APKs mit JADX                      | ja            | Braucht ein JDK.                                       |
| Process Capture (Startablauf mitschneiden) | nein          | Auf nativem Windows gesperrt, WSL ist die Alternative. |
| Hopper, LLDB, macOS-UI-Steuerung           | nein          | Nur macOS.                                             |
| ELF, Firmware, mitmproxy                   | nein          | Nur Linux.                                             |

## Was ein Audit gefunden hat

REA enthält keine Telemetrie, keine Update-Abfrage und keine versteckten
Uploads. Ghidra arbeitet mit einer temporären Datenbank und verändert die
untersuchte Datei nicht. Funktionen wie `set_comment` oder `set_address_name`
sind zwar als `mutatesTarget` markiert, schreiben aber nur in diese temporäre
Analysedatenbank.

Fünf Punkte verdienen trotzdem Aufmerksamkeit:

1. **Alles, was REA zurückgibt, geht an dein Modell.** REA schwärzt nur
   Transport-Zugangsdaten (Authorization-, Cookie- und Set-Cookie-Header,
   Zugangsdaten in URLs) und Werte, die du ausdrücklich als geheim markierst.
   Pfade, Strings aus Programmen, Seiteninhalte und Prozessausgaben gehen
   unverändert ins Modell. Bei einem Cloud-Modell wie DeepSeek solltest du
   alles Gesendete als veröffentlicht betrachten.
2. **Einige Tools führen das Ziel aus oder steuern es.** Sie laufen mit deinen
   vollen Benutzerrechten. Die Liste steht unten.
3. **`rea setup` ändert Konfigurationen deiner AI-Tools.** Es legt Backups
   unter `<datei>.rea.backup` an und fragt vor dem Schreiben nach. Cline
   unterstützt es nicht.
4. **Fremde Binärdateien werden ohne Sandbox geparst.** Ghidra und Java laufen
   mit deinen Rechten. Für verdächtige Dateien nimmst du die Windows Sandbox
   (ab Windows Pro) oder eine VM.
5. **Das npm-Paket enthält ein fertig kompiliertes natives Modul**
   (`rea-windows-x64.node`) für Job Objects und Zugriffsrechte.

## Schritt 1: Feste Version installieren

Installiere eine feste Version global. Dann lädt `npx` nicht bei jedem Start
unbemerkt eine neuere Version nach.

```powershell
node --version    # muss 22.19+, 24.11+ oder 26+ sein
npm install --global rea-agents@6.4.0
rea doctor --json
```

Ein Update machst du bewusst, indem du die Versionsnummer änderst und den
Befehl erneut ausführst.

Ghidra brauchst du nur für native Programme. REA installiert es nie selbst.
Wenn du es nutzt, setzt du die Pfade in PowerShell:

```powershell
$env:GHIDRA_INSTALL_DIR = "C:\tools\ghidra_12.1.4_PUBLIC"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
```

## Schritt 2: Im Client eintragen

Trag REA von Hand ein, statt `rea setup` zu verwenden. So siehst du genau, was
sich ändert. Wenn du doch `rea setup` nutzen willst, schau dir vorher mit
`rea setup --client vscode --dry-run --json` den Plan an.

Unter Windows ist `rea` ein `.cmd`-Shim. Deshalb startet der Client es über
`cmd /d /c`. Die Variable `REA_MCP_INPUT_SCHEMA_PROFILE=compact` verkleinert
die Tool-Beschreibungen. Das spart Kontext, was bei kleineren Modellen wie
DeepSeek spürbar hilft. Der Tool-Umfang und die Prüfung auf dem Server bleiben
gleich.

### Cline

Die Datei `cline_mcp_settings.json` öffnest du in Cline über
„MCP Servers“ und dann „Configure MCP Servers“.

```json
{
  "mcpServers": {
    "rea": {
      "command": "cmd",
      "args": ["/d", "/c", "rea", "mcp"],
      "env": { "REA_MCP_INPUT_SCHEMA_PROFILE": "compact" },
      "autoApprove": [],
      "disabled": false
    }
  }
}
```

Lass `autoApprove` leer. Trag dort höchstens Tools ein, die nur lesen und
keinen Prozess starten, etwa `list_electron_targets`, wenn du ihnen vertraust.

### VS Code (Copilot Chat und andere MCP-fähige Erweiterungen)

Öffne die Benutzer-`mcp.json` mit dem Befehl „MCP: Open User Configuration“.
VS Code verwendet `servers` statt `mcpServers` und braucht `"type": "stdio"`.

```json
{
  "servers": {
    "rea": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/d", "/c", "rea", "mcp"],
      "env": { "REA_MCP_INPUT_SCHEMA_PROFILE": "compact" }
    }
  }
}
```

Im Chat kannst du über das Werkzeug-Symbol einzelne REA-Tools abwählen.

### Claude Code

```powershell
claude mcp add rea --scope user --env REA_MCP_INPUT_SCHEMA_PROFILE=compact -- cmd /d /c rea mcp
```

Aktive Tools sperrst du in `~/.claude/settings.json` (siehe nächster
Abschnitt). Claude Code benennt MCP-Tools als `mcp__rea__<toolname>`.

### DeepSeek

REA braucht für DeepSeek keine eigene Einstellung. Du wählst das Modell im
Client, also in Cline oder in einer VS-Code-Erweiterung mit DeepSeek-Anbindung.
Für REA ist entscheidend, dass jedes Tool-Ergebnis an DeepSeek geht. Analysiere
damit öffentlichen Code wie installierte Programme und deren Erweiterungen.
Hänge REA nicht an Apps, in denen deine eigenen Dokumente, Passwörter oder
Kundendaten offen sind.

## Schritt 3: Aktive Tools sperren

Die folgenden Tools führen ein Programm aus, klicken darin, laden Seiten neu
oder verändern ein angeschlossenes Gerät. Die Einstufung stammt aus
`src/contracts/toolEffects.ts`. Auf Windows sind einige davon ohnehin nicht
verfügbar, sie stehen der Vollständigkeit halber trotzdem da.

| Tool                                                  | Was es tut                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `capture_electron_scenario`                           | Startet eine Electron-App und führt Klicks, Reloads oder Abstürze aus. |
| `capture_browser_scenario`                            | Steuert einen Browser durch ein Szenario.                              |
| `observe_web_execution`                               | Lädt eine Seite und verändert dabei ihren Zustand.                     |
| `capture_native_ui_scenario`                          | Steuert die Oberfläche einer macOS-App.                                |
| `observe_native_calls`                                | Startet ein Programm unter LLDB (macOS).                               |
| `capture_process_scenario`                            | Führt einen beliebigen Befehl aus (nicht auf Windows).                 |
| `install_adb_package`, `uninstall_adb_package`        | Installiert oder entfernt Apps auf einem Android-Gerät.                |
| `start_adb_app`, `start_adb_activity`, `stop_adb_app` | Startet oder beendet Apps auf dem Gerät.                               |
| `push_adb_file`                                       | Schreibt eine Datei auf das Gerät.                                     |

In Claude Code sperrst du sie so:

```json
{
  "permissions": {
    "deny": [
      "mcp__rea__capture_electron_scenario",
      "mcp__rea__capture_browser_scenario",
      "mcp__rea__observe_web_execution",
      "mcp__rea__capture_native_ui_scenario",
      "mcp__rea__observe_native_calls",
      "mcp__rea__capture_process_scenario",
      "mcp__rea__install_adb_package",
      "mcp__rea__uninstall_adb_package",
      "mcp__rea__start_adb_app",
      "mcp__rea__start_adb_activity",
      "mcp__rea__stop_adb_app",
      "mcp__rea__push_adb_file"
    ]
  }
}
```

Brauchst du eines davon später, nimmst du es gezielt aus der Liste.

Tools wie `inspect_web_page`, `analyze_web_bundle` oder
`trace_web_module_imports` greifen auf Websites zu, die du oder das Modell
nennst. Gib sie nur einzeln pro Aufruf frei.

## Beispiel: Warum startet VS Code langsam?

Fang mit den Bordmitteln von VS Code an, denn sie messen die Zeit direkt:

1. Führe den Befehl „Developer: Startup Performance“ aus. Er zeigt, welche
   Startphase wie lange dauert.
2. Unter „Developer: Show Running Extensions“ siehst du, wie lange jede
   Erweiterung zum Aktivieren braucht.
3. Starte `code --disable-extensions`. Ist der Start dann deutlich schneller,
   liegt es an einer Erweiterung, und du findest sie, indem du die Hälfte der
   Erweiterungen deaktivierst und weiter halbierst.
4. `code --prof-startup` schreibt ein CPU-Profil des Starts.

REA ergänzt das mit Strukturwissen. Lass es die Installation statisch
analysieren, zum Beispiel:

```powershell
rea analyze-javascript-application "$env:LOCALAPPDATA\Programs\Microsoft VS Code\resources\app" --json > vscode-evidence.json
```

So landet das Ergebnis zuerst in einer lokalen Datei, und du entscheidest
selbst, welchen Teil du einem Modell zeigst.

Dasselbe geht mit einzelnen Erweiterungen unter
`%USERPROFILE%\.vscode\extensions\<name>`. Du siehst dann, welche Module beim
Start sofort geladen werden, wie groß die Bundles sind und welche nativen
Module beteiligt sind. Das ist öffentlicher Code und damit unkritisch für ein
Cloud-Modell.

Für eine Live-Beobachtung startest du VS Code selbst mit
`code --inspect-extensions=9333` und lässt REA mit
`list_javascript_runtime_targets` und `observe_javascript_runtime` passiv
zusehen. Dabei können Pfade und Dateinamen aus deinem Workspace im Ergebnis
landen. Öffne für diese Messung deshalb einen leeren Ordner.

Ändern solltest du am Ende nur Einstellungen und Erweiterungen, nicht die
Dateien der Installation. Ein Update von VS Code überschreibt sie ohnehin, und
eine veränderte Installation ist schwer zu reparieren.

## Kurzfassung der Regeln

- Installiere eine feste Version und aktualisiere sie bewusst.
- Trag REA von Hand ein oder prüfe den Plan von `rea setup` mit `--dry-run`.
- Lass die automatische Freigabe leer und sperre die aktiven Tools.
- Setz keine `REA_*_COMMAND`-Variablen, denn sie legen fest, welches Programm
  REA startet.
- Untersuche fremde oder verdächtige Dateien nur in der Windows Sandbox oder
  einer VM.
- Schick einem Cloud-Modell nur Ergebnisse aus öffentlichem Code.
