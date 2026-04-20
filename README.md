# OSB-Verlegeplaner

Browser-basierter Verlegeplaner für **OSB-Platten**, **Fliesen**, **Terrassendielen** und **Parkett / Vinyl**.
Zeichnet beliebige Grundrisse, berechnet automatisch Plattenmengen, Verschnitt und Reststück-Wiederverwendung.

## Features

- **Polygon-Editor** mit Kanten (90° und 45°), Auto-Schließen, Presets (Rechteck, L-Form, Schräge)
- **Materialien**: OSB-Platten, Fliesen, Terrassendielen, Parkett/Vinyl mit Klicksystem
- **Nut/Feder-Toggle** — eingegebene Maße = sichtbare Außenmaße
- **Balken-Raster** (Unterkonstruktion) mit freier Richtung/Achsabstand/Offset, als An/Aus-Toggle
- **Verlegemuster** mit Icons: Stapel, Halbverband, Drittelverband, Restverband, Fischgrät, Doppel-Fischgrät, Französisches Fischgrät
- **Verlegerichtung** (↑↓←→) zeilen- oder spaltenweise
- **Stöße auf Unterkonstruktion**: Plankenstöße werden exakt auf Balkenachsen gekappt
- **Rest-Pool**: Offcut einer Platte wird zum Anfangsstück einer späteren — reduziert benötigte Plattenmenge
- **Anker per Drag & Drop** im Canvas (BBox-Ecken und Polygon-Ecken als Snap-Ziele)
- **Raster drehen** (Rasterwinkel ±45° oder „An Polygon-Kante ausrichten")
- **Auto-Optimieren** (Grid-Search über Offset/Versatz zur Verschnittminimierung)
- **Eigene Presets** speichern pro Material
- **Persistenz** in `localStorage`, Export/Import als JSON, SVG-Export
- **Auswertung** rechts oben: Fläche, benötigte Platten, Verschnitt, Rest-Pool

## Tech Stack

- [React 18](https://react.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/)
- [lucide-react](https://lucide.dev/) Icons
- Alles in einer einzigen JSX-Datei (`osb-planer.jsx`), kein Backend

## Entwicklung

```bash
npm install
npm run dev
```

Öffnet [http://localhost:5173](http://localhost:5173).

```bash
npm run build     # Produktions-Build nach dist/
npm run preview   # dist/ lokal bedienen
```

## Projektstruktur

```
.
├── osb-planer.jsx        # Hauptkomponente (alle Logik + UI)
├── src/
│   ├── main.jsx          # React-Entry
│   └── index.css         # Tailwind-Directives
├── index.html
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Lizenz

MIT
