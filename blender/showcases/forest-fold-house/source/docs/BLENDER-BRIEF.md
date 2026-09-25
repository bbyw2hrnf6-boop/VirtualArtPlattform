# Blender-Briefing - Forest Fold House

> Ursprüngliches Entwurfsbriefing. Für den aktuellen Build, Export und Browserstand zuerst den [Showcase-Vertrag](../../README.md) lesen; frühere Zukunftsaussagen gelten nur für den damaligen Paketstand.

## Ziel

Ein vollständig begehbares, möbliertes Architektur-Showcase für LIEUVA. Das Ergebnis soll aus Besucherperspektive wie ein sorgfältig fotografiertes kleines Architektenhaus wirken. Zwei Ebenen, zwei Flügel, eine Brücke; visuelle Größe und Grundriss beibehalten.

## Autorität und Maßstab

1. `data/scene.json`: Geometrie, Höhen, Öffnungen, Wege und Treppe.
2. `plans/*.svg`: daraus abgeleitete Pläne, Schnitte, Fassaden und Decken.
3. `data/furniture.json`, `data/materials.json` und dieses Briefing.
4. `images/`: Licht, Stimmung, Oberflächen und Detailwirkung.

Alle Maße in Metern. X = Osten, Y = Norden, Z = oben. L0 ist fertiger Boden 0,00; L1 ist +3,40. 1 Blender-Einheit = 1 m. Die Bilder sind keine geometrisch kalibrierte Fotogrammetrie-Serie. Wand-, Möbel- und Pflanzenpositionen können variieren. Solche Abweichungen nach dem Plan lösen; nicht mehrere widersprüchliche Bildgrundrisse kombinieren.

## Modellierfolge

1. **Maßmodell:** Außenkonturen, fertige Böden, Wände, Dach, Treppenöffnung, Brücke, Gelände, Teich und trockenen Weg erstellen. U-Treppe tatsächlich begehbar machen. Zunächst einfache Materialien.
2. **Raumkontrolle:** Alle Wege mit 1,70 m Augenhöhe ablaufen. Vom Eingang ohne Hindernisse ins Atelier, Schlafzimmer, Bad, Wohnzimmer und in die Wasserlounge gelangen. Türdurchgänge und Treppen nicht durch Decken, Möbel oder Pflanzung verschließen.
3. **Architektur:** Öffnungen exakt aus dem Datensatz schneiden. Rahmen, Leibungen, Türblätter, Schattenfugen, Dachränder und Geländer modellieren. Die Brücke bekommt eine normale Eichenbodenplatte; der Fußboden ist nicht transparent. Oberhalb und seitlich Glas.
4. **Innenausbau:** Küche und Stauraum als feste Einbauten. Schlafzimmer mit Bett, Nachttischen, Garderobe und Lesesessel. Kompaktes Duschbad ohne Badewanne. Studio mit Arbeitstisch, Modell, Plänen, Regal und Lesesessel. Lounge mit niedrigem Sofa, Tisch, Büchern und wenigen Keramiken.
5. **Materialien:** Erst reale Texturskalierung und saubere UVs, dann Mikrodetails. Gneisplatten und Risse dürfen nicht mehrere Meter groß werden. Eichenmaserung folgt dem Bauteil. Jede sichtbare harte Kante erhält eine passende kleine Rundung.
6. **Natur und Wasser:** Einzelne Hero-Bäume, wenige sorgfältig komponierte Felsen, modulare Pflanzgruppen. Freie Sicht vom Studio zum Wasserhof erhalten. Weiß/violett blühende Pflanzen in kleinen Gruppen, keine gleichmäßige Blumenwand. Wasser mit sichtbarem flachem Boden und sehr kleinen Wellen. Kein Wasser in begehbaren Bereichen.
7. **Licht:** Drei abgestimmte Zustände: warmer Nachmittag, weiches Tageslicht, blaue Stunde. Sonne und Himmelslicht nachvollziehbar halten. Innen 3000 K als Gestaltungsziel, Außenwege 2700 K. Die Räume müssen auch bei neutralem Tageslicht hochwertig aussehen.
8. **Qualitätsrender:** Feste Kameras aus `data/cameras.json` anlegen. Erst 1920 x 1080 Kontrollbilder, später 3840 x 2160 finale Renderings aus derselben konsistenten Szene. Generierte PNGs im Paket haben ihre tatsächlich dokumentierte Originalauflösung; sie sind keine bereits vorhandenen 4K-Blender-Renderings.
9. **Browser-Version:** Aus dem freigegebenen Master eine eigene Echtzeitfassung ableiten. Fernwald vereinfachen, Pflanzen instanzieren, verdeckte Geometrie entfernen, Materialanzahl senken, Licht dort backen, wo es sinnvoll ist. Detaillierte Masterdatei erhalten. Dateigröße, Speicher, Ladezeit und FPS auf realem Smartphone und Laptop messen. Keine Qualität oder Bildrate aus den Konzeptbildern ableiten.

## Sammlungen und Benennung

`00_REFERENCE`, `01_TERRAIN`, `02_SHELL_W`, `03_SHELL_E`, `04_BRIDGE`, `05_STAIRS`, `06_JOINERY`, `07_FURNITURE`, `08_PLANTING`, `09_WATER`, `10_LIGHTS`, `11_CAMERAS`, `12_COLLIDERS`.

Namen z.B. `W_L0_WALL_N`, `E_L1_WINDOW_S`, `BR01_FLOOR`, `ST01_FLIGHT_A`, `F17_ARCHITECT_DESK`. Pro Objekt sinnvolle Ursprünge, angewendete Skalierung vor Export, saubere Normalen und Materialien.

## Details, die den Unterschied machen

- Rahmen mit echter Tiefe und sinnvoller Glasstärke; transparente Flächen nicht als helle Löcher rendern.
- Gardinen und Kissen mit sichtbaren Säumen und zurückhaltenden Falten.
- Möbelmaßstab anhand Bett 1,80 x 2,00 m, Tischhöhe 0,75 m und Küchenhöhe 0,91 m kontrollieren.
- Fußleisten bündig oder als Schattenfuge; keine Standardleisten auf jede Fläche kleben.
- Steinplatten unten 0,60 x 1,20 m, Fugen ca. 2 mm. Oben Eichenbretter ca. 0,16 m breit.
- Dachkanten mit Substrat, Rücksprung und verdecktem Ablauf; Vegetation hat einen realen Ursprung.
- Fels trifft Sockel kontrolliert. Pflanzen dürfen nicht durch Glas oder Möbel wachsen.
- Geländer an offenen Treppen und Absturzkanten, auch wenn sie in einzelnen KI-Bildern fehlen.
- Lounge: teilweise eingegraben, aber trockener Innenraum und Verglasung oberhalb des Teichs.

## Abnahme für das digitale Modell

- Exakt zwei Ebenen und eine obere Brücke; Fläche und Hauptmaße entsprechen `scene.json`.
- Ein kohärenter Grundriss in allen Kameras. Rückansichten dürfen keine spiegelverkehrten Flügel erzeugen.
- Türen, Treppen, Wege und Möblierung funktionieren zusammen.
- Alle sichtbaren Wand-, Boden- und Deckenflächen sind materialisiert.
- Keine zusätzlichen Räume, dritte Etage oder erfundene Unterwasserlounge.
- Finaler Walkthrough aus der echten Szene, separat dokumentierter Test der Browserfassung.

Die angegebenen Wand-/Deckendicken sind Modelliermaße für das Showcase. Sie sind keine Bemessung von Tragwerk, Abdichtung oder Gebäudetechnik.
