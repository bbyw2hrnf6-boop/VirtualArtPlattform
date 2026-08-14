# AURA – Umsetzungsstatus nach dem Audit

Stand: 14. August 2026. Dieser Bericht ergänzt den ursprünglichen Audit-Snapshot. Er trennt lokal umgesetzte Produktarbeit von Punkten, die Zugang zu Live-Infrastruktur, Vertragsdaten oder einer Produktentscheidung benötigen.

## Verifiziertes Ergebnis

- `npm run check`: grün; 106 Tests bestehen. Das zusätzliche Functions-Gate besteht 3 Template-/Sicherheitschecks und den TypeScript-Build.
- Der Emil Scroll beginnt nun direkt mit `01 · Blueprint`, baut ausschließlich DannyHirschArts in sechs synchronisierten Kapiteln auf und endet in einer scharfen begehbaren Live-Szene. Ein geglätteter, richtungsstabiler Playhead mit Fortschrittslimit verhindert Sprünge bei aggressivem Scrollen; die alte statische Posterphase bleibt nur als Lade-/Fehlerfallback.
- Q/E und Pfeil hoch/runter bilden einen gemeinsamen getesteten Keyboard-Vertrag für Landing, Builder, veröffentlichte Räume und Danny. Alte Q/R-Hinweise und die separate Danny-Tour-Aktivitätsvariable wurden entfernt; die gemeinsame `VisitorControls`-Komponente bleibt die einzige Tour-Oberfläche.
- Zwölf nach Referenz- und Hashprüfung ungenutzte Legacy-/Zwischenassets wurden entfernt. Lizenz- und Asset-Dokumentation sowie die bestehende Browser-QA verwenden jetzt die aktuellen gemeinsamen Selektoren.
- Ein gemeinsames Visitor-Control-System vereinheitlicht Danny, öffentliche Räume und Builder Walk Preview. Guided Tours besitzen nun denselben Playback-Vertrag; prozedurale Räume nutzen generierte Artwork-Stops, Danny weiterhin authored Routen.
- Mehrere lokale Projekte pro Template, Legacy-Migration und ein expliziter Publish-State verhindern das Überschreiben einzelner Template-Slots und den früheren widersprüchlichen Post-Publish-Zustand.
- Die P0-Sichtprüfung wurde erneut bei exakt 1440 × 1000 und 390 × 844 durchgeführt. Landing/Emil Scroll, Picker, alle drei Templates, Danny, ein bestehender veröffentlichter Raum, Arrange, Walk Preview, Walk, Overview, Guided Tour und Publish Review wurden im Browser geprüft.
- Mobile Walk Preview stellt bei 390 × 844 rund zwei Drittel der Höhe für die 3D-Fläche bereit, klappt den Editor auf Peek ein, zeigt ausschließlich Touch-Hinweise und stellt beim Rückweg den vorherigen Half-Sheet-Zustand wieder her.
- Zwei getrennte White-Cube-Projekte wurden lokal gespeichert, im Picker parallel angezeigt und nach Reload wiederhergestellt. Der echte Firestore-Write und finale Publish-Klick wurden wegen des Verbots von Live-Datenänderungen bewusst nicht ausgeführt.
- Während der Sichtprüfung wurde eine Safari-/WebGL-Regression gefunden und behoben: Artwork-Texturen werden jetzt sofort an das Material gebunden und besitzen einen verlustfreien Fehlerpfad; weiße Platzhalter bleiben dadurch nicht mehr nach erfolgreichem Bild-Load stehen.
- Neue Scroll-/Licht-Regression über einen isolierten Headless-Chromium-Pipe-Lauf: 11/11 Assertions grün, neun eindeutige reversible Story-Phasen, anklickbare Kunst, Reduced Motion, sichtbarer WebGL-Fallback, Desktop- und Mobile-WebGL, fokussierbare Live-Besuchersteuerung, direkte Übergabe an die drei Raumkarten und keine unerwarteten Page-Errors.
- Aktuelle Browser-Regression: 13/13 Kernflüsse grün; zusätzliche Audit-Abschluss-Regression: 13/13 neue Editor-, Forum- und Danny-Flüsse grün. Keine neuen Console-Diagnosen.
- Lighthouse Mobile Landing: Performance 96, Accessibility 100, Best Practices 100, SEO 100; LCP 2,7 s, TBT 0 ms.
- Lighthouse Mobile Danny: Performance 86, Accessibility 100, Best Practices 100, SEO 100; LCP 3,8 s, TBT 100 ms.
- Danny Mobile: 1,44-MB-GLB statt 3,01 MB, zwei Meshopt-Worker, 7/7 Artwork-Hotspots, 27 Collider, 16 View-Anker, 8 Routen und erhaltene Metadaten.
- Editor-Regression: direkter Template-Refresh stellt den Entwurf wieder her; Arrange/Walk nutzt dasselbe Canvas; Kamera-Restore und Reset, ausgewähltes Werk als Walk-Start, Undo/Redo, Publish-Cover und Mobile-Bottom-Sheet sind geprüft.

Die Nachweise liegen unter [`audit/final/`](./final/), insbesondere in [`browser-qa.md`](./final/browser-qa.md), `browser-qa.json`, `audit-closure-qa.json`, `scroll-story-pipe-qa.json`, `lighthouse-home.json` und `lighthouse-demo.json`.

## Umgesetzt

### P2 · Accounts, Sichtbarkeit und Zugriff

- Email/Password und Google ergänzen den anonymen Gastzugang. Ein Gast kann seine aktuelle anonyme Firebase-Identität durch Verknüpfen erhalten; Email-Verifikation ist Voraussetzung für erweiterten Zugriff.
- Schema v3 unterscheidet Public, Unlisted und Private. Gäste bleiben auf öffentliche zehn Tage begrenzt; verifizierte Accounts nutzen aktuell einen ausdrücklich als Vorschau bezeichneten 365-Tage-Zeitraum. Billing ist nicht aktiv.
- ACL-Dokumente liegen getrennt unter `galleries/{id}/members/{email}`. Owner ist implizit; Editor und Viewer werden gespeichert. Beide dürfen private Räume betreten; Owner und Editor können Inhalte versionsbasiert unter derselben Raum-ID aktualisieren. Nur der Owner verwaltet Zugriff und Löschung.
- Discover fragt ausschließlich aktive öffentliche Räume ab. Unlisted bleibt nur per Link auffindbar; Private benötigt Owner oder eingeladene verifizierte Email. Dieselbe Entscheidung schützt Firestore-Metadaten und Storage-Bilder.
- Publish Review, Erfolgsseite, Share-Link, private Sign-in-Tür, Zugriffsverwaltung, Datenhinweis, FAQ und vorbereitete deaktivierte Bezahlmodelle verwenden denselben Vertrag.
- Der Account-Dialog listet eigene und freigegebene aktive Räume samt Rolle. „Edit Copy“ wurde durch „Edit“ ersetzt; nach Review wechselt das Manifest atomar auf unveränderliche Revision-Assets, während Share-URL, Sichtbarkeit, Laufzeit und ACL erhalten bleiben. Veraltete parallele Saves werden abgelehnt, der lokale Draft bleibt erhalten.
- Cleanup entfernt nach Ablauf sämtliche Asset-Revisionen und ACL-Unterkollektionen. Firebase-Regeln, drei Composite-Indexes, ein Collection-Group-Index und Setup-Dokumentation wurden lokal aktualisiert; die Live-Veröffentlichung bleibt manuell.
- Kontoerstellung über Email und Google bietet eine getrennte, freiwillige und standardmäßig deaktivierte Zustimmung zum **AURA Preview Letter**. Eine geschützte Callable Function speichert den Status, versendet die erste Edition pro UID höchstens einmal und unterstützt Abmeldung in den Account-Einstellungen sowie über einen einmalig nutzbaren Link.
- Email-Verifikation verwendet eine responsive AURA-Vorlage mit Produkt-, Kontakt- und Datenhinweisen. Der eigene Action-Handler verarbeitet Verifikation und Passwort-Reset innerhalb der AURA-Oberfläche. Firebase Admin erzeugt die Action Links; die offizielle Trigger-Email-Extension übernimmt SMTP, sobald Functions und Extension live konfiguriert wurden.
- **AURA Light Preview** ist in Header, Raumauswahl, Account, Publish-Ergebnis und Planvergleich sichtbar. Zukünftige professionelle Abofunktionen sind als geplant und noch nicht aktiv gekennzeichnet.

### P1 · Storage, Navigation und Raumtiefe

- Die P1-Storage-Migration führte Schema v2 ein; P2-Veröffentlichungen verwenden nun Schema v3 mit Sichtbarkeit, Retention und ACL-Version. Schema-v1/v2-Räume bleiben öffentlich lesbar.
- Uploads sind owner-scoped, größen-/MIME-validiert, auf drei Transfers begrenzt und werden bei Teilfehlern zurückgerollt. Cleanup entfernt Storage-Dateien vor dem Firestore-Manifest.
- Storage-Dateien werden als begrenzte Blob-URLs geladen und aus einem kleinen Cache freigegeben. Neue Räume landen nicht mehr als große Base64-Strings im Safari-JavaScript-Heap.
- Click-to-walk plant einen kollisionsfreien Weg um Partitionen, statt verdeckte erreichbare Ziele nur abzulehnen.
- Grand Forum besitzt acht zusätzliche beidseitige Innenflächen. Editor, Curator, Placement, Publish-Validierung, Kamera und Runtime teilen denselben Wandvertrag.
- Räume verwenden ergänzende prozedurale Height-/Roughness-Maps für Materialtiefe, ohne Albedo fälschlich als PBR-Map zu recyceln.

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
| Live Account-/Publish-Matrix | Firestore-/Storage-Regeln und Indexes bleiben manuelle Firebase-Schritte; Live-Writes wurden lokal nicht ausgeführt. | Regeln und beide Indexes veröffentlichen; Guest, Email, Google, Public, Unlisted, Private und eingeladen/nicht eingeladen live prüfen. |
| Branded Email live | SMTP-Absender, rechtliche Absenderdaten, Trigger-Email-Extension und Functions benötigen externe Konfiguration und dürfen nicht erfunden oder lokal versendet werden. | Verifizierte Domain/SMTP einrichten, Extension installieren, Functions deployen, Auth-Action-URL setzen und die Matrix in `FIREBASE_SETUP.md` testen. |
| Dauerhafte Tarife und simultane Zusammenarbeit | Billing, permanente Retention, vollständiger Revisionsverlauf und gleichzeitiges Bearbeiten brauchen Backend, Rate Limits, Konfliktmodell und Vertragsentscheidung. | Nach dem Preview-Pilot Tarif-/Retentionmodell, Revisionsverlauf und Echtzeit-Konfliktmodell definieren. Die aktuelle UI kennzeichnet diese Punkte als inaktiv. |
| Vollständige Rechtstexte | Controller, Kontakt, Sitz, Rechtsgrundlage, Auftragsverarbeitung und Vertragsbedingungen fehlen als Eingaben. | Mit realen Betreiberangaben Privacy, Terms, Content Rights und Pilotvertrag juristisch erstellen. |
| Dynamische Social Cards / eigener Slug / Custom Domain | Hash-Routing und GitHub Pages können Galerie-spezifische Server-Metadaten nicht erzeugen. | Hosting/Edge-Rendering und Domain auswählen; OG-Route serverseitig aus Gallery-Metadaten erzeugen. |
| Drei Builder-Räume als Blender-GLB | Der Runtime-Wechsel braucht finale Blender-Dateien, UV/PBR-QA, Export und Regression gegen alle Editor-Surfaces. | Bestehenden Exportvertrag pro Raum erfüllen und pro Template schrittweise hinter Feature Flags migrieren. |
| Echte Business-Case-Resultate | Besucherzahlen, Conversion, Partnerzitat oder kuratorisches Ergebnis können nicht erfunden werden. | Einen Design-Partner-Pilot durchführen und freigegebene Ergebnisse ergänzen. |

## Bewusst verbleibende technische Grenzen

- Alte schema-v1-Räume enthalten weiterhin große Firestore-Data-URLs und können auf Safari das frühere Speicherproblem behalten. Neue schema-v3-Räume umgehen diesen Pfad; Live-Altdaten wurden nicht automatisch migriert.
- Die Builder-Räume bleiben derzeit prozedural. Der Vertrag ist real, die Migration noch nicht.
- Kollision ist swept AABB mit einem kleinen Visibility-Graphen für prozedurale Räume, kein Navmesh. Komplexe oder dynamische Hindernisfelder bleiben deshalb eine spätere Ausbaustufe.
- Die Materialbibliothek verwendet dokumentierte Albedo-Texturen, physikalische Parameter und prozedurale Height-/Roughness-Details, aber noch keine scanbasierten Normal-/Roughness-/AO-Sets.
- Der Grand Forum Builder adressiert Außenwände, den zentralen zweiseitigen Divider und acht beidseitige Innenflächen. Eine spätere Blender-GLB-Migration muss dieselben Surface-IDs erhalten.
- Progressive Shell/Artwork/Decor-Streaming, KTX2 und echte LOD-Stufen bleiben spätere Optimierungen; die jetzige Mobile-Variante erfüllt jedoch das Performancebudget.

## Pitch-Gate

Der lokale Produktstand ist für einen geführten Proof-of-Concept-Pitch belastbar. Vor einem öffentlichen oder vertraulichen Firmenpilot bleiben vier harte Gates: Live-Firebase-Account-/Zugriffs-Test, echtes Privacy/Terms-Paket, Missbrauchsschutz/App Check und ein benannter Support-/Vertragskontakt.
