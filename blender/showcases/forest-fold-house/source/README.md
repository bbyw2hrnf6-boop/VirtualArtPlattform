# Forest Fold House - LIEUVA Architektur-Showcase

> Dieses Verzeichnis bewahrt das ursprüngliche Konzeptpaket. Die Aussagen zu noch fehlenden `.blend`/GLB-Dateien und späteren Renderings gelten für den damaligen Paketstand. Für den aktuellen Build, Export und Browserstand den [Showcase-Vertrag](../README.md) lesen.

Kompaktes Waldhaus als Mix aus Gravity Garden und Tidal Fault: zwei Ebenen, eine Glasbrücke, blühende Dachgärten, Wasserhof, möblierte Wohnräume und teilweise eingegrabene Lounge.

## Einstieg

1. `index.html` lokal im Browser öffnen: alle Bilder, Pläne und Dokumente.
2. `Forest-Fold-House-Konzept.pdf` durchblättern (41 Seiten).
3. `CODEX-START.md` als archivierten Startauftrag lesen; für Änderungen am bestehenden Showcase zuerst den [aktuellen Vertrag](../README.md) lesen.

## Inhalt

- 28 einzeln erzeugte Original-PNGs unter `images/`.
- 8 maßhaltige Konzeptpläne jeweils als PNG und editierbare SVG.
- `data/scene.json`: Maße, Raumhülle, Öffnungen, Treppe, Gelände und Wege.
- `data/materials.json`, `furniture.json`, `surfaces.json`, `cameras.json`.
- Konzept, Blender-Briefing, Oberflächenliste und dokumentierte Bildabweichungen.
- Vollständige Generierungsprompts und die zwei bereitgestellten Ausgangsbilder.

## Status und Auflösung

Die neuen Konzeptbilder wurden mit dem integrierten Bildgenerator erstellt. Sie sind keine Renderings einer bereits gebauten Blender-Szene. Tatsächliche Originalauflösungen stehen pro Datei in `data/asset-index.json` (die Bilder wurden nicht künstlich hochskaliert). Ziel für später in Blender erzeugte finale Renderings: 3840 x 2160 px.

Das Paket enthält das vollständige digitale Entwurfsbriefing, aber noch keine fertige .blend-, GLB- oder STEP-Datei und keine bautechnische Ausführungsplanung. Es enthält keine separaten PBR-Texturmaps. Geometrieabweichungen zwischen KI-Bildern werden anhand der Pläne aufgelöst.

## Festgelegter Umfang

173,40 m² rechnerische Brutto-Konzeptfläche einschließlich Brücke. Kein drittes Geschoss, kein vollwertiger Keller, kein Unterwasserzimmer. Untere Lounge auf +0,00 m, Hang rückseitig bis zur oberen Ebene. Oberer Boden +3,40 m. Größerer Flügel immer im Westen.

## Vorrang

`scene.json` > Pläne > Vorgaben/Möblierung > Bilder. Das gilt insbesondere für Lage von Türen, Kücheninsel, Bett, Treppe, trockenem Weg und Flügelorientierung.
