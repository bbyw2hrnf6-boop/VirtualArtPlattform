# OBSIDIAN — drei zusammenhängende Galerieräume

## Ziel und verbindliche Grundlage

Eine hochwertige, begehbare LIEUVA-Kunstausstellung mit drei linear verbundenen Räumen. Dunkler Stein, Walnussholz, klare Architektur und dramatisch beleuchtete originale KI-Kunst mit Naturbezug. **Keine Fenster, keine Oberlichter, kein Tageslicht.**

`layout.json` und `plan.svg` bestimmen die Geometrie. Die generierten Raumansichten zeigen Gestaltung, Atmosphäre und Materialwirkung; sie können in Details voneinander abweichen. Solche Unterschiede nicht zu widersprüchlicher Geometrie kombinieren. Erst die feste Szene modellieren, anschließend die definierten Kameras in derselben Szene rendern. So entsteht eine wirklich konsistente Bildserie.

Der neue Drei-Raum-Plan ersetzt den früheren Grundriss mit einem einzelnen 14 × 10 m großen Raum. Vorhandene Einzeldateien der Kunst werden weiterverwendet und neu platziert.

## Raumgeometrie

Alle Maße sind Meter. X = Osten, Y = Norden, Z = oben. Ursprung ist die südwestliche Ecke bei fertiger Bodenhöhe. Die Maße beschreiben die sichtbaren architektonischen Bezugsebenen; konstruktive Wandstärke ist nicht festgelegt. Beim Ergänzen einer Wandrückseite die Innenflächen, freien Öffnungen und Kunstpositionen unverändert lassen.

| Raum | X-Bereich | Y-Bereich | Grundmaß | Decke |
|---|---|---|---|---|
| R1 · Botanical Origins | 0–12 | 0–8 | 12 × 8 | Z = 4,50 |
| R2 · Living Matter | 12–22 | 0–8 | 10 × 8 | Z = 4,50 |
| R3 · Future Nature | 22–34 | 0–8 | 12 × 8 | Z = 4,50 |

- Gesamtanlage: 34 × 8 m, einheitliche Bodenhöhe Z = 0.
- P1 bei X = 12 und P2 bei X = 22 verbinden die Räume. Beide Öffnungen verlaufen von Y = 2,50 bis 5,50 und Z = 0 bis 3,20: **3,00 m breit, 3,20 m hoch, rechteckig, offen, ohne Tür und ohne Rundbogen**. Laibungen in dunklem Walnussholz.
- Der Haupteingang liegt an der Westwand X = 0 in R1, von Y = 3 bis 5. Geschlossene, bündige Walnuss-Doppeltür: 2,00 m breit und 2,80 m hoch, zwei jeweils 1 m breite Flügel. Keine sichtbare Außenansicht.
- An jedem Durchgang setzt sich das 1-m-Bodenraster ohne Schwelle fort.
- Pro Raum genau eine Bank entlang X: 3,20 × 0,75 × 0,45 m einschließlich Sitzpolster. Mittelpunkte in XY: R1 (6,4), R2 (17,4), R3 (28,4). Walnussbasis, taupefarbenes Leder.

## Material und Licht

Wände: matter anthrazitfarbener Mineralputz. Die kurzen Ost-/Westwände erhalten Akzente aus dunklem Walnussholz, vor allem um Eingang und Portale; keine Lamellen vor Kunstflächen. Boden: schwarzer, seidenmatt geschliffener Kalkstein, 1 × 1 m Platten, feine 2-mm-Fugen und dezente helle Mineraladern; Rasterursprung (0,0). Kein spiegelnder, nasser Marmoreffekt. Flache, geschlossene anthrazitfarbene Decken. Sockelleiste aus dunkler Bronze, 0,10 m hoch; an Öffnungen unterbrechen. Kunst mit schmalen 20-mm-Bronzerahmen.

Verdeckte umlaufende Lichtvoute je Raum, 2700 K. Zurückhaltende schwarze Museumsschienen und gezielte Kunst-Spots, 3000 K. Kunst klar ausleuchten, Spitzlichter nicht ausbrennen lassen; im Raum bleiben kontrollierte dunkle Bereiche. Leuchtenanzahl und Leistung nach Bildwirkung abstimmen. Keine Fenster, Oberlichter oder als Tageslichtöffnungen wirkenden Deckenfelder ergänzen.

## Kunst und verbindliche Platzierung

Die elf Kunstwerke sind eigene KI-Bilder mit Naturbezug. Texturen direkt aus `artworks/` verwenden; nicht aus Perspektivansichten ausschneiden oder anhand einer Raumansicht nacherfinden. Bildmitte immer Z = 1,80 m. Die untenstehenden Mittelpunkte liegen auf der Wandbezugsebene; Bildflächen 0,03 m in den Raum versetzen. Angegebene Größen sind reine Bildflächen, der 0,02-m-Rahmen kommt außen hinzu.

| ID | Werk | Raum / Wand | Mittelpunkt (X,Y,Z) | Bildbreite × Höhe | Datei |
|---|---|---|---|---|---|
| A01 | Canopy of Tomorrow | R1 / Nord | (6, 8, 1.8) | 3.6 × 2.4 m | `artworks/A01.png` |
| A02 | Mycelium Intelligence | R1 / Süd | (3, 0, 1.8) | 1.6 × 2.2 m | `artworks/A02.png` |
| A03 | Glass Fern | R1 / Süd | (9, 0, 1.8) | 1.6 × 2.2 m | `artworks/A03.png` |
| A04 | Seed of Light | R1 / West | (0, 6.5, 1.8) | 1.6 × 1.6 m | `artworks/A04.png` |
| B01 | Tidal Memory | R2 / Nord | (17, 8, 1.8) | 3.6 × 2.4 m | `artworks/B01.png` |
| B02 | Terra Bloom | R2 / Süd | (15, 0, 1.8) | 1.6 × 2.2 m | `artworks/B02.png` |
| B03 | Rooted Consciousness | R2 / Süd | (19, 0, 1.8) | 1.6 × 2.2 m | `artworks/B03.png` |
| B04 | Living Stone | R3 / Ost | (34, 4, 1.8) | 2.4 × 2.4 m | `artworks/B04.png` |
| C01 | Symbiotic Horizons | R3 / Nord | (28, 8, 1.8) | 3.6 × 2.4 m | `artworks/C01.png` |
| C02 | Nocturnal Orchid | R3 / Süd | (25, 0, 1.8) | 1.6 × 2.2 m | `artworks/C02.png` |
| C03 | Breathing Coral | R3 / Süd | (31, 0, 1.8) | 1.6 × 2.2 m | `artworks/C03.png` |

A01–A04 und B01–B04 werden aus dem vorhandenen Obsidian-Paket übernommen; ihre ursprünglichen Dateiquellen stehen zusätzlich in `source_texture_path`. Die Dateien gehören im fertigen Paket zusammen mit C01–C03 in `artworks/`.

## Vollständige Referenzserie: 30 Kameras

Die vier Eckkameras jedes Raumes liegen 1 m von den angrenzenden Wänden entfernt, Augenhöhe 1,65 m. Blick jeweils zur diagonal gegenüberliegenden Ecke. Startbrennweite 22 mm auf 36-mm-Sensor; bei Bedarf die Brennweite anpassen, ohne die Geometrie zu ändern. Vertikalen gerade halten. Die Bank des jeweiligen Raumes bleibt sichtbar, soweit sie im Sichtfeld liegt. Alle drei Bänke behalten über sämtliche Ansichten ihre festen Positionen und Ausrichtungen.

Die vier Wandansichten je Raum sind orthografische Prüfansichten: vollständige Wand mit Boden- und Deckenanschluss, Kunst, Portalen beziehungsweise Tür. Augenhöhe hier bewusst 2,25 m zur unverzerrten Wandmittendarstellung. In den regulären Wandansichten bleibt die Bank sichtbar: bei Blick nach Nord/Süd von der langen Seite, bei Blick nach Ost/West von der kurzen Stirnseite. Optional in einer zusätzlichen Prüf-View-Layer Möbel und gegebenenfalls verdeckende Gegenwände ausblenden, um ein freies Wand-Overlay zu erhalten. Nichts aus der Hauptszene löschen.

Die definierten Blender-Decken- und Bodenprüfansichten sind ebenfalls orthografisch. Das vollständige jeweilige Rechteck muss im Bild liegen; die horizontal angegebene Bildfeldbreite beträgt Raumlänge plus 2 m. Das Seitenverhältnis entspricht der Raumlänge zu 8 m. Die regulären Raum- und Bodenübersichten zeigen die Bank an ihrer festen Position. Für zusätzliche freie Blender-Prüf-Layer können Bänke ausgeblendet werden, um auch die Bodenfläche darunter vollständig zu kontrollieren. Die Decken-/Bodenkameras in JSON beschreiben diese freien Prüf-Layer; sie sind Zielvorgaben für spätere Blender-Render und keine Behauptung über verdeckte Flächen in der vorhandenen KI-Bildserie. Auf der Decken-Unteransicht liegt Nord oben, Ost links; beim Blick auf den Boden liegt Nord oben, Ost rechts. Diese Spiegelung ist bei einer Unteransicht geometrisch korrekt.

| Kamera | Position (X,Y,Z) | Blickziel (X,Y,Z) | Projektion / Bildfeld |
|---|---|---|---|
| R1-SW | (1, 1, 1.65) | (11, 7, 1.65) | Perspektive, Start 22 mm |
| R1-SE | (11, 1, 1.65) | (1, 7, 1.65) | Perspektive, Start 22 mm |
| R1-NE | (11, 7, 1.65) | (1, 1, 1.65) | Perspektive, Start 22 mm |
| R1-NW | (1, 7, 1.65) | (11, 1, 1.65) | Perspektive, Start 22 mm |
| R1-WALL-N | (6, 0.7, 2.25) | (6, 8, 2.25) | Ortho, 13 × 5.5 m |
| R1-WALL-E | (0.7, 4, 2.25) | (12, 4, 2.25) | Ortho, 9 × 5.5 m |
| R1-WALL-S | (6, 7.3, 2.25) | (6, 0, 2.25) | Ortho, 13 × 5.5 m |
| R1-WALL-W | (11.3, 4, 2.25) | (0, 4, 2.25) | Ortho, 9 × 5.5 m |
| R1-CEILING | (6, 4, 0.3) | (6, 4, 4.5) | Ortho, 14 × 9.33333 m |
| R1-FLOOR | (6, 4, 4.3) | (6, 4, 0) | Ortho, 14 × 9.33333 m |
| R2-SW | (13, 1, 1.65) | (21, 7, 1.65) | Perspektive, Start 22 mm |
| R2-SE | (21, 1, 1.65) | (13, 7, 1.65) | Perspektive, Start 22 mm |
| R2-NE | (21, 7, 1.65) | (13, 1, 1.65) | Perspektive, Start 22 mm |
| R2-NW | (13, 7, 1.65) | (21, 1, 1.65) | Perspektive, Start 22 mm |
| R2-WALL-N | (17, 0.7, 2.25) | (17, 8, 2.25) | Ortho, 11 × 5.5 m |
| R2-WALL-E | (12.7, 4, 2.25) | (22, 4, 2.25) | Ortho, 9 × 5.5 m |
| R2-WALL-S | (17, 7.3, 2.25) | (17, 0, 2.25) | Ortho, 11 × 5.5 m |
| R2-WALL-W | (21.3, 4, 2.25) | (12, 4, 2.25) | Ortho, 9 × 5.5 m |
| R2-CEILING | (17, 4, 0.3) | (17, 4, 4.5) | Ortho, 12 × 9.6 m |
| R2-FLOOR | (17, 4, 4.3) | (17, 4, 0) | Ortho, 12 × 9.6 m |
| R3-SW | (23, 1, 1.65) | (33, 7, 1.65) | Perspektive, Start 22 mm |
| R3-SE | (33, 1, 1.65) | (23, 7, 1.65) | Perspektive, Start 22 mm |
| R3-NE | (33, 7, 1.65) | (23, 1, 1.65) | Perspektive, Start 22 mm |
| R3-NW | (23, 7, 1.65) | (33, 1, 1.65) | Perspektive, Start 22 mm |
| R3-WALL-N | (28, 0.7, 2.25) | (28, 8, 2.25) | Ortho, 13 × 5.5 m |
| R3-WALL-E | (22.7, 4, 2.25) | (34, 4, 2.25) | Ortho, 9 × 5.5 m |
| R3-WALL-S | (28, 7.3, 2.25) | (28, 0, 2.25) | Ortho, 13 × 5.5 m |
| R3-WALL-W | (33.3, 4, 2.25) | (22, 4, 2.25) | Ortho, 9 × 5.5 m |
| R3-CEILING | (28, 4, 0.3) | (28, 4, 4.5) | Ortho, 14 × 9.33333 m |
| R3-FLOOR | (28, 4, 4.3) | (28, 4, 0) | Ortho, 14 × 9.33333 m |

Für Blender: Kameralängsachse lokal −Z, lokales +Y als Bildoberkante. `world_up_xyz` und `sensor_fit` aus JSON beachten. Bei orthografischen Ansichten horizontalen Sensor-Fit verwenden und Auflösung nach `render_aspect_ratio` setzen; anschließend prüfen, dass die in Metern angegebenen Bildfelder tatsächlich vollständig sichtbar sind.

## Aufbau in Blender

1. Meterskalierung setzen. Drei Raumhüllen mit den festen Bezugsebenen erstellen; Portale und Eingang exakt positionieren. Zunächst einfache Materialien und die angegebenen Kameras verwenden.
2. In den drei R1/R2/R3-Wand- und Draufsichten Öffnungen, Art-IDs, Abmessungen und Bänke gegen den Plan prüfen. Freie Verbindung durch beide Portale gewährleisten.
3. Einzelne Kunstdateien als korrekt ausgerichtete Bildflächen einbinden, Bronze-Rahmen ergänzen. Bildseitenverhältnisse erhalten; keine starken Zuschnitte oder Verzerrungen.
4. Kalkstein, Mineralputz, Walnuss und Bronze mit realen Maßstäben, zurückhaltendem Bump und plausibler Rauheit ausarbeiten. Anschließend Vouten und Spots hinzufügen.
5. Eine einzige finale Szene verwenden und daraus alle 30 Kameras rendern. Separate Prüf-View-Layer für vollständige Wände, Decken und Böden anlegen. Architektur und Kunst bleiben über alle Render unverändert.
6. Finale `.blend`-Datei mit relativen beziehungsweise gepackten Texturen speichern. Referenzbilder nach Kamera-ID benennen, beispielsweise `R2-NE.png` und `R3-CEILING.png`. Den begehbaren Webexport danach als eigene Optimierungsaufgabe behandeln; die hier erzeugten Bilder ersetzen noch kein 3D-Modell.

Der Zweck dieses Pakets ist eine nachvollziehbare Rekonstruktionsvorlage. Photorealistische KI-Bilder allein garantieren keine metrisch konsistente Rundumaufnahme; die feste Geometrie und Kameraliste schließen diese Lücke.
