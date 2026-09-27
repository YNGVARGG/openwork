# CVC-UX-002 — Note de calcul et identité du bureau d’études

Statut : demandé, à concevoir. Date : 2026-09-27. Ne pas confondre avec les améliorations du panneau natif CVC-UX-001.

## Demande

La note actuelle ressemble à une page HTML imprimée et ne correspond pas à la qualité visuelle souhaitée. Créer une véritable mise en page de note de calcul, cohérente avec CVC Studio et adaptée aux livrables de bureau d’études. Prévoir ultérieurement un logo et les coordonnées de l’entreprise, sans les rendre obligatoires.

## Direction proposée

- Typographie et hiérarchie cohérentes avec l’application ; papier A4 blanc, contrastes lisibles en noir et blanc, couleur d’accent discrète. Ne pas imprimer le thème sombre de l’application.
- Première page utile : opération, bâtiment/pièce, objet, auteur, vérificateur si réellement renseigné, date, indice, état brouillon/vérifié et résultat principal. Aucune validation professionnelle inventée.
- Corps : périmètre, données et sources, méthode/version, résultats par contribution, hypothèses et exclusions, comparaison si demandée ; traçabilité détaillée en annexe.
- Tableaux avec unités dans les en-têtes, nombres alignés, en-têtes répétés, pagination maîtrisée, pas de ligne coupée ni de colonnes illisibles. En-tête/pied de page avec nom d’opération, indice et page/total.
- Identité entreprise optionnelle : logo conservant ses proportions, nom, coordonnées, auteur ; modèle neutre complet en l’absence de logo. Ne pas générer de logo ou de signature sans demande.
- PDF issu du même calcul sauvegardé que l’artefact ; export direct avec nom lisible, indépendant du chemin interne et sans exposer les UUID comme nom de document.
- Prévisualisation avant export et conservation du document émis avec son calcul/version de modèle. Modifier le thème/logo ne modifie pas les calculs ni les anciens documents émis.

## Acceptation

Vérifier visuellement et numériquement un cas court, un cas sur plusieurs pages, de longs noms, des valeurs nulles/petites, des hypothèses non validées et un logo absent/présent. Ouvrir le PDF dans un lecteur indépendant, contrôler pagination, sélection de texte, accents et impression. Les valeurs doivent correspondre au run enregistré. La méthode actuelle reste préliminaire, sans mention de conformité EN 12831/RE2020.

Aucun nouveau PDF n’est créé dans ce ticket de cadrage. À faire avant la livraison documentaire professionnelle.

## Implementation update — 2026-09-27

The initial A4 redesign and native Electron PDF export are implemented. See [desktop integration and evidence](../desktop-jev-pdf.md). The reference note was visually checked on all four pages and its saved-run values checked after PDF text extraction. This ticket remains open for company identity/logo, author and verifier metadata, issued-document archiving, and the full long-name/logo acceptance matrix. No professional verification status is assigned automatically.
