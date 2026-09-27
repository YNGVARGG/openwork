# Périmètre de recherche — bureau d’études thermique/CVC français

Recherche du 2026-09-27 pour la feuille de route produit. Périmètre principal : logement et tertiaire en France métropolitaine. Les missions réelles et textes applicables dépendent de l’usage, du territoire, de la date et de l’opération. Les notices publiques de normes identifient des domaines d’application ; elles ne remplacent pas leurs textes complets ni les compléments nationaux nécessaires à une implémentation.

## État réel

Le calculateur implémente U × aire nette × écart de température, ψ × longueur × écart et ρ × cp × débit/3600 × écart. Le cas synthétique 770 W puis 910,5 W est vérifié. U, ψ, débits, températures et propriétés de l’air sont fournis ; le programme ne prouve ni leur pertinence pour un bâtiment ni la complétude géométrique. Il ne dimensionne pas encore des équipements et n’est pas une implémentation complète de NF EN 12831-1. Étude réglementaire, simulation énergétique et dimensionnement sont des modules distincts.

## Références consultées

- AFNOR NF EN 12831-1 : https://www.boutique.afnor.org/fr-fr/norme/nf-en-128311/performance-energetique-des-batiments-methode-de-calcul-de-la-charge-thermi/fa184817/79485
- ISO 6946, parois opaques : https://www.iso.org/fr/standard/65708.html
- ISO 10077-1, menuiseries : https://www.iso.org/fr/standard/67090.html
- ISO 13370, échanges avec le sol : https://www.iso.org/obp/ui?_escaped_fragment_=iso%3Astd%3Aiso%3A13370%3Aed-3%3Av1%3Aen
- ISO 13788, humidité et condensation : https://www.iso.org/fr/standard/51615.html
- AFNOR NF EN ISO 52016-1, besoins et charges : https://www.boutique.afnor.org/en-gb/standard/nf-en-iso-520161/energy-performance-of-buildings-energy-needs-for-heating-and-cooling-intern/fa188183/80180
- ACERMI, performances certifiées : https://www.acermi.com/fr/marque-acermi/performances-certifiees/
- Légifrance, aération logements article 4 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006830558
- Légifrance, Code du travail R4222-6 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000018532328
- INRS ED695, principes de ventilation : https://www.inrs.fr/media.html?refINRS=ED+695
- COSTIC C20, périmètre chauffage hydraulique : https://www.costic.com/pdf/formation/733
- COSTIC, changement de générateur : https://www.costic.com/ressources/documentation-et-outils/guide-changement-du-generateur-de-chauffage-impacts-du-dimensionnement-habitat-individuel
- COSTIC, dimensionnement ECS : https://www.costic.com/ressources/documentation-et-outils/le-dimensionnement-des-systemes-de-production-deau-chaude-sanitaire-en-habitat-individuel-et
- Cerema, confort d’été : https://www.cerema.fr/fr/actualites/adapter-batiments-leurs-usages-aux-fortes-chaleurs
- Ministère, RE2020 : https://www.ecologie.gouv.fr/politiques-publiques/reglementation-environnementale-re2020
- Guide RE2020 et logiciels : https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/guide_re2020_dhup-cerema.pdf
- INIES, données environnementales : https://www.inies.fr/accueil-old/
- Ministère, réglementation existant : https://www.ecologie.gouv.fr/politiques-publiques/exigences-reglementaires-thermiques-batiments-existants
- Ministère, audit énergétique : https://www.ecologie.gouv.fr/politiques-publiques/audit-energetique-reglementaire
- ADEME OPERAT : https://operat.ademe.fr/
- Ministère, BACS : https://rt-re-batiment.developpement-durable.gouv.fr/presentation-et-guide-du-decret-bacs-a712.html

## Règle de livraison proposée

Pour chaque futur module : contrat d’entrée/sortie, méthode et version explicites, domaine d’application, exemple indépendant, cas limites, contrôle d’unités et revue métier avant usage de dimensionnement. Un test logiciel réussi ne vaut pas conformité réglementaire. Pour les productions réglementaires, prévoir une intégration avec les outils et professionnels répondant aux exigences applicables plutôt qu’une étiquette de conformité auto-attribuée.

Le redesign documentaire est suivi dans tickets/CVC-UX-002-calculation-note-design.md.
