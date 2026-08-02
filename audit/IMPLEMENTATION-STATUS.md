# AURA – Umsetzungsstatus nach dem Audit

Stand: 2. August 2026. Dieser Bericht ergänzt den ursprünglichen Audit-Snapshot. Er trennt lokal umgesetzte Produktarbeit von Punkten, die Zugang zu Live-Infrastruktur, Vertragsdaten oder einer Produktentscheidung benötigen.

## Verifiziertes Ergebnis

- `npm run check`: grün; 62 Tests bestehen.
- Neue Scroll-/Licht-Regression über einen isolierten Headless-Chromium-Pipe-Lauf: 11/11 Assertions grün, neun eindeutige reversible Story-Phasen, anklickbare Kunst, Reduced Motion, sichtbarer WebGL-Fallback, Desktop- und Mobile-WebGL, fokussierbare Live-Besuchersteuerung, direkte Übergabe an die drei Raumkarten und keine unerwarteten Page-Errors.
- Aktuelle Browser-Regression: 13/13 Kernflüsse grün; zusätzliche Audit-Abschluss-Regression: 13/13 neue Editor-, Forum- und Danny-Flüsse grün. Keine neuen Console-Diagnosen.
- Lighthouse Mobile Landing: Performance 96, Accessibility 100, Best Practices 100, SEO 100; LCP 2,7 s, TBT 0 ms.
- Lighthouse Mobile Danny: Performance 86, Accessibility 100, Best Practices 100, SEO 100; LCP 3,8 s, TBT 100 ms.
- Danny Mobile: 1,44-MB-GLB statt 3,01 MB, zwei Meshopt-Worker, 7/7 Artwork-Hotspots, 27 Collider, 16 View-Anker, 8 Routen und erhaltene Metadaten.
- Editor-Regression: direkter Template-Refresh stellt den Entwurf wieder her; Arrange/Walk nutzt dasselbe Canvas; Kamera-Restore und Reset, ausgewähltes Werk als Walk-Start, Undo/Redo, Publish-Cover und Mobile-Bottom-Sheet sind geprüft.

Die Nachweise liegen unter [`audit/final/`](./final/), insbesondere in [`browser-qa.md`](./final/browser-qa.md), `browser-qa.json`, `audit-closure-qa.json`, `scroll-story-pipe-qa.json`, `lighthouse-home.json` und `lighthouse-demo.json`.

## Umgesetzt

### Glaubwürdigkeit und Homepage

- Eine reversible, scrollgebundene WebGL-Story zeigt in neun klaren Phasen Linie → Blueprint → Architektur → Atmosphäre → Kunst → Arrange → responsive Licht/Objekte → Walk Preview → echtes Live-Produkt. Kein Scroll-Hijacking; Reduced Motion und WebGL-Fallback sind vorhanden.
- Der Story-Endframe ist selbst begehbar, besitzt fokussierte WASD-/Touch-Steuerung und anklickbare Kunstinformationen. Direkt danach folgen die drei realen Raumkarten; diese und der Template-Picker öffnen sofort nutzbare Sandboxes mit drei dokumentierten Demo-Werken.
- Redundante Mission-/Prozessblöcke wurden entfernt; Hero und Scroll-Story führen ohne Wiederholung zum sichtbaren Produktbeweis.
- Die drei Template-Karten verwenden echte Captures aus demselben WebGL-Builder statt CSS-Konzeptgrafiken.
- Danny ist als echte Referenz-Case-Study gekennzeichnet; prozedurale Builder-Räume werden nicht mehr als Blender-Runtime ausgegeben.
- Discover zeigt Danny als stabile Referenz, wenn der Live-Community-Feed leer oder nicht erreichbar ist, und kennzeichnet den Live-Status ehrlich.
- Artist-, Galerie-, Museum- und Brand/Agency-Use-Cases, Pilotlogik, Trust-Block, FAQ sowie ein faktischer Daten-/Rechtehinweis sind vorhanden.
- robots.txt, sitemap.xml, Manifest, lokale Fonts samt Lizenztexten und überprüfte Asset-Provenienz wurden ergänzt.

### Editor und Publishing

- Versioniertes IndexedDB-Autosave pro Template, Saved/Saving/Error-Status, Recovery nach Refresh sowie Undo/Redo.
- Eine gemeinsame transaktionale Placement-Engine prüft Bounds, Wandöffnungen, Architektur, Nachbarwerke, rotierte Objekt-Footprints und Abstände. Abgelehnte Drags springen auf den gespeicherten Zustand zurück und erklären den Grund.
- 3-cm-Raster, Werte in Metern, exakte sichtbare Maße in Zentimetern, 1,75-m-Augenlinie, vier Rahmenoptionen, Lock/Hide, Focus/Duplicate sowie Links/Mitte/Rechts-Ausrichtung und gleichmäßiges Verteilen aller sichtbaren Werke einer Wand.
- Reset View stellt die Arrange-Komposition wieder her; beim Wechsel in Walk Preview wird ein ausgewähltes sichtbares Werk zum Startfokus.
- Echte Objektgrößen, Thumbnails und sichere freie Spawn-Positionen unterstützen die Objektplatzierung.
- Persistenter Renderer: Selection, Transform, Materialien, View- und Roof-Wechsel bauen das Canvas nicht neu auf.
- Eindeutige Hauptmodi Arrange und Walk Preview; Open roof/Preview ceiling bleiben sekundäre Arrange-Optionen. Touch-Pinch, Mobile Peek/Half/Full Bottom Sheet und ≥44-px-Primärziele sind umgesetzt.
- Pre-publish Review blockiert ungültige Geometrie, verlinkt zurück zum Problem, erklärt öffentliche Sichtbarkeit/Laufzeit und zeigt ein echtes Capture der aktuellen Raumkamera. Dieses Capture wird als Discover-/Share-Cover gespeichert.
- Der Publish-Client wartet stabil auf den Auth-Status, prüft die öffentlichen Rules vor dem ersten Write, bereinigt Teil-Writes, bettet lokale Demo-Assets sicher ein und hält öffentlichen Payload sowie Rules einschließlich Rahmenwahl synchron. Konfigurations-, Auth-, Domain-, Index-, Quota- und Netzwerkfehler bleiben als konkrete, verlustfreie Meldungen sichtbar.

### 3D-Räume und Besucheransicht

- White Cube, Nocturne und Grand Forum besitzen eigene Defaults, Architektur, Lichtstimmung, adaptive Qualität und echte Builder-Captures.
- Das Grand Forum besitzt einen aus dem prozeduralen Grundriss abgeleiteten Fünf-Zonen-Navigator als kompakte Minimap mit Raum-Jumps für Zentralachse und vier Seitengalerien.
- Kunst rendert über einen farbtreuen unlit/sRGB-Pfad; Raum-Albedo wird nicht mehr fälschlich zugleich als Bump-/Normal-/Roughness-Map benutzt.
- Walk nutzt 1,75 m Augenhöhe, Click-to-walk und Swept-AABB-Kollision; Overview besitzt keine Auto-Rotation, unterstützt Pan/Zoom/Cutaway und bleibt im selben Renderer.
- Danny nutzt authored Start/Look/Overview-Anker, Collider, selektive Animationen, echte Extras-Metadaten, große Hitplanes plus Mobile-Screen-Fallback, kontrollierte Lichtzahl/-intensität und bereinigte Overview-Occluder. Ein helleres neutrales Grundlicht, PMREM-Umgebung und 8/12/14 semantisch verteilte Lampen bewahren dabei die explizit farbtreuen Kunst-Maps.
- Eine optionale 45-Sekunden-Tour folgt den authored Routen und kann jederzeit übersprungen werden. Smart View erschließt 14 relevante View-Anker; Reset View kehrt zu Entrance beziehungsweise Overview zurück. Reduced Motion ersetzt Kamerafahrten durch einen sofortigen Zielwechsel.
- Danny und veröffentlichte Galerien besitzen ein fokusgeführtes, textbasiertes Artwork Directory mit Bildern, Metadaten und Beschreibungen; bei WebGL-Ausfall öffnet es automatisch.
- Poster und echter Fortschritt verdecken die Ladephase; eine geometrie- und texturreduzierte, metadata-identische Mobile-Datei wird automatisch gewählt.
- Ein dokumentierter Blender→GLB-Vertrag, Generator und Validator existieren für die spätere Template-Migration.

## Benötigt externe Entscheidung oder Live-Zugang

| Punkt | Warum nicht lokal abschließbar | Nächster Schritt |
|---|---|---|
| Live Discover / Publish | Der lokale Client erhält `permission-denied`; Live-Daten wurden absichtlich nicht mutiert. | Anonymous Auth, Authorized Domains, Firestore Rules/Indexes und einen echten Publish→Incognito→Discover-Fluss im Zielprojekt deployen/testen. |
| Private, unlisted, permanent, Revisionen | Erfordert Zugriffsmodell, Accounts, Storage, Rate Limits, Moderation und Tarifentscheidung. | Pilot-Backend und Rollenmodell definieren; erst danach UI aktivieren. Die aktuelle UI behauptet diese Funktionen nicht. |
| Vollständige Rechtstexte | Controller, Kontakt, Sitz, Rechtsgrundlage, Auftragsverarbeitung und Vertragsbedingungen fehlen als Eingaben. | Mit realen Betreiberangaben Privacy, Terms, Content Rights und Pilotvertrag juristisch erstellen. |
| Dynamische Social Cards / eigener Slug / Custom Domain | Hash-Routing und GitHub Pages können Galerie-spezifische Server-Metadaten nicht erzeugen. | Hosting/Edge-Rendering und Domain auswählen; OG-Route serverseitig aus Gallery-Metadaten erzeugen. |
| Drei Builder-Räume als Blender-GLB | Der Runtime-Wechsel braucht finale Blender-Dateien, UV/PBR-QA, Export und Regression gegen alle Editor-Surfaces. | Bestehenden Exportvertrag pro Raum erfüllen und pro Template schrittweise hinter Feature Flags migrieren. |
| Echte Business-Case-Resultate | Besucherzahlen, Conversion, Partnerzitat oder kuratorisches Ergebnis können nicht erfunden werden. | Einen Design-Partner-Pilot durchführen und freigegebene Ergebnisse ergänzen. |

## Bewusst verbleibende technische Grenzen

- Die Builder-Räume bleiben derzeit prozedural. Der Vertrag ist real, die Migration noch nicht.
- Kollision ist swept AABB, kein Navmesh-Pathfinding. Click-to-walk lehnt blockierte Direktziele ab, plant aber keinen Weg um mehrere Hindernisse.
- Die Materialbibliothek verwendet dokumentierte Albedo-Texturen und physikalische Materialparameter, aber noch keine scanbasierten Normal-/Roughness-/AO-Sets.
- Der Grand Forum Builder adressiert aktuell Außenwände und den zentralen zweiseitigen Divider; zusätzliche interne Partition-Surfaces benötigen eine Domain-/Exportmigration.
- Progressive Shell/Artwork/Decor-Streaming, KTX2 und echte LOD-Stufen bleiben spätere Optimierungen; die jetzige Mobile-Variante erfüllt jedoch das Performancebudget.

## Pitch-Gate

Der lokale Produktstand ist für einen geführten Proof-of-Concept-Pitch belastbar. Vor einem öffentlichen oder vertraulichen Firmenpilot bleiben vier harte Gates: Live-Firebase-End-to-End-Test, echtes Privacy/Terms-Paket, ein privates Rollen-/Linkmodell und ein benannter Support-/Vertragskontakt.
