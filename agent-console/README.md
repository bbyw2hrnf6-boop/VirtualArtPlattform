# LIEUVA Agentenzentrale

Lokales Arbeitsinstrument für die Entscheidungsvorbereitung. Die sieben Agenten stehen in [`config.json`](./config.json); dort und in der Oberfläche sind Auftrag, Modell, Reasoning, Websuche, Aktivierung und Rhythmus änderbar. Die jeweils gespeicherten Werte gelten für den nächsten Lauf.

## Start

Node 22 und eine angemeldete Codex-CLI werden benötigt. Auf macOS [`start.command`](./start.command) doppelklicken oder im Projektordner `npm run agents:dashboard` ausführen. Die Oberfläche öffnet unter <http://127.0.0.1:43821/>. [`index.html`](./index.html) lässt sich direkt als HTML-Datei öffnen; bei laufendem Server leitet sie zur interaktiven Oberfläche weiter, sonst zeigt sie die Rollen und den Startweg. Der lokale Server bleibt aktiv, bis das Terminal mit `Ctrl+C` beendet wird.

Bei einem anderen CLI-Pfad kann `CODEX_BIN=/absoluter/pfad/zum/codex npm run agents:dashboard` verwendet werden. Der Port lässt sich mit `AGENT_CONSOLE_PORT` ändern; beim direkten Öffnen der HTML-Datei gilt der Standardport 43821.

## Ablauf

1. **Tagesbriefing starten** führt fällige Spezialisten aus und danach den Master. **Alle Spezialisten neu prüfen** erzwingt einen frischen vollständigen Lauf. Einzelne Agenten lassen sich jederzeit manuell starten.
2. Spezialisten recherchieren lesend. Der Master verdichtet ihre Berichte zu höchstens drei konkreten Tagesaufgaben. **Deine drei Aufgaben heute** stehen auf Übersicht und Aufgabenseite oben; weitere Vorschläge bleiben darunter sichtbar. Master-Empfehlungen verlinken direkt auf die zugehörige Aufgabe. Bereits gestartete oder heute erledigte Aufgaben bleiben im Tagesfokus, auch wenn der Master seine Einschätzung aktualisiert.
3. Vorschläge lassen sich vor der Freigabe bearbeiten. **Freigeben** speichert die Entscheidung und zeigt die Aufgabe weiter im Überblick; **Ausführen** ist ein eigener Klick. **Überspringen** auf einer offenen Tageskarte bietet **Für später parken** oder **Verwerfen** mit optionalem Hinweis an den Master. Beide Entscheidungen entfernen die Aufgabe aus dem Tagesfokus; geparkte Aufgaben bleiben unter **Später** auffindbar. Wenn ein anderer offener Vorschlag geeignet ist, kann er in den frei gewordenen Tagesplatz nachrücken. Recherche bleibt lesend. Lokale Codearbeit läuft in einem neuen Codex-Worktree. Bei manuellen Aufgaben startet **Manuell starten** die Nachverfolgung; erst **Erledigt melden** mit einer kurzen Ergebnisnotiz hakt sie für heute ab. Externe Kontaktaufnahme, Veröffentlichungen, Deployment, Live-Daten, Regeländerungen und Löschungen führt die Agentenzentrale nicht selbst aus.
4. Erledigte Aufgaben erscheinen mit Haken im Tagesfokus; zusätzliche Abschlüsse des Tages werden darunter angezeigt. Entscheidungen einschließlich Parken und Verwerfen sowie Ergebnisse fließen nach der Warteschlange automatisch in den nächsten Master-Abgleich ein, sofern **Master automatisch aktualisieren** aktiviert ist. Der Master soll verworfene Aufgaben nicht erneut empfehlen und geparkte Aufgaben erst nach Nutzerreaktivierung wieder in den Tagesfokus nehmen. Sein Status und letzter Abgleich stehen auf der Übersicht. Ein abgeschlossener Code-Lauf bedeutet noch keine Übernahme seines Worktrees oder Veröffentlichung.
5. **Läufe** zeigt Warteschlangenposition, Laufzeit, letzten Arbeitsschritt und letzte CLI-Ausgabe, Prozessstatus, Bericht, Tokenzahlen soweit verfügbar und das lokale Codex-Protokoll. Nach längerer Zeit ohne neuen Arbeitsschritt erscheint ein Hinweis; ein aktiver Prozess wird dadurch nicht automatisch beendet. Laufende und wartende Aufgaben können abgebrochen werden.

Der automatische Tageslauf ist auf 09:00 Uhr `Europe/Amsterdam` eingestellt. Er läuft, solange der Server offen ist. Beim nächsten Start wird ein für denselben Tag verpasster Lauf nachgeholt; ein zwischenzeitlicher Master-Abgleich ersetzt den Tageslauf nicht. Ein Wochenagent wird nur neu gestartet, wenn sein letzter erfolgreicher Bericht mindestens sieben Tage alt ist. Die Uhrzeit und Automatik sind unter **Einstellungen** änderbar.

Die Master-Zusammenführung wartet, bis die aktuelle Warteschlange abgearbeitet ist, bündelt nahe beieinander liegende Ergebnisse für 15 Sekunden und startet nur einmal pro neuem Ergebnisstand. Ihr Stand erscheint als **Master-Abgleich** auf der Übersicht. Automatische Zusammenführung und die Warnschwelle für fehlende CLI-Ausgabe sind unter **Einstellungen** änderbar. Ein fehlgeschlagener Masterlauf wird nicht endlos automatisch wiederholt; der nächste neue Ergebnisstand oder ein manueller Masterstart löst einen neuen Versuch aus.

Bei lokaler Codearbeit zeigt **Läufe → Details** den Pfad des separaten Worktrees, sobald die CLI eine Dateiänderung meldet. Den Pfad kannst du dort kopieren und den Worktree in [GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop) auswählen oder als lokales Repository öffnen. Die von Codex angelegten Worktrees stehen häufig auf `detached HEAD`; lege [vor einem Commit einen Branch an](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-branches-in-github-desktop). Commit, Merge und Übernahme in den Haupt-Checkout erfolgen bewusst durch dich nach der Prüfung.

Konfiguration liegt in `agent-console/config.json` und ist Teil des Repos. Laufdaten, Berichte und Protokolle liegen in `artifacts/agent-console/` und werden nicht in Git aufgenommen. Die Oberfläche bindet nur an `127.0.0.1` und benötigt keinen API-Schlüssel im Browser. Codex verwendet die lokale Anmeldung der CLI. Es werden keine direkten Änderungen am LIEUVA-Produkt ausgelöst, bevor ein freigegebener lokaler Auftrag ausdrücklich gestartet wird.

## Grenzen

- Die Tagesübersicht ist verfügbar, wenn die lokale Maschine und der Server laufen; es gibt keine Hintergrundinstallation oder E-Mail-Zustellung.
- Webrecherche verwendet je nach Agent `live`, `cached` oder `disabled`. Fehlender Zugriff erscheint als fehlgeschlagener Lauf oder wird im Bericht gekennzeichnet.
- Die Qualität der Empfehlungen hängt von Quellen und Eingaben ab. Der Master soll alte Berichte datieren und fehlende Nutzer- oder Analytics-Daten offenlegen.
- Nach einer lokalen Codeausführung müssen der neue Worktree, der Diff und die in `AGENTS.md` verlangten Prüfergebnisse vor einer Übernahme betrachtet werden.
- Für `--worktree` lädt die Codex-CLI die lokale Benutzerkonfiguration; sie verbietet gleichzeitig `--ignore-user-config`. Die Agentenzentrale setzt Modell, Reasoning, Websuche, Sandbox und Freigabepolitik für jeden Lauf ausdrücklich.
