# Figma vers HTML

Plugin Figma qui exporte vos maquettes en HTML / CSS / JS prêts à l'emploi.

## Architecture

```
src/plugin/          ← Source (modules ES)
  main.js            ← Point d'entrée, message handler
  config.js          ← Options par défaut, création du contexte
  utils.js           ← Couleurs, noms de classes, sémantique, ARIA, layout
  css.js             ← Design tokens, Google Fonts, Grid, déduplication CSS
  components.js      ← Registre de composants réutilisables
  interactive.js     ← Machine d'état prototype (CHANGE_TO, triggers)
  process.js         ← Processeur principal de nœuds Figma → HTML+CSS
  responsive.js      ← Breakpoints multi-frames, media queries
  debug.js           ← Extraction de données brutes pour debug

ui.html              ← Interface utilisateur du plugin (auto-contenu)
code.js              ← Bundle généré par esbuild (ne pas éditer)
manifest.json        ← Configuration du plugin Figma
```

## Build

```bash
npm install
npm run build          # Bundle src/ → code.js
npm run watch          # Rebuild automatique en développement
npm run lint           # Vérification ESLint
```

## Fonctionnalités

* **Conversion Haute Fidélité** — Auto-Layouts, typographie, espacements, arrondis → CSS moderne (Flexbox + CSS Grid)
* **Code Propre (BEM)** — Noms de classes sans IDs Figma, nomenclature BEM
* **Design Tokens** — Variables CSS `:root { --color-1: ... }` auto-générées
* **Sémantique HTML5** — Détection auto de `<header>`, `<nav>`, `<footer>`, `<section>`, etc.
* **Export SVG** — Inline ou fichiers séparés dans `/assets/`, avec déduplication
* **Images optimisées** — Export WebP / AVIF / PNG fichier au lieu de base64, avec déduplication
* **Google Fonts** — Liens `<link>` auto-générés
* **Responsive** — Multi-frames → media queries CSS
* **Fluid Typography** — `clamp()` pour les tailles de texte
* **Prototypes Interactifs** — Animations d'état, hover, click, drag, press, delay
* **Animations CSS** — Smart Animate → `@keyframes`
* **Liens Externes** — Prototype URLs → balises `<a>`
* **Accessibilité** — Rôles ARIA, textes alternatifs auto
* **Composants Réutilisables** — Détection d'instances identiques, CSS partagé, données JS

## Utilisation

1. Sélectionnez une ou plusieurs frames.
2. Configurez les options dans l'onglet Options.
3. Cliquez sur **▶ Générer** — le ZIP se télécharge automatiquement.
