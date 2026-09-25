# LIEUVA — Sculpture Pavilion / Future Nature

> Ursprüngliches Entwurfsbriefing. Der [Showcase-Vertrag](../README.md) beschreibt den aktuellen Build, Export und Browserstand; die unten genannten fehlenden `.blend`/GLB-Dateien beziehen sich nur auf den damaligen Paketstand.

## Ziel
Drei zusammenhängende, begehbare Ausstellungsräume für fünf originale Skulpturen. Helle organische Architektur, weißer Mineralputz, heller Terrazzo, Travertin und Tageslicht von oben. Das Paket dient dem späteren Nachbau mit Codex/Astra in Blender. Es enthält fotorealistische KI-Referenzen, noch keine .blend-, STEP- oder GLB-Datei.

## Verbindliche Quellen
1. `planning/layout.json` und die drei technischen Pläne: Maße, Platzierungen, Öffnungen, Bauteilzahlen, Kameras.
2. `sculptures/Sxx/HERO.png`: Identität und Silhouette jedes Werkes.
3. Ergänzende Skulpturansichten: Rückseiten, Profile, obere und untere Details.
4. Raumansichten: Atmosphäre, Material, Licht und ungefähre Perspektive.

Die Bilder sind einzeln generierte Entwurfsansichten, keine metrisch konsistenten Aufnahmen einer bereits gebauten Szene. Einzelne Türpositionen, Blattformen, Wurzelverzweigungen und Größen können variieren. Die technische Planung löst diese Widersprüche. Insbesondere erfundene Pflanzen und zusätzliche Objekte, die in Nachbarräumen einzelner Bilder erscheinen, NICHT übernehmen. Genau fünf Werke bauen. Für eine exakte Rundumansicht später alle Kameras aus derselben Blender-Szene rendern.

## Architektur
Meter; X Ost, Y Nord, Z oben. Boden überall Z=0, keine Stufen. Raummaße sind Innenmaße. Die Hülle entsteht aus der Vereinigung der Grundflächen und Verbindungspolygone; Wandstärke 0,30 m außerhalb der Innenkontur. An Durchgängen keine Wand stehen lassen. Der Rundgang ist A → B → C → A, nicht eine lineare Raumfolge.

| Bereich | Form und Lage | Decke / Licht |
|---|---|---|
| A — Sculpture Atrium | Ellipse 20 × 16 m, Zentrum (0,0) | Flach Z=8 m; zentrale verglaste Ellipse 6 × 4 m |
| B — Glass Gallery | 14 × 12 m, Zentrum (17,0), Eckenradius 3 m | Flach Z=5 m; einziges Lichtband X13..21 / Y4,8..5,4 |
| C — Kinetic Hall | 24 × 10 m, Zentrum (8,15), Eckenradius 3 m | Tonne z=7−0,04(y−15)²; 6 m Rand, 7 m Mitte |

C hat sechs Querrippen bei X=−1,3,7,11,15,19 und fünf verglaste Dachschlitze bei X=0,4,8,12,16; je 0,6 m breit, Y12..18. Nord-, Ost- und Westwand von C geschlossen; beide Durchgänge an der Südseite. Sämtliche Fassaden bleiben ohne Fenster. Verglaste Öffnungen nur im Dach.

Verbindungen: AB X7..13 / Y−2..2 / H4,2; AC X1,5..5,5 / Y6..12 / H4,5; BC X15..19 / Y4..12 / H4,5. Freie Breite jeweils 4 m. Laibungen weich verrundet, Radius etwa 0,4 m. Eingang X−13..−8 / Y−1,5..1,5 / H3,5 mit geschlossener bündiger Tür am westlichen Ende. Keine Außenlandschaft erforderlich. Die ungenutzte Fläche zwischen den drei Räumen nicht zu einem vierten Raum machen.

## Wand- und Öffnungsplan
Die Himmelsrichtung bezeichnet die jeweilige Begrenzung, nicht die Kameraposition. Bei den gekrümmten Wänden werden Öffnungen an der Schnittfläche mit dem Verbindungspolygon ausgespart.

| Raum | Nord | Ost | Süd | West |
|---|---|---|---|---|
| A | AC-Durchgang, X1,5..5,5 | AB-Durchgang, Y−2..2 | Geschlossene Kurve | Eingang, Y−1,5..1,5 |
| B | BC-Durchgang, X15..19 | Geschlossene Wand | Geschlossene Wand | AB-Durchgang, Y−2..2 |
| C | Geschlossene Wand | Geschlossene Wand | AC bei X1,5..5,5 und BC bei X15..19 | Geschlossene Wand |

## Exponate
Alle Dimensionen lokal vor Z-Rotation. Ursprung mittig unten; S04 hat den Ursprung im Zentrum der Glasform. Standfüße gehören zur Skulptur; zusätzliche niedrige Architektursockel nur einmal ausführen.

| ID | Werk | XYZ-Abmessungen | Weltposition / Z-Rotation |
|---|---|---|---|
| S01 | Rooted Silence | 2 × 1,85 × 3,2 m | (1,0,0,18) / −90°; Gesicht nach Westen |
| S02 | Tidal Bronze | 1,45 × 1,25 × 2,45 m | (−3,4,0,15) / 30° |
| S03 | Growth Fold | 1,3 × 1,2 × 2,2 m | (−3,−4,0,15) / −30° |
| S04 | Aerial Bloom | 3,6 × 2,8 × 2,4 m | (17,0,3) / 0°; Unterkante 1,8 m |
| S05 | Gentle Engine | 7 × 3,4 × 3,2 m | (8,15,0,18) / 0°; Nase nach Westen |

S01: ruhiger Steinkopf, sieben große Wurzeln auf anatomisch linker Seite, rechts glatte Wange. S02: drei Bronzebänder, zwei große negative Räume. S03: fünf kontinuierlich verbundene Holzlappen. S04: zwölf Glasblätter, sechs bernsteinfarbene innen und sechs salbeigrüne außen, zentraler Samen, drei Kabel. S05: acht Rippen, acht Beine in vier Paaren, zwei Flügel. Bauteilzahlen bleiben unabhängig von Bildabweichungen fest. Die einzelnen `MODELING.md` beschreiben den Aufbau.

## Materialien und Licht
- Putz: warmes Kalkweiß, feine Porigkeit, geringe Rauheitsvariation, sanfte Kanten.
- Boden: heller warmer Terrazzo, kleine Zuschläge, seidenmatt mit kontrollierter Spiegelung. Keine perfekte Spiegelfläche.
- Bank: Travertin, Zentrum (21,−3,0,21), Maße 2,4 × 0,65 × 0,42 m, leicht gebogen.
- Stein: reale Porigkeit, Displacement nur für Nahaufnahmen; Wurzelhohlräume als echte Geometrie.
- Bronze: physikalisch metallisch, Satinfinish, sparsame grüne Patina in Vertiefungen.
- Holz: helle Esche, Maserung entlang der Form, kein Walnussholz.
- Glas: geschlossene Geometrie mit realer Wandstärke; Bernstein und Salbei, plausible Transmission und Brechung. Halterungen sichtbar modellieren.
- Dachlicht ergänzt durch diskrete Museumsspots etwa 3500 K. Lichter so setzen, dass Konturen lesbar bleiben und Weiß nicht ausbrennt.

## Umsetzung
1. Hüllen, Dachöffnungen, Durchgänge und grobe Exponatvolumen maßstäblich aufbauen. Den Rundgang mit 1,65–1,75 m Augenhöhe testen.
2. Eine Collection pro Werk; zuerst Silhouette und Durchblicke, danach Details. Kein Foto einer Skulptur auf eine flache Ebene kleben.
3. Alle Materialien konsistent als Bibliothek anlegen. Details gezielt über Geometrie, Normalmaps und passende UVs ausarbeiten.
4. S05 mit separaten Gelenken bauen. Dezente stationäre 12-Sekunden-Schleife: Flügel ungefähr ±8°, Beine ±6°, phasenversetzt. Das ist eine Kunstanimation, keine ingenieurmäßig geprüfte Laufmechanik.
5. Die 30 Zielkameras aus JSON anlegen. SW/SE/NE/NW bezeichnen Umfangsperspektiven; A hat keine geometrischen Ecken. WALL-N bedeutet Blick auf die Nordwand. Senkrechte Ansichten mit Nord oben ausrichten. Für eine freie Deckenprüfung Exponate in einer separaten View Layer ausblenden.
6. S04 nicht als Durchlauf unter den niedrigsten Blättern planen; rundherum gehen. Sockel und Skulpturen dürfen keinen Übergang blockieren.
7. Eine konsistente finale Szene speichern, Texturen relativ oder gepackt. Daraus Raum- und Objektkameras rendern. Erst anschließend Browserexport und LIEUVA-Anbindung vorbereiten.

## Qualität und Abnahme
Hochwertige Offline-Render und späteren Browserexport getrennt optimieren. Ziel für finale Bilder: 3840 × 2160, ausreichende Samples, kontrolliertes Denoising; tatsächliche Renderzeit nach Szene und Hardware. Das ist eine Zielvorgabe für Blender, keine Behauptung über die Pixelzahl der beigefügten KI-Bilder.

Genau drei Räume, drei interne Verbindungen, fünf Werke. Objekte und Topologie bleiben zwischen Kameras unverändert. Keine zufälligen zusätzlichen Kunstwerke oder Fassadenfenster. Kein Durchgang blockiert. Prüfen: Glashalterungen, Beinanzahl, Flügelansatz, Wurzelübergänge, negative Räume und Sockelhöhen. Keine groben Platzhalter als fertige Skulpturen deklarieren.

## Bilddateien
Originale PNG-Ausgabe ohne künstliche Hochskalierung. `asset-index.json` nennt die tatsächlichen Pixelmaße und Prüfsummen. Die Bilder sind keine echten Blender-Render. `index.html` ist eine lokale Galerie zum Durchblättern. `generation-prompts.json` dokumentiert die verfügbaren Prompts; bei wiederhergestellten Bildern ist ausdrücklich vermerkt, wenn der ursprüngliche Prompt nicht mehr vorliegt.
