# LIEUVA Agentenzentrale

Lokales Arbeitsinstrument für die Entscheidungsvorbereitung. Die sieben Agenten stehen in [`config.json`](./config.json); dort und in der Oberfläche sind Auftrag, Modell, Reasoning, Websuche, Aktivierung und Rhythmus änderbar. Alle starten mit `gpt-6-luna` und `low`.

## Start

Node 22 und eine angemeldete Codex-CLI werden benötigt. Auf macOS [`start.command`](./start.command) doppelklicken oder im Projektordner `npm run agents:dashboard` ausführen. Die Oberfläche öffnet unter <http://127.0.0.1:43821/>. [`index.html`](./index.html) lässt sich direkt als HTML-Datei öffnen; bei laufendem Server leitet sie zur interaktiven Oberfläche weiter, sonst zeigt sie die Rollen und den Startweg. Der lokale Server bleibt aktiv, bis das Terminal mit `Ctrl+C` beendet wird.

Bei einem anderen CLI-Pfad kann `CODEX_BIN=/absoluter/pfad/zum/codex npm run agents:dashboard` verwendet werden. Der Port lässt sich mit `AGENT_CONSOLE_PORT` ändern; beim direkten Öffnen der HTML-Datei gilt der Standardport 43821.

## Ablauf

1. **Tagesbriefing starten** führt fällige Spezialisten aus und danach den Master. **Alle Spezialisten neu prüfen** erzwingt einen frischen vollständigen Lauf. Einzelne Agenten lassen sich jederzeit manuell starten.
2. Spezialisten recherchieren lesend. Der Master erhält ihre letzten Berichte mit Zeitstempel und erstellt höchstens drei Tagesprioritäten. Tages- und Wochenrhythmen sind pro Agent einstellbar.
3. Vorschläge erscheinen unter **Vorschläge**. Titel, Begründung, Auftrag, Priorität und Ausführungsart können vor der Freigabe bearbeitet werden.
4. **Freigeben** speichert die Entscheidung. **Ausführen** startet erst nach einem weiteren ausdrücklichen Klick. Recherche bleibt lesend. Lokale Codearbeit läuft in einem neuen Codex-Worktree. Externe Kontaktaufnahme, Veröffentlichungen, Deployment, Live-Daten, Regeländerungen und Löschungen bleiben manuelle Vorgänge.
5. **Läufe** zeigt Warteschlange, Fortschritt, Bericht, Tokenzahlen soweit verfügbar und das lokale Codex-Protokoll. Laufende und wartende Aufgaben können abgebrochen werden.

Der automatische Tageslauf ist auf 09:00 Uhr `Europe/Amsterdam` eingestellt. Er läuft, solange der Server offen ist. Beim nächsten Start wird ein für denselben Tag verpasster Lauf nachgeholt. Ein Wochenagent wird nur neu gestartet, wenn sein letzter erfolgreicher Bericht mindestens sieben Tage alt ist. Die Uhrzeit und Automatik sind unter **Einstellungen** änderbar.

Konfiguration liegt in `agent-console/config.json` und ist Teil des Repos. Laufdaten, Berichte und Protokolle liegen in `artifacts/agent-console/` und werden nicht in Git aufgenommen. Die Oberfläche bindet nur an `127.0.0.1` und benötigt keinen API-Schlüssel im Browser. Codex verwendet die lokale Anmeldung der CLI. Es werden keine direkten Änderungen am LIEUVA-Produkt ausgelöst, bevor ein freigegebener lokaler Auftrag ausdrücklich gestartet wird.

## Grenzen

- Die Tagesübersicht ist verfügbar, wenn die lokale Maschine und der Server laufen; es gibt keine Hintergrundinstallation oder E-Mail-Zustellung.
- Webrecherche verwendet je nach Agent `live`, `cached` oder `disabled`. Fehlender Zugriff erscheint als fehlgeschlagener Lauf oder wird im Bericht gekennzeichnet.
- Die Qualität der Empfehlungen hängt von Quellen und Eingaben ab. Der Master soll alte Berichte datieren und fehlende Nutzer- oder Analytics-Daten offenlegen.
- Nach einer lokalen Codeausführung müssen der neue Worktree, der Diff und die in `AGENTS.md` verlangten Prüfergebnisse vor einer Übernahme betrachtet werden.
