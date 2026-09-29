# Referenzen und Entwurfsentscheidungen

## Direkte Ausgangsbilder

- `references/gravity-garden.png`: vom Nutzer bereitgestelltes früheres KI-Konzept. Übernommen werden die bepflanzten Baukörper, warmen Innenräume und räumlichen Verbindungen. Die Größe wird deutlich reduziert.
- `references/tidal-fault.png`: vom Nutzer bereitgestelltes früheres KI-Konzept, im Auftrag auch als „Tidal Fold“ bezeichnet. Übernommen werden die geteilte Felsmasse, die Spalte und das Wassergefühl. Das neue Haus liegt im Wald, nicht an einer Meeresklippe.

Das neue Haus ist ein eigener Entwurf aus diesen Motiven.

## Architektonische Bezugspunkte aus der vorherigen Recherche

- Snøhetta, Under: https://www.snohetta.com/projects/under - Bezug für den räumlichen Übergang zwischen gebautem Raum, Fels und Wasser. Forest Fold übernimmt weder den Grundriss noch die Unterwasserkonstruktion.
- Moshe Safdie, Habitat 67: https://www.habitat67.com/ - Bezug für gegliederte Baukörper und Außenräume zwischen ihnen. Forest Fold ist ein kleines Haus mit zwei Ebenen.

Die Referenzseiten enthalten Fotografien der realen Projekte. Diese fremden Fotografien sind nicht Bestandteil des ZIP. Alle neuen Ansichten unter `images/` wurden als KI-Konzeptbilder erzeugt.

## Nachbauhinweise zu sichtbaren Abweichungen

- Die Rückseitenbilder können Flügel im Bild anders links/rechts ordnen. Geografisch bleibt der größere Flügel im Westen; beim Blick aus Norden liegt er rechts. `scene.json` und Plan 01 bestimmen diese Orientierung.
- Der Wasserfall wirkt in manchen Konzeptbildern größer. Ziel: 1,20 m breiter Wasserfilm an einer separaten Steinwange, Auslass +2,20 m, kein geschosshoher Vorhang vor dem Loungefenster.
- Die trockene Verbindung zur Lounge ist in den Bildern teilweise von Felsen/Pflanzen verdeckt. Sie muss im Modell durchgehend 1,20 m frei bleiben.
- Kücheninseln und Bettausrichtung variieren bildlich. Verbindlich: Insel 1,60 x 0,80 m, Bettkopf an der nördlichen abgestuften Innenwand. Möbelpositionen aus `furniture.json`.
- Manche Gegenansichten zeigen andere Bildausschnitte oder Fensteranteile. Keine zusätzlichen Öffnungen in die erdberührten Lounge-Rückwände setzen.
- Das obere Treppenloch bekommt eine vollständige Absturzsicherung. Fehlende oder unlogische KI-Geländer werden nicht übernommen.
- Die Fassaden sind vorwiegend bündig. Es entstehen keine großen, statisch unbestimmten Auskragungen; kleine Schattenrücksprünge sind erwünscht.
- Pflanzen, Bücher, lose Dekoration und Falten dienen als Stilreferenz. Im finalen Modell pro Raum eine feste Ausstattung festlegen und in sämtlichen Kameras identisch lassen.

Die Pläne lösen diese Unterschiede zu einem einzigen konsistenten Nachbau auf. Die Bildserie selbst ist weder eine Vermessung noch ein photogrammetrischer Datensatz.
