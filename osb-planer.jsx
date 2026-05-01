import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Trash2, Plus, Grid3x3, Package, Download, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  ArrowUpRight, ArrowUpLeft, ArrowDownRight, ArrowDownLeft, Edit3, Eye, Sliders, Wand2,
  CornerUpLeft, CornerUpRight, CornerDownLeft, CornerDownRight, RotateCw, Save, Upload,
} from 'lucide-react';

const STORAGE_KEY = 'osb-planer:last';

const MATERIAL_LABEL = {
  osb: 'Platten',
  fliesen: 'Fliesen',
  diele: 'Terrassendielen',
  parkett: 'Parkett / Vinyl',
};
const MATERIAL_PRESETS = {
  osb: [
    { l: 250, b: 125, label: '2500×1250' },
    { l: 280, b: 125, label: '2800×1250' },
    { l: 244, b: 122, label: '2440×1220' },
    { l: 250, b: 67.5, label: '2500×675 N/F' },
  ],
  fliesen: [
    { l: 60, b: 60, label: '60×60' },
    { l: 60, b: 30, label: '60×30' },
    { l: 30, b: 30, label: '30×30' },
    { l: 120, b: 30, label: '120×30 Diele' },
    { l: 90, b: 15, label: '90×15 Stäbchen' },
    { l: 20, b: 20, label: '20×20 Mosaik' },
  ],
  diele: [
    { l: 300, b: 14.5, label: '3000×145' },
    { l: 400, b: 14.5, label: '4000×145' },
    { l: 300, b: 12, label: '3000×120' },
    { l: 400, b: 12, label: '4000×120' },
    { l: 300, b: 9, label: '3000×90 WPC' },
    { l: 200, b: 14.5, label: '2000×145' },
  ],
  parkett: [
    { l: 130, b: 20, label: '1300×200' },
    { l: 120, b: 19, label: '1200×190' },
    { l: 180, b: 22, label: '1800×220' },
    { l: 140, b: 18, label: '1400×180' },
    { l: 90,  b: 15, label: '900×150 Klickvinyl' },
    { l: 122, b: 20, label: '1220×200 Landhaus' },
  ],
};
const MATERIAL_DEFAULTS = {
  osb:     { l: 250, b: 125,  fuge: 0,   fugeQuerOnly: false, nf: true  },
  fliesen: { l: 60,  b: 60,   fuge: 0.3, fugeQuerOnly: false, nf: false },
  diele:   { l: 300, b: 14.5, fuge: 0.5, fugeQuerOnly: true,  nf: true  },
  parkett: { l: 130, b: 20,   fuge: 0,   fugeQuerOnly: false, nf: true  },
};

// Indikative Preise pro Einheit (€ pro Platte/Fliese/Diele) — für die
// Kosten-Schätzung im Stat-Hero. Reale Preise variieren, die Werte dienen
// als plausible Startpunkte.
const PRICE_PER_PLATE = {
  osb:     31.20,
  fliesen:  4.50,
  diele:   18.90,
  parkett: 39.90,
};

// Mapping alter versatzTyp-Werte auf neue verlegemuster-Werte (Migration)
const VERSATZ_TO_VERLEGEMUSTER = {
  kein: 'stapel',
  halb: 'halb',
  drittel: 'drittel',
  frei: 'halb',
  rest: 'rest',
};

const RICHTUNGEN = {
  'rechts':        { dx:  1, dy:  0 },
  'links':         { dx: -1, dy:  0 },
  'runter':        { dx:  0, dy:  1 },
  'hoch':          { dx:  0, dy: -1 },
  'rechts-runter': { dx:  Math.SQRT1_2, dy:  Math.SQRT1_2 },
  'links-runter':  { dx: -Math.SQRT1_2, dy:  Math.SQRT1_2 },
  'rechts-hoch':   { dx:  Math.SQRT1_2, dy: -Math.SQRT1_2 },
  'links-hoch':    { dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 },
};

// ===== Pure helpers =====

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function intersectSeg(P, Q, A, B) {
  const x1 = P.x, y1 = P.y, x2 = Q.x, y2 = Q.y;
  const x3 = A.x, y3 = A.y, x4 = B.x, y4 = B.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return { x: x2, y: y2 };
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function clipPolygon(subject, clipPoly) {
  let sArea = 0;
  for (let i = 0; i < clipPoly.length; i++) {
    const j = (i + 1) % clipPoly.length;
    sArea += clipPoly[i].x * clipPoly[j].y - clipPoly[j].x * clipPoly[i].y;
  }
  const cw = sArea > 0;
  const poly = cw ? clipPoly : [...clipPoly].reverse();

  let output = subject;
  for (let i = 0; i < poly.length; i++) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    const A = poly[i];
    const B = poly[(i + 1) % poly.length];
    for (let j = 0; j < input.length; j++) {
      const P = input[j];
      const Q = input[(j + 1) % input.length];
      const Pin = ((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x)) >= 0;
      const Qin = ((B.x - A.x) * (Q.y - A.y) - (B.y - A.y) * (Q.x - A.x)) >= 0;
      if (Pin) {
        if (Qin) output.push(Q);
        else output.push(intersectSeg(P, Q, A, B));
      } else if (Qin) {
        output.push(intersectSeg(P, Q, A, B));
        output.push(Q);
      }
    }
  }
  return output;
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInTriangle(p, a, b, c) {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// Ear-clipping triangulation. Works for simple concave polygons.
function triangulate(pts) {
  // Drop duplicate/near-duplicate consecutive points (breaks ear-clipping otherwise)
  const cleaned = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = cleaned.length ? cleaned[cleaned.length - 1] : pts[pts.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > 0.001) cleaned.push(pts[i]);
  }
  pts = cleaned;
  if (pts.length < 3) return [];
  if (pts.length === 3) return [[pts[0], pts[1], pts[2]]];
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const V = area > 0 ? pts.slice() : pts.slice().reverse();
  const triangles = [];
  let guard = V.length * V.length + 8;
  while (V.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let i = 0; i < V.length; i++) {
      const a = V[(i - 1 + V.length) % V.length];
      const b = V[i];
      const c = V[(i + 1) % V.length];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 0) continue;
      let hasInside = false;
      for (let j = 0; j < V.length; j++) {
        if (j === i || j === (i - 1 + V.length) % V.length || j === (i + 1) % V.length) continue;
        if (pointInTriangle(V[j], a, b, c)) { hasInside = true; break; }
      }
      if (hasInside) continue;
      triangles.push([a, b, c]);
      V.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) break;
  }
  if (V.length === 3) triangles.push([V[0], V[1], V[2]]);
  return triangles;
}

function rotatePt(p, cx, cy, angleRad) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return {
    x: cx + (p.x - cx) * c - (p.y - cy) * s,
    y: cy + (p.x - cx) * s + (p.y - cy) * c,
  };
}

function getBounds(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

function computeBalken({ rBounds, balkenRichtung, balkenBreite, balkenAchs, balkenOffset }) {
  if (!rBounds) return [];
  const result = [];
  if (balkenRichtung === 'vertikal') {
    let x = rBounds.minX + balkenOffset;
    while (x < rBounds.maxX + balkenAchs) {
      result.push({
        x: x - balkenBreite / 2, y: rBounds.minY,
        w: balkenBreite, h: rBounds.maxY - rBounds.minY, achse: x,
      });
      x += balkenAchs;
    }
  } else {
    let y = rBounds.minY + balkenOffset;
    while (y < rBounds.maxY + balkenAchs) {
      result.push({
        x: rBounds.minX, y: y - balkenBreite / 2,
        w: rBounds.maxX - rBounds.minX, h: balkenBreite, achse: y,
      });
      y += balkenAchs;
    }
  }
  return result;
}

function evaluatePlate(rect, triangles, rotPolygon, pW, pH, x, y, rowIdx) {
  const pieces = [];
  let totalArea = 0;
  let biggest = null;
  let biggestArea = -1;
  for (const tri of triangles) {
    const clipped = clipPolygon(rect, tri);
    if (clipped.length >= 3) {
      const a = polygonArea(clipped);
      if (a > 0.1) {
        pieces.push(clipped);
        totalArea += a;
        if (a > biggestArea) { biggestArea = a; biggest = clipped; }
      }
    }
  }
  if (totalArea <= 1 || pieces.length === 0) return null;
  const fullArea = pW * pH;
  const eps = 0.5;
  const inX = [x + eps, x + pW - eps];
  const inY = [y + eps, y + pH - eps];
  const insetCorners = [
    { x: inX[0], y: inY[0] }, { x: inX[1], y: inY[0] },
    { x: inX[1], y: inY[1] }, { x: inX[0], y: inY[1] },
  ];
  const cornersIn = insetCorners.every(c => pointInPolygon(c, rotPolygon));
  let vertexInside = false;
  for (const v of rotPolygon) {
    if (v.x > inX[0] && v.x < inX[1] && v.y > inY[0] && v.y < inY[1]) {
      vertexInside = true; break;
    }
  }
  const isFull = cornersIn && !vertexInside;
  return { x, y, w: pW, h: pH, pieces, biggest, area: totalArea, fullArea, isFull, row: rowIdx };
}

function computeFischgrat({
  rotPolygon, rBounds, plattenL, plattenB,
  variant = 'fischgrat',  // 'fischgrat' | 'fischgrat-doppelt' | 'fischgrat-franz'
  richtung = 'rechts',    // 'rechts' | 'links' — Steigung
  offsetX = 0, offsetY = 0,
}) {
  const triangles = triangulate(rotPolygon);
  const platten = [];
  const pL = Math.max(plattenL, plattenB);
  const pS = Math.min(plattenL, plattenB);
  const mirror = richtung === 'links' ? -1 : 1;
  const doppelt = variant === 'fischgrat-doppelt';
  const pairW = doppelt ? 2 * pS : pS;  // Breite eines Vertikal-Pakets
  const pairH = doppelt ? 2 * pS : pS;  // Höhe eines Horizontal-Pakets
  const tileW = pL + pairW;
  const tileH = pL + pairH;

  // Für französisches Fischgrät: gesamten Pattern-Bereich 45° drehen
  // Wir iterieren in einem größeren Feld um die BBox, drehen Positionen bei Bedarf.
  const franz = variant === 'fischgrat-franz';
  const cx0 = (rBounds.minX + rBounds.maxX) / 2;
  const cy0 = (rBounds.minY + rBounds.maxY) / 2;
  const a = franz ? (Math.PI / 4) * mirror : 0;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const rot = (p) => ({ x: cx0 + (p.x - cx0) * cosA - (p.y - cy0) * sinA,
                         y: cy0 + (p.x - cx0) * sinA + (p.y - cy0) * cosA });

  const diag = Math.hypot(rBounds.maxX - rBounds.minX, rBounds.maxY - rBounds.minY);
  const padX = franz ? diag : pL + pairW;
  const padY = franz ? diag : pL + pairH;

  const startX = Math.floor((rBounds.minX - padX - offsetX) / tileW) * tileW + offsetX;
  const startY = Math.floor((rBounds.minY - padY - offsetY) / tileH) * tileH + offsetY;
  const endX = rBounds.maxX + padX;
  const endY = rBounds.maxY + padY;

  for (let y = startY; y < endY; y += tileH) {
    for (let x = startX; x < endX; x += tileW) {
      // Jeder "Tile" enthält bei Standard/Franz 1 horizontale + 1 vertikale Platte,
      // bei Doppel 2 horizontale + 2 vertikale.
      const rectsInTile = [];
      // Horizontal-Paket (Pakethöhe pairH)
      for (let k = 0; k < (doppelt ? 2 : 1); k++) {
        rectsInTile.push({
          x: x,
          y: y + k * pS,
          w: pL,
          h: pS,
          rotation: 0,
        });
      }
      // Vertikal-Paket (Paketbreite pairW), rechts versetzt, um pairH nach unten verschoben
      for (let k = 0; k < (doppelt ? 2 : 1); k++) {
        rectsInTile.push({
          x: x + pL + k * pS,
          y: y + pairH,
          w: pS,
          h: pL,
          rotation: 0,
        });
      }
      for (const r of rectsInTile) {
        // Optional 45° rotiert (französisch) — Rotations-Clipping gegen Polygon
        const corners = [
          { x: r.x,       y: r.y       },
          { x: r.x + r.w, y: r.y       },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x,       y: r.y + r.h },
        ].map(p => franz ? rot(p) : p);
        const plate = evaluatePlate(corners, triangles, rotPolygon, r.w, r.h, r.x, r.y, 0);
        if (plate) {
          plate.id = platten.length + 1;
          plate.rotation = franz ? (45 * mirror) : 0;
          plate.corners = corners;  // bei Drehung: Display-Polygon
          platten.push(plate);
        }
      }
    }
  }
  return platten;
}

function computePlatten({
  rotPolygon, rBounds, pW, pH, offsetX, offsetY,
  versatzTyp, versatzWert, versatzRichtung,
  verlegeRichtung = 'rechts',
  verlegemuster = null,
  fischgratRichtung = 'rechts',
  fugeX = 0, fugeY = 0,
  stoesseAufUk = false,
  balkenAchsenX = null,    // sortierte X-Achsen der Balken (bei vertikalen Balken)
  balkenAchsenY = null,    // sortierte Y-Achsen der Balken (bei horizontalen Balken)
}) {
  // Fischgrät-Code-Pfad
  if (verlegemuster && verlegemuster.startsWith('fischgrat')) {
    return computeFischgrat({
      rotPolygon, rBounds,
      plattenL: Math.max(pW, pH), plattenB: Math.min(pW, pH),
      variant: verlegemuster,
      richtung: fischgratRichtung,
      offsetX, offsetY,
    });
  }

  const strideX = pW + fugeX;
  const strideY = pH + fugeY;
  const triangles = triangulate(rotPolygon);
  const platten = [];

  // Horizontal = zeilenweise (links/rechts), Vertikal = spaltenweise (hoch/runter)
  const horizontal = verlegeRichtung === 'links' || verlegeRichtung === 'rechts';
  const forward = verlegeRichtung === 'rechts' || verlegeRichtung === 'runter';

  // Versatz-Basis (halb/drittel/frei) wirkt entlang der "Verlege-Achse"
  const axisDim = horizontal ? pW : pH;
  let vBase = 0;
  if (versatzTyp === 'halb') vBase = axisDim / 2;
  else if (versatzTyp === 'drittel') vBase = axisDim / 3;
  else if (versatzTyp === 'frei') vBase = Math.min(Math.max(versatzWert, 0), axisDim);
  // versatzRichtung (links/rechts) gibt den Shift-Sign auf der Achse an
  const effV = versatzRichtung === 'rechts' ? -vBase : vBase;

  // Rest-Versatz: Δ = bbox-Maß entlang Verlege-Achse mod stride
  const axisStride = horizontal ? strideX : strideY;
  const axisBoundsLen = horizontal
    ? (rBounds.maxX - rBounds.minX)
    : (rBounds.maxY - rBounds.minY);
  const restDelta = axisStride > 0 ? (((axisBoundsLen % axisStride) + axisStride) % axisStride) : 0;
  // Sign is INVERTED so the leftover piece (not the cut piece) carries into next row/column.
  const restSign = forward ? -1 : 1;

  // "Stöße auf Unterkonstruktion": Plankenstöße landen exakt auf der letzt möglichen
  // Balkenachse. Nur relevant, wenn Planken senkrecht zur Balkenrichtung laufen.
  // horizontal-Verlegung + vertikale Balken (achsenX) → Cuts auf X-Achsen.
  // vertikal-Verlegung + horizontale Balken (achsenY) → Cuts auf Y-Achsen.
  const ukX = stoesseAufUk && horizontal && Array.isArray(balkenAchsenX) && balkenAchsenX.length > 0;
  const ukY = stoesseAufUk && !horizontal && Array.isArray(balkenAchsenY) && balkenAchsenY.length > 0;
  const axesSorted = ukX
    ? [...balkenAchsenX].sort((a, b) => a - b)
    : (ukY ? [...balkenAchsenY].sort((a, b) => a - b) : null);

  // Nächsten erlaubten Schnitt innerhalb (from, from+maxLen] finden.
  // Rückgabe: from + maxLen, wenn keine Achse passt (fallback).
  const nextCut = (from, maxLen) => {
    if (!axesSorted) return from + maxLen;
    const ideal = from + maxLen;
    let candidate = -Infinity;
    for (const a of axesSorted) {
      if (a > from + 0.01 && a <= ideal + 0.01 && a > candidate) candidate = a;
    }
    return candidate === -Infinity ? ideal : candidate;
  };

  if (horizontal) {
    // Zeilen abarbeiten (y fest), Platten horizontal
    let rowIdx = 0;
    let renderedRow = 0;
    for (let y = rBounds.minY + offsetY - pH; y < rBounds.maxY; y += strideY) {
      if (y + pH <= rBounds.minY) { rowIdx++; continue; }
      const xOff = versatzTyp === 'rest'
        ? restSign * renderedRow * restDelta
        : (rowIdx % 2 === 1 ? -effV : 0);
      let startX = rBounds.minX + offsetX + xOff;
      while (startX + pW > rBounds.minX) startX -= strideX;
      if (ukX) {
        // Batten-aligned Cutting
        let x = startX;
        let safety = 1000;
        while (x < rBounds.maxX && safety-- > 0) {
          const cutAt = nextCut(x, pW);
          const w = cutAt - x;
          if (w > 0.1) {
            const rect = [{ x, y }, { x: cutAt, y }, { x: cutAt, y: y + pH }, { x, y: y + pH }];
            const plate = evaluatePlate(rect, triangles, rotPolygon, w, pH, x, y, rowIdx);
            if (plate) {
              plate.id = platten.length + 1;
              plate.ukCut = true;  // Kennzeichnung für Stat-Erkennung
              plate.fullW = pW;    // volle Länge zur Rest-Berechnung
              // UK-Schnitt verkleinert die Platte → kein "voll" mehr (außer der Schnitt landet zufällig auf voller Plattenlänge)
              if (Math.abs(w - pW) > 0.5) plate.isFull = false;
              platten.push(plate);
            }
          }
          if (cutAt <= x + 1e-6) break;  // kein Fortschritt
          x = cutAt + fugeX;
        }
      } else {
        for (let x = startX; x < rBounds.maxX; x += strideX) {
          const rect = [{ x, y }, { x: x + pW, y }, { x: x + pW, y: y + pH }, { x, y: y + pH }];
          const plate = evaluatePlate(rect, triangles, rotPolygon, pW, pH, x, y, rowIdx);
          if (plate) { plate.id = platten.length + 1; platten.push(plate); }
        }
      }
      rowIdx++;
      renderedRow++;
    }
  } else {
    // Spalten abarbeiten (x fest), Platten vertikal gestapelt
    let colIdx = 0;
    let renderedCol = 0;
    for (let x = rBounds.minX + offsetX - pW; x < rBounds.maxX; x += strideX) {
      if (x + pW <= rBounds.minX) { colIdx++; continue; }
      const yOff = versatzTyp === 'rest'
        ? restSign * renderedCol * restDelta
        : (colIdx % 2 === 1 ? -effV : 0);
      let startY = rBounds.minY + offsetY + yOff;
      while (startY + pH > rBounds.minY) startY -= strideY;
      if (ukY) {
        let y = startY;
        let safety = 1000;
        while (y < rBounds.maxY && safety-- > 0) {
          const cutAt = nextCut(y, pH);
          const h = cutAt - y;
          if (h > 0.1) {
            const rect = [{ x, y }, { x: x + pW, y }, { x: x + pW, y: cutAt }, { x, y: cutAt }];
            const plate = evaluatePlate(rect, triangles, rotPolygon, pW, h, x, y, colIdx);
            if (plate) {
              plate.id = platten.length + 1;
              plate.ukCut = true;
              plate.fullH = pH;
              if (Math.abs(h - pH) > 0.5) plate.isFull = false;
              platten.push(plate);
            }
          }
          if (cutAt <= y + 1e-6) break;
          y = cutAt + fugeY;
        }
      } else {
        for (let y = startY; y < rBounds.maxY; y += strideY) {
          const rect = [{ x, y }, { x: x + pW, y }, { x: x + pW, y: y + pH }, { x, y: y + pH }];
          const plate = evaluatePlate(rect, triangles, rotPolygon, pW, pH, x, y, colIdx);
          if (plate) { plate.id = platten.length + 1; platten.push(plate); }
        }
      }
      colIdx++;
      renderedCol++;
    }
  }
  return platten;
}

function computeStats({ platten, points, pW, pH, balken, balkenRichtung, rBounds, rasterwinkelRad, verlegeRichtung = 'rechts', resteNutzen = true }) {
  let stoesseGesamt = 0, stoesseAufBalken = 0;
  for (const p of platten) {
    if (balkenRichtung === 'vertikal') {
      for (const kante of [p.x, p.x + p.w]) {
        if (kante <= rBounds.minX + 0.5 || kante >= rBounds.maxX - 0.5) continue;
        stoesseGesamt++;
        const trifft = balken.some(b => kante >= b.x - 0.5 && kante <= b.x + b.w + 0.5);
        if (trifft) stoesseAufBalken++;
      }
    } else {
      for (const kante of [p.y, p.y + p.h]) {
        if (kante <= rBounds.minY + 0.5 || kante >= rBounds.maxY - 0.5) continue;
        stoesseGesamt++;
        const trifft = balken.some(b => kante >= b.y - 0.5 && kante <= b.y + b.h + 0.5);
        if (trifft) stoesseAufBalken++;
      }
    }
  }

  const totalArea = polygonArea(points);
  const usedArea = platten.reduce((s, p) => s + p.area, 0);
  const fullArea = pW * pH;

  // Rest-Pooling: jeder Zuschnitt belegt einen Teil einer Vollplatte entlang der
  // Verlege-Achse. Der ungenutzte Rest-Streifen wird in einen Pool gelegt und darf
  // spätere Zuschnitte bedienen, sofern er ausreichend groß ist (Best-Fit-Decreasing).
  const horizontal = verlegeRichtung === 'links' || verlegeRichtung === 'rechts';
  const cutAxisLen = horizontal ? pW : pH;       // Länge entlang Schnittachse
  const crossLen   = horizontal ? pH : pW;       // senkrechter Wert (Dielenbreite / Plattenhöhe)
  const MIN_REST = 5;  // cm — kleinere Reste gelten nicht mehr als wiederverwertbar

  const zuschnitte = platten.filter(p => !p.isFull);
  const vollAnzahl = platten.filter(p => p.isFull).length;
  const ausRestIds = new Set();

  let neueZuschnittPlatten = 0;
  const pool = [];  // sortiert aufsteigend

  // Wir gehen die Zuschnitte in Verlegungsreihenfolge (plate.id) durch, damit
  // im "Rest"-Versatz aufeinanderfolgende Partials automatisch matchen. Innerhalb
  // dessen: kleinsten passenden Rest wählen (best-fit).
  const sorted = zuschnitte
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(p => ({ p, need: Math.min(cutAxisLen, p.area / crossLen) }));

  const insertSorted = (arr, v) => {
    let i = 0;
    while (i < arr.length && arr[i] < v) i++;
    arr.splice(i, 0, v);
  };

  for (const { p, need } of sorted) {
    if (resteNutzen) {
      // Kleinsten Rest finden, der den Zuschnitt bedienen kann
      const idx = pool.findIndex(r => r + 1e-6 >= need);
      if (idx !== -1) {
        const restStueck = pool.splice(idx, 1)[0];
        const remainder = restStueck - need;
        if (remainder > MIN_REST) insertSorted(pool, remainder);
        ausRestIds.add(p.id);
        continue;
      }
    }
    // Neue Vollplatte kaufen; ihr Offcut wandert in den Pool
    neueZuschnittPlatten++;
    const remainder = cutAxisLen - need;
    if (remainder > MIN_REST) insertSorted(pool, remainder);
  }

  const purchasedPlates = vollAnzahl + neueZuschnittPlatten;
  const purchasedArea = purchasedPlates * fullArea;
  const verschnitt = purchasedArea - usedArea;
  const verschnittProz = purchasedArea > 0 ? (verschnitt / purchasedArea) * 100 : 0;

  return {
    flaeche: totalArea / 10000,
    anzahl: platten.length,
    vollePlatten: vollAnzahl,
    zuschnitte: zuschnitte.length,
    ausRest: ausRestIds.size,
    ausRestIds,
    purchasedPlates,
    restStueckePool: pool.slice().sort((a, b) => b - a),
    gekaufteFlaeche: purchasedArea / 10000,
    nutzFlaeche: usedArea / 10000,
    verschnittProz,
    stoesseGesamt,
    stoesseAufBalken,
    plattenDimW: pW,
    plattenDimH: pH,
  };
}

// === Component ===

function loadPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function OSBPlaner() {
  const persisted = useMemo(() => loadPersisted(), []);

  const [mode, setMode] = useState('zeichnen');

  const [kanten, setKanten] = useState(() => persisted?.kanten ?? [
    { laenge: 547.4, richtung: 'rechts' },
    { laenge: 211.3, richtung: 'runter' },
    { laenge: 161.5, richtung: 'links' },
    { laenge: 527.0, richtung: 'runter' },
    { laenge: 442.6, richtung: 'links' },
    { laenge: 738.3, richtung: 'hoch' },
  ]);

  const [balkenBreite, setBalkenBreite] = useState(() => persisted?.balkenBreite ?? 8);
  const [balkenAchs, setBalkenAchs] = useState(() => persisted?.balkenAchs ?? 61.5);
  const [balkenRichtung, setBalkenRichtung] = useState(() => persisted?.balkenRichtung ?? 'vertikal');
  const [balkenOffset, setBalkenOffset] = useState(() => persisted?.balkenOffset ?? 0);

  const [plattenL, setPlattenL] = useState(() => persisted?.plattenL ?? 250);
  const [plattenB, setPlattenB] = useState(() => persisted?.plattenB ?? 125);
  const [plattenAusrichtung, setPlattenAusrichtung] = useState(() => persisted?.plattenAusrichtung ?? 'laengs');

  // Material (OSB / Fliesen / Terrassendielen)
  const [materialTyp, setMaterialTyp] = useState(() => persisted?.materialTyp ?? 'osb');
  const [fugenBreite, setFugenBreite] = useState(() => persisted?.fugenBreite ?? 0);  // cm
  const [fugeQuerOnly, setFugeQuerOnly] = useState(() => persisted?.fugeQuerOnly ?? false);
  // Nut/Feder bzw. Klicksystem aktiv (steuert Strichlinien und ist material-abhängig)
  const [nutFederAktiv, setNutFederAktiv] = useState(() => persisted?.nutFederAktiv ?? MATERIAL_DEFAULTS[persisted?.materialTyp ?? 'osb']?.nf ?? false);
  // Reststücke aus Zuschnitten wieder verwenden (Pool-Matching)
  const [resteNutzen, setResteNutzen] = useState(() => persisted?.resteNutzen ?? true);
  // Balken im Zeichnen-Modus aktiv (An/Aus-Toggle)
  const [balkenAktiv, setBalkenAktiv] = useState(() => persisted?.balkenAktiv ?? true);
  // Plankenstöße sollen exakt auf Balkenachsen liegen (Unterkonstruktion)
  const [stoesseAufUk, setStoesseAufUk] = useState(() => persisted?.stoesseAufUk ?? false);
  // Eigene Presets pro Material
  const [customPresets, setCustomPresets] = useState(() => persisted?.customPresets ?? { osb: [], fliesen: [], diele: [], parkett: [] });

  // Positioning options
  const [startAnker, setStartAnker] = useState(() => persisted?.startAnker ?? 'bbox-oben-links');
  const [offsetX, setOffsetX] = useState(() => persisted?.offsetX ?? 0);
  const [offsetY, setOffsetY] = useState(() => persisted?.offsetY ?? 0);
  const [rasterwinkel, setRasterwinkel] = useState(() => persisted?.rasterwinkel ?? 0);
  // Verlegemuster ersetzt versatzTyp. Für Fischgrät-Varianten gibt es
  // neue Werte 'fischgrat', 'fischgrat-doppelt', 'fischgrat-franz'.
  const [verlegemuster, setVerlegemuster] = useState(() => {
    if (persisted?.verlegemuster) return persisted.verlegemuster;
    // Migration aus altem versatzTyp
    if (persisted?.versatzTyp) return VERSATZ_TO_VERLEGEMUSTER[persisted.versatzTyp] ?? 'halb';
    return 'halb';
  });
  // Fischgrät-Steigung: 'rechts' (↗) oder 'links' (↖); nur für Fischgrät-Muster relevant
  const [fischgratRichtung, setFischgratRichtung] = useState(() => persisted?.fischgratRichtung ?? 'rechts');
  // Verlegerichtung: Richtung, in die die Reihen/Spalten abgearbeitet werden
  // 'rechts' | 'links'  = zeilenweise (horizontal), 'runter' | 'hoch' = spaltenweise (vertikal)
  const [verlegeRichtung, setVerlegeRichtung] = useState(() => persisted?.verlegeRichtung ?? 'rechts');

  // Abgeleitete Werte für computePlatten/autoOptimize (Rückwärtskompatibilität)
  const versatzTyp = useMemo(() => {
    if (verlegemuster === 'stapel') return 'kein';
    if (verlegemuster === 'halb' || verlegemuster === 'drittel' || verlegemuster === 'rest') return verlegemuster;
    return 'kein';  // Fischgrät-Varianten nutzen eigenen Code-Pfad
  }, [verlegemuster]);
  const versatzRichtung = useMemo(
    () => (verlegeRichtung === 'rechts' || verlegeRichtung === 'runter' ? 'rechts' : 'links'),
    [verlegeRichtung]
  );
  const versatzWert = 0;  // 'Frei'-Modus entfällt

  const [showBalken, setShowBalken] = useState(true);
  const [showPlatten, setShowPlatten] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPlattenNr, setShowPlattenNr] = useState(true);
  const [showNutFeder, setShowNutFeder] = useState(true);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  // Anker-Drag-Status: null oder { snapCandidate: {x,y}, currentCursor: {x,y} }
  const [ankerDrag, setAnkerDrag] = useState(null);

  const svgRef = useRef(null);
  // Manueller View-Override (Pan + Zoom). null = Auto-Fit auf Polygon.
  const [viewOverride, setViewOverride] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef(null);  // hält Start-Offsets während Drag

  // Mobile-Layout: Sidebar als Drawer, Stat-Panel als Bottom-Sheet
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileStatsOpen, setMobileStatsOpen] = useState(false);
  // Pen-Modus: Click-to-add mit 45°-Snap und Live-Preview
  const [penMode, setPenMode] = useState(false);
  const [penCursor, setPenCursor] = useState(null);  // { x, y } in SVG-Userspace
  // Getippte Zahleneingabe überschreibt die Mausentfernung. Erlaubt exaktes Maß.
  const [typedLen, setTypedLen] = useState('');

  // ===== Undo / Redo History =====
  const historyRef = useRef({ past: [], future: [] });
  const skipHistoryRef = useRef(false);   // true = nicht in History pushen (beim Anwenden eines Snapshots)
  const histTimerRef = useRef(null);
  // forceRender wird benötigt, damit Toolbar-Buttons nach undo/redo ihren Enabled-Status aktualisieren
  const [, setHistTick] = useState(0);
  const bumpHistTick = () => setHistTick(t => t + 1);

  function currentSnapshot() {
    return {
      kanten: kanten.map(k => ({ ...k })),
      startAnker, offsetX, offsetY, rasterwinkel,
      materialTyp, plattenL, plattenB, plattenAusrichtung,
      fugenBreite, fugeQuerOnly, nutFederAktiv,
      balkenAktiv, balkenBreite, balkenAchs, balkenRichtung, balkenOffset,
      verlegemuster, verlegeRichtung, fischgratRichtung,
      stoesseAufUk, resteNutzen,
    };
  }
  function applySnapshot(s) {
    if (!s) return;
    skipHistoryRef.current = true;
    setKanten(s.kanten.map(k => ({ ...k })));
    setStartAnker(s.startAnker);
    setOffsetX(s.offsetX); setOffsetY(s.offsetY);
    setRasterwinkel(s.rasterwinkel);
    setMaterialTyp(s.materialTyp);
    setPlattenL(s.plattenL); setPlattenB(s.plattenB);
    setPlattenAusrichtung(s.plattenAusrichtung);
    setFugenBreite(s.fugenBreite); setFugeQuerOnly(s.fugeQuerOnly);
    setNutFederAktiv(s.nutFederAktiv);
    setBalkenAktiv(s.balkenAktiv);
    setBalkenBreite(s.balkenBreite); setBalkenAchs(s.balkenAchs);
    setBalkenRichtung(s.balkenRichtung); setBalkenOffset(s.balkenOffset);
    setVerlegemuster(s.verlegemuster);
    setVerlegeRichtung(s.verlegeRichtung);
    setFischgratRichtung(s.fischgratRichtung);
    setStoesseAufUk(s.stoesseAufUk);
    setResteNutzen(s.resteNutzen);
  }
  function undo() {
    const h = historyRef.current;
    if (h.past.length < 2) return;
    const curr = h.past.pop();
    h.future.push(curr);
    const prev = h.past[h.past.length - 1];
    applySnapshot(prev);
    bumpHistTick();
  }
  function redo() {
    const h = historyRef.current;
    if (!h.future.length) return;
    const next = h.future.pop();
    h.past.push(next);
    applySnapshot(next);
    bumpHistTick();
  }
  // Inline-Edit eines Kantenmaßes (Index der editierenden Kante oder null)
  const [editingKante, setEditingKante] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const snapshot = {
      kanten, balkenBreite, balkenAchs, balkenRichtung, balkenOffset,
      plattenL, plattenB, plattenAusrichtung,
      materialTyp, fugenBreite, fugeQuerOnly, resteNutzen, customPresets,
      startAnker, offsetX, offsetY, rasterwinkel, verlegemuster, verlegeRichtung, fischgratRichtung, nutFederAktiv, balkenAktiv, stoesseAufUk,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {}
  }, [kanten, balkenBreite, balkenAchs, balkenRichtung, balkenOffset, plattenL, plattenB, plattenAusrichtung, materialTyp, fugenBreite, fugeQuerOnly, resteNutzen, customPresets, startAnker, offsetX, offsetY, rasterwinkel, verlegemuster, verlegeRichtung, fischgratRichtung, nutFederAktiv, balkenAktiv, stoesseAufUk]);

  const points = useMemo(() => {
    const pts = [{ x: 0, y: 0 }];
    let cx = 0, cy = 0;
    for (const k of kanten) {
      const r = RICHTUNGEN[k.richtung];
      if (!r || !(k.laenge > 0.001)) continue;
      cx += r.dx * k.laenge;
      cy += r.dy * k.laenge;
      const prev = pts[pts.length - 1];
      if (Math.hypot(cx - prev.x, cy - prev.y) < 0.01) continue;
      pts.push({ x: cx, y: cy });
    }
    // Snap last point to start if nearly closed
    if (pts.length > 1) {
      const last = pts[pts.length - 1];
      if (Math.hypot(last.x - pts[0].x, last.y - pts[0].y) < 1.0) {
        pts.pop();
      }
    }
    return pts;
  }, [kanten]);

  const gap = useMemo(() => {
    let cx = 0, cy = 0;
    for (const k of kanten) {
      const r = RICHTUNGEN[k.richtung];
      if (!r) continue;
      cx += r.dx * k.laenge;
      cy += r.dy * k.laenge;
    }
    return { dx: -cx, dy: -cy, dist: Math.hypot(cx, cy) };
  }, [kanten]);

  const umfang = useMemo(
    () => kanten.reduce((s, k) => s + (k.laenge || 0), 0),
    [kanten]
  );

  const bounds = useMemo(() => (points.length < 3 ? null : getBounds(points)), [points]);

  const center = useMemo(() => {
    if (!bounds) return { x: 0, y: 0 };
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }, [bounds]);

  const rasterwinkelRad = useMemo(() => (rasterwinkel * Math.PI) / 180, [rasterwinkel]);

  const rotPolygon = useMemo(() => {
    if (points.length < 3) return [];
    return points.map(p => rotatePt(p, center.x, center.y, -rasterwinkelRad));
  }, [points, center, rasterwinkelRad]);

  const rBounds = useMemo(() => (rotPolygon.length < 3 ? null : getBounds(rotPolygon)), [rotPolygon]);

  const anchorRot = useMemo(() => {
    if (!rBounds) return null;
    if (startAnker.startsWith('bbox-')) {
      const c = startAnker.slice(5);
      return {
        x: c.includes('rechts') ? rBounds.maxX : rBounds.minX,
        y: c.includes('unten')  ? rBounds.maxY : rBounds.minY,
      };
    }
    if (startAnker.startsWith('punkt-')) {
      const i = Number(startAnker.slice(6));
      if (i < 0 || i >= points.length) return { x: rBounds.minX, y: rBounds.minY };
      return rotatePt(points[i], center.x, center.y, -rasterwinkelRad);
    }
    return { x: rBounds.minX, y: rBounds.minY };
  }, [startAnker, rBounds, points, center, rasterwinkelRad]);

  const anchorDisplay = useMemo(() => {
    if (!anchorRot) return null;
    return rotatePt(anchorRot, center.x, center.y, rasterwinkelRad);
  }, [anchorRot, center, rasterwinkelRad]);

  const viewBox = useMemo(() => {
    if (!bounds) return { x: -100, y: -100, w: 800, h: 800 };
    const pad = 100;
    return {
      x: bounds.minX - pad,
      y: bounds.minY - pad,
      w: Math.max(bounds.maxX - bounds.minX + 2 * pad, 400),
      h: Math.max(bounds.maxY - bounds.minY + 2 * pad, 400),
    };
  }, [bounds]);

  // Effektive viewBox: manueller Override (Pan/Zoom) oder Auto-Fit
  const effViewBox = viewOverride ?? viewBox;

  // Pointer → SVG-Userspace umrechnen (für Zoom um Cursor + Anker-Drag)
  const clientToSVG = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const m = pt.matrixTransform(ctm.inverse());
    return { x: m.x, y: m.y };
  };

  // Zoom per Mausrad um die Cursor-Position herum
  const handleWheel = (e) => {
    e.preventDefault();
    const vb = viewOverride ?? viewBox;
    const { x: cx, y: cy } = clientToSVG(e.clientX, e.clientY);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const nw = Math.max(50, Math.min(50000, vb.w * factor));
    const nh = Math.max(50, Math.min(50000, vb.h * factor));
    // Zoom-Anker = Cursor-Punkt bleibt unter dem Mauszeiger
    const nx = cx - (cx - vb.x) * (nw / vb.w);
    const ny = cy - (cy - vb.y) * (nh / vb.h);
    setViewOverride({ x: nx, y: ny, w: nw, h: nh });
  };

  // Pan: Click + Drag auf leeren Bereich. Im Pen-Modus nur die mittlere Maustaste.
  const startPan = (e) => {
    if (penMode && e.button !== 1) return;  // im Pen-Modus nur Mittelklick für Pan
    if (e.button !== 0 && e.button !== 1) return;
    const vb = viewOverride ?? viewBox;
    panRef.current = {
      startX: e.clientX, startY: e.clientY,
      vbX: vb.x, vbY: vb.y, vbW: vb.w, vbH: vb.h,
    };
    setIsPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const movePan = (e) => {
    // Cursor-Position für Pen-Preview aktualisieren
    if (penMode) {
      const p = clientToSVG(e.clientX, e.clientY);
      setPenCursor(p);
    }
    if (!panRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = panRef.current.vbW / rect.width;
    const scaleY = panRef.current.vbH / rect.height;
    const dx = (e.clientX - panRef.current.startX) * scaleX;
    const dy = (e.clientY - panRef.current.startY) * scaleY;
    setViewOverride({
      x: panRef.current.vbX - dx,
      y: panRef.current.vbY - dy,
      w: panRef.current.vbW,
      h: panRef.current.vbH,
    });
  };
  const endPan = (e) => {
    if (!panRef.current) return;
    panRef.current = null;
    setIsPanning(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Pen: Linker-Klick im Pen-Modus → Punkt platzieren (getippte Länge hat Vorrang)
  const handlePenClick = (e) => {
    if (!penMode) return;
    if (e.button !== undefined && e.button !== 0) return;
    const p = clientToSVG(e.clientX, e.clientY);
    const dx = p.x - penStart.x;
    const dy = p.y - penStart.y;
    if (Math.hypot(dx, dy) < 2 && !typedLen) return;  // zu kurz (außer typedLen gesetzt)
    const snap = snapPen(dx, dy);
    if (!snap.name) return;
    const typed = parseFloat(typedLen);
    const useTyped = typedLen !== '' && !Number.isNaN(typed) && typed > 0;
    const length = useTyped ? typed : snap.length;
    if (length < 0.5) return;
    setKanten([...kanten, { laenge: parseFloat(length.toFixed(2)), richtung: snap.name }]);
    if (useTyped) setTypedLen('');
  };

  // Wenn Pen-Modus aus → getipptes Maß verwerfen
  useEffect(() => { if (!penMode) setTypedLen(''); }, [penMode]);

  // Initial-Snapshot nach erstem Rendern, damit undo einen Start-Zustand hat
  useEffect(() => {
    const h = historyRef.current;
    if (h.past.length === 0) {
      h.past.push(currentSnapshot());
      bumpHistTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced History-Push: schreibt einen Snapshot, wenn sich relevante States ändern.
  // Mehrfach-Änderungen innerhalb 400 ms werden zu einem Eintrag zusammengefasst (z. B. Tippen).
  useEffect(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    if (histTimerRef.current) clearTimeout(histTimerRef.current);
    histTimerRef.current = setTimeout(() => {
      const h = historyRef.current;
      const snap = currentSnapshot();
      const snapStr = JSON.stringify(snap);
      const top = h.past[h.past.length - 1];
      if (top && JSON.stringify(top) === snapStr) return;
      h.past.push(snap);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      bumpHistTick();
    }, 400);
    return () => { /* Timer bleibt; nächster Aufruf löscht ihn */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kanten, startAnker, offsetX, offsetY, rasterwinkel,
    materialTyp, plattenL, plattenB, plattenAusrichtung,
    fugenBreite, fugeQuerOnly, nutFederAktiv,
    balkenAktiv, balkenBreite, balkenAchs, balkenRichtung, balkenOffset,
    verlegemuster, verlegeRichtung, fischgratRichtung,
    stoesseAufUk, resteNutzen,
  ]);

  // Keyboard-Shortcut: Cmd/Ctrl+Z = Undo, Shift+Cmd/Ctrl+Z oder Cmd/Ctrl+Y = Redo
  useEffect(() => {
    const onKey = (e) => {
      // Nicht in Text-Inputs einmischen (außer wenn kein Input fokussiert ist)
      const t = e.target;
      const isInput = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (isInput) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetView = () => setViewOverride(null);

  // Pen-Modus: aktueller Startpunkt = Endposition der bisherigen Kanten
  const penStart = useMemo(() => {
    let x = 0, y = 0;
    for (const k of kanten) {
      const r = RICHTUNGEN[k.richtung];
      if (r && k.laenge > 0) { x += r.dx * k.laenge; y += r.dy * k.laenge; }
    }
    return { x, y };
  }, [kanten]);

  // Snap einer freien Mausbewegung auf die nächste 45°-Richtung
  function snapPen(dx, dy) {
    const step = Math.PI / 4;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / step) * step;
    const sx = Math.cos(snapped);
    const sy = Math.sin(snapped);
    const ux = Math.abs(sx) < 0.1 ? 0 : (sx > 0 ? 1 : -1);
    const uy = Math.abs(sy) < 0.1 ? 0 : (sy > 0 ? 1 : -1);
    let name = null;
    if      (ux ===  1 && uy ===  0) name = 'rechts';
    else if (ux === -1 && uy ===  0) name = 'links';
    else if (ux ===  0 && uy ===  1) name = 'runter';
    else if (ux ===  0 && uy === -1) name = 'hoch';
    else if (ux ===  1 && uy ===  1) name = 'rechts-runter';
    else if (ux === -1 && uy ===  1) name = 'links-runter';
    else if (ux ===  1 && uy === -1) name = 'rechts-hoch';
    else if (ux === -1 && uy === -1) name = 'links-hoch';
    // Cursor orthogonal auf Snap-Strahl projizieren, damit die Vorschau präzise zur Cursorposition passt
    const proj = dx * sx + dy * sy;
    const length = Math.max(0, proj);
    // Unit-Vektor im Ziel-Raum (wegen RICHTUNGEN-Normierung: SQRT1_2 für Diagonalen)
    const r = RICHTUNGEN[name];
    return { name, length, endX: penStart.x + (r ? r.dx * length : 0), endY: penStart.y + (r ? r.dy * length : 0) };
  }

  // Live-Preview: vom Startpunkt bis zur gesnappten Cursorposition
  const penPreview = useMemo(() => {
    if (!penMode || !penCursor) return null;
    const dx = penCursor.x - penStart.x;
    const dy = penCursor.y - penStart.y;
    if (Math.hypot(dx, dy) < 2) return null;  // Cursor zu nah am Start → nichts anzeigen
    return snapPen(dx, dy);
  }, [penMode, penCursor, penStart]);

  // Anzuzeigender Preview-Zustand: getipptes Maß überschreibt Cursor-Länge
  const penDisplay = useMemo(() => {
    if (!penPreview) return null;
    const typed = parseFloat(typedLen);
    const useTyped = typedLen !== '' && !Number.isNaN(typed) && typed >= 0;
    const len = useTyped ? typed : penPreview.length;
    const r = RICHTUNGEN[penPreview.name];
    return {
      name: penPreview.name,
      length: len,
      endX: penStart.x + (r ? r.dx * len : 0),
      endY: penStart.y + (r ? r.dy * len : 0),
      typedText: useTyped ? typedLen : null,
    };
  }, [penPreview, typedLen, penStart]);

  // Pen-Modus-Keyboard: Ziffern tippen für exaktes Maß, Enter = bestätigen,
  // Backspace = löschen, Escape = zuerst Maß leeren, sonst Pen-Modus verlassen.
  useEffect(() => {
    if (!penMode) return;
    const onKey = (e) => {
      const t = e.target;
      const isInput = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setTypedLen(prev => (prev + e.key).slice(0, 8));
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        setTypedLen(prev => prev.includes('.') ? prev : (prev === '' ? '0.' : prev + '.'));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setTypedLen(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const v = parseFloat(typedLen);
        if (typedLen && !Number.isNaN(v) && v > 0 && penPreview?.name) {
          setKanten([...kanten, { laenge: parseFloat(v.toFixed(2)), richtung: penPreview.name }]);
          setTypedLen('');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (typedLen) setTypedLen('');
        else setPenMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [penMode, typedLen, penPreview, kanten]);

  // Wheel muss non-passiv registriert werden, damit preventDefault() wirkt
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const listener = (e) => handleWheel(e);
    svg.addEventListener('wheel', listener, { passive: false });
    return () => svg.removeEventListener('wheel', listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOverride, viewBox.x, viewBox.y, viewBox.w, viewBox.h]);

  const plattenDims = useMemo(() => {
    let pW, pH;
    if (!balkenAktiv) {
      // Ohne Balken: Länge horizontal, Breite vertikal (Default-Mapping)
      pW = plattenL; pH = plattenB;
    } else if (balkenRichtung === 'vertikal') {
      if (plattenAusrichtung === 'laengs') { pW = plattenB; pH = plattenL; }
      else { pW = plattenL; pH = plattenB; }
    } else {
      if (plattenAusrichtung === 'laengs') { pW = plattenL; pH = plattenB; }
      else { pW = plattenB; pH = plattenL; }
    }
    return { pW, pH };
  }, [balkenAktiv, balkenRichtung, plattenAusrichtung, plattenL, plattenB]);

  const balken = useMemo(() => {
    if (!rBounds) return [];
    return computeBalken({ rBounds, balkenRichtung, balkenBreite, balkenAchs, balkenOffset });
  }, [rBounds, balkenRichtung, balkenBreite, balkenAchs, balkenOffset]);

  const plattenPlan = useMemo(() => {
    if (!rBounds || points.length < 3 || gap.dist > 1) return { platten: [], stats: null };
    const { pW, pH } = plattenDims;
    const mod = (a, b) => ((a % b) + b) % b;
    const effOffsetX = anchorRot ? mod(anchorRot.x - rBounds.minX + offsetX, pW) : offsetX;
    const effOffsetY = anchorRot ? mod(anchorRot.y - rBounds.minY + offsetY, pH) : offsetY;
    // Fuge: for Diele with "Fuge nur quer", only transverse (perpendicular to board length)
    // gets a gap. Board length direction = the longer dimension (pW if pW>pH, else pH).
    let fugeX, fugeY;
    if (materialTyp === 'diele' && fugeQuerOnly) {
      const lengthAlongX = pW >= pH;
      fugeX = lengthAlongX ? 0 : fugenBreite;
      fugeY = lengthAlongX ? fugenBreite : 0;
    } else {
      fugeX = fugenBreite;
      fugeY = fugenBreite;
    }
    // Balken-Achsen entlang X (vertikale Balken) oder Y (horizontale Balken)
    const balkenAchsenX = balkenAktiv && balkenRichtung === 'vertikal'
      ? balken.map(b => b.achse)
      : null;
    const balkenAchsenY = balkenAktiv && balkenRichtung === 'horizontal'
      ? balken.map(b => b.achse)
      : null;
    const platten = computePlatten({
      rotPolygon, rBounds, pW, pH,
      offsetX: effOffsetX, offsetY: effOffsetY,
      versatzTyp, versatzWert, versatzRichtung,
      verlegeRichtung, verlegemuster, fischgratRichtung,
      fugeX, fugeY,
      stoesseAufUk: stoesseAufUk && balkenAktiv,
      balkenAchsenX, balkenAchsenY,
    });
    const isFischgrat = verlegemuster.startsWith('fischgrat');
    const stats = computeStats({ platten, points, pW, pH, balken, balkenRichtung, rBounds, rasterwinkelRad, verlegeRichtung, resteNutzen: resteNutzen && !isFischgrat });
    return { platten, stats };
  }, [rBounds, rotPolygon, points, gap.dist, plattenDims, anchorRot, offsetX, offsetY, verlegemuster, verlegeRichtung, fischgratRichtung, fugenBreite, fugeQuerOnly, resteNutzen, materialTyp, balken, balkenRichtung, rasterwinkelRad, balkenAktiv, stoesseAufUk]);

  const polygonFlaeche = useMemo(
    () => (points.length >= 3 ? polygonArea(points) / 10000 : 0),
    [points]
  );

  function updateKante(i, feld, wert) {
    const next = [...kanten];
    next[i] = { ...next[i], [feld]: wert };
    setKanten(next);
  }
  function addKante() { setKanten([...kanten, { laenge: 100, richtung: 'rechts' }]); }
  function removeKante(i) { setKanten(kanten.filter((_, idx) => idx !== i)); }
  function moveKante(i, dir) {
    const next = [...kanten];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setKanten(next);
  }

  function schliessePolygon() {
    if (gap.dist < 0.5) return;
    const absX = Math.abs(gap.dx), absY = Math.abs(gap.dy);
    const neue = [];
    if (absX > 0.5 && absY > 0.5 && Math.abs(absX - absY) < 0.5) {
      const len = Math.hypot(gap.dx, gap.dy);
      const richt = gap.dx > 0
        ? (gap.dy > 0 ? 'rechts-runter' : 'rechts-hoch')
        : (gap.dy > 0 ? 'links-runter' : 'links-hoch');
      neue.push({ laenge: parseFloat(len.toFixed(1)), richtung: richt });
    } else {
      if (absX > 0.5) neue.push({ laenge: parseFloat(absX.toFixed(1)), richtung: gap.dx > 0 ? 'rechts' : 'links' });
      if (absY > 0.5) neue.push({ laenge: parseFloat(absY.toFixed(1)), richtung: gap.dy > 0 ? 'runter' : 'hoch' });
    }
    setKanten([...kanten, ...neue]);
  }

  // Mutual-Exclusion: "Stöße auf UK" lässt sich nicht mit Nut/Feder kombinieren —
  // bei aktiver N/F müsste eine Platte willkürlich gekappt werden, was die N/F-Kanten zerstört.
  function setStoesseAufUkSafe(value) {
    if (value && nutFederAktiv) {
      const ok = typeof window !== 'undefined' && window.confirm(
        'Bei aktivem Nut/Feder-Profil können Platten nicht beliebig gekappt werden — die N/F-Kanten werden sonst zerstört.\n\n' +
        '"Nut/Feder" wird bei Aktivierung von "Stöße auf Unterkonstruktion" automatisch deaktiviert.\n\n' +
        'Fortfahren?'
      );
      if (!ok) return;
      setNutFederAktiv(false);
    }
    setStoesseAufUk(value);
  }
  function setNutFederAktivSafe(value) {
    if (value && stoesseAufUk) {
      const ok = typeof window !== 'undefined' && window.confirm(
        'Nut/Feder ist nicht mit "Stöße auf Unterkonstruktion" kompatibel — die N/F-Kanten werden beim Kappen zerstört.\n\n' +
        '"Stöße auf Unterkonstruktion" wird automatisch deaktiviert.\n\n' +
        'Fortfahren?'
      );
      if (!ok) return;
      setStoesseAufUk(false);
    }
    setNutFederAktiv(value);
  }

  function savePreset() {
    const def = `${plattenL}×${plattenB}`;
    const label = (typeof window !== 'undefined') ? window.prompt('Name für Preset:', def) : def;
    if (!label) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    setCustomPresets(prev => {
      const list = prev[materialTyp] || [];
      // Dupe-Schutz anhand Label+Dimensions
      if (list.some(p => p.label === trimmed && p.l === plattenL && p.b === plattenB)) return prev;
      return { ...prev, [materialTyp]: [...list, { l: plattenL, b: plattenB, label: trimmed }] };
    });
  }

  function deletePreset(idx) {
    setCustomPresets(prev => ({
      ...prev,
      [materialTyp]: (prev[materialTyp] || []).filter((_, i) => i !== idx),
    }));
  }

  function applyMaterial(mat) {
    setMaterialTyp(mat);
    const d = MATERIAL_DEFAULTS[mat];
    setPlattenL(d.l);
    setPlattenB(d.b);
    setFugenBreite(d.fuge);
    setFugeQuerOnly(d.fugeQuerOnly);
    // Wenn neues Material N/F-fähig ist und UK-Stöße aktiv → UK-Stöße still ausschalten
    if (d.nf && stoesseAufUk) setStoesseAufUk(false);
    setNutFederAktiv(!!d.nf);
    if (mat === 'diele') {
      setPlattenAusrichtung('quer');
      setVerlegemuster('drittel');
    } else if (mat === 'fliesen') {
      setPlattenAusrichtung('laengs');
      setVerlegemuster('halb');
    } else if (mat === 'parkett') {
      setPlattenAusrichtung('laengs');
      setVerlegemuster('drittel');
    }
  }

  function presetRechteck() {
    setKanten([
      { laenge: 500, richtung: 'rechts' }, { laenge: 400, richtung: 'runter' },
      { laenge: 500, richtung: 'links' }, { laenge: 400, richtung: 'hoch' },
    ]);
  }
  function presetLForm() {
    setKanten([
      { laenge: 547.4, richtung: 'rechts' }, { laenge: 211.3, richtung: 'runter' },
      { laenge: 161.5, richtung: 'links' }, { laenge: 527.0, richtung: 'runter' },
      { laenge: 442.6, richtung: 'links' }, { laenge: 738.3, richtung: 'hoch' },
    ]);
  }
  function presetSchraege() {
    setKanten([
      { laenge: 500, richtung: 'rechts' }, { laenge: 200, richtung: 'runter' },
      { laenge: 283, richtung: 'links-runter' }, { laenge: 300, richtung: 'links' },
      { laenge: 400, richtung: 'hoch' },
    ]);
  }

  // === Positioning helpers ===

  // ---- Anker Drag & Drop ----
  function svgPointFromEvent(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  function findAnkerSnap(cursorDisplay) {
    // Snap-Kandidaten: 4 BBox-Ecken + alle Polygon-Ecken (im display-Frame = bounds)
    if (!bounds) return null;
    const candidates = [
      { id: 'bbox-oben-links',   x: bounds.minX, y: bounds.minY },
      { id: 'bbox-oben-rechts',  x: bounds.maxX, y: bounds.minY },
      { id: 'bbox-unten-links',  x: bounds.minX, y: bounds.maxY },
      { id: 'bbox-unten-rechts', x: bounds.maxX, y: bounds.maxY },
      ...points.map((p, i) => ({ id: `punkt-${i}`, x: p.x, y: p.y })),
    ];
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - cursorDisplay.x, c.y - cursorDisplay.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  function onAnkerPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const p = svgPointFromEvent(e);
    if (!p) return;
    const snap = findAnkerSnap(p);
    setAnkerDrag({ snapCandidate: snap, currentCursor: p });
    e.target.setPointerCapture?.(e.pointerId);
  }
  function onAnkerPointerMove(e) {
    if (!ankerDrag) return;
    const p = svgPointFromEvent(e);
    if (!p) return;
    const snap = findAnkerSnap(p);
    setAnkerDrag({ snapCandidate: snap, currentCursor: p });
  }
  function onAnkerPointerUp(e) {
    if (!ankerDrag) return;
    if (ankerDrag.snapCandidate) setStartAnker(ankerDrag.snapCandidate.id);
    setAnkerDrag(null);
    e.target.releasePointerCapture?.(e.pointerId);
  }

  function alignToEdge(edgeIdx) {
    if (edgeIdx < 0 || edgeIdx >= points.length) return;
    const p1 = points[edgeIdx];
    const p2 = points[(edgeIdx + 1) % points.length];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    while (angleDeg > 45) angleDeg -= 90;
    while (angleDeg < -45) angleDeg += 90;
    setRasterwinkel(parseFloat(angleDeg.toFixed(2)));
  }

  function autoOptimize() {
    if (!rBounds || !points.length) return;
    setIsOptimizing(true);
    setTimeout(() => {
      const { pW, pH } = plattenDims;
      const steps = 8;
      let best = { verschnitt: Infinity, offsetX: 0, offsetY: 0, versatzWert: 0, versatzTyp: 'kein', versatzRichtung: 'links' };
      const versatzCandidates = [
        { typ: 'kein', w: 0 },
        { typ: 'halb', w: pW / 2 },
        { typ: 'drittel', w: pW / 3 },
      ];
      for (const vc of versatzCandidates) {
        for (const vr of ['links', 'rechts']) {
          for (let i = 0; i < steps; i++) {
            for (let j = 0; j < steps; j++) {
              const ox = (i / steps) * pW;
              const oy = (j / steps) * pH;
              const plat = computePlatten({
                rotPolygon, rBounds, pW, pH,
                offsetX: ox, offsetY: oy,
                versatzTyp: vc.typ, versatzWert: vc.w, versatzRichtung: vr,
                verlegeRichtung,
              });
              if (plat.length === 0) continue;
              const usedArea = plat.reduce((s, p) => s + p.area, 0);
              const purchasedArea = plat.length * pW * pH;
              const vProz = purchasedArea > 0 ? ((purchasedArea - usedArea) / purchasedArea) * 100 : Infinity;
              if (vProz < best.verschnitt) {
                best = { verschnitt: vProz, offsetX: ox, offsetY: oy, versatzWert: vc.w, versatzTyp: vc.typ, versatzRichtung: vr };
              }
            }
          }
        }
      }
      setOffsetX(best.offsetX);
      setOffsetY(best.offsetY);
      // Map best.versatzTyp zurück auf verlegemuster
      const vmap = { kein: 'stapel', halb: 'halb', drittel: 'drittel' };
      setVerlegemuster(vmap[best.versatzTyp] ?? 'stapel');
      setIsOptimizing(false);
    }, 50);
  }

  const polygonPath = points.length >= 3
    ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`
    : '';

  function exportSVG() {
    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'osb-verlegeplan.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveZeichnung() {
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      kanten, balkenBreite, balkenAchs, balkenRichtung, balkenOffset,
      plattenL, plattenB, plattenAusrichtung,
      materialTyp, fugenBreite, fugeQuerOnly, resteNutzen, customPresets,
      startAnker, offsetX, offsetY, rasterwinkel, verlegemuster, verlegeRichtung, fischgratRichtung, nutFederAktiv, balkenAktiv, stoesseAufUk,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `osb-zeichnung_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSavedAt(new Date());
  }

  function loadZeichnungFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.kanten)) setKanten(data.kanten);
        if (typeof data.balkenBreite === 'number') setBalkenBreite(data.balkenBreite);
        if (typeof data.balkenAchs === 'number') setBalkenAchs(data.balkenAchs);
        if (typeof data.balkenRichtung === 'string') setBalkenRichtung(data.balkenRichtung);
        if (typeof data.balkenOffset === 'number') setBalkenOffset(data.balkenOffset);
        if (typeof data.plattenL === 'number') setPlattenL(data.plattenL);
        if (typeof data.plattenB === 'number') setPlattenB(data.plattenB);
        if (typeof data.plattenAusrichtung === 'string') setPlattenAusrichtung(data.plattenAusrichtung);
        if (typeof data.startAnker === 'string') setStartAnker(data.startAnker);
        if (typeof data.offsetX === 'number') setOffsetX(data.offsetX);
        if (typeof data.offsetY === 'number') setOffsetY(data.offsetY);
        if (typeof data.rasterwinkel === 'number') setRasterwinkel(data.rasterwinkel);
        if (typeof data.verlegemuster === 'string') setVerlegemuster(data.verlegemuster);
        else if (typeof data.versatzTyp === 'string') setVerlegemuster(VERSATZ_TO_VERLEGEMUSTER[data.versatzTyp] ?? 'halb');
        if (typeof data.verlegeRichtung === 'string') setVerlegeRichtung(data.verlegeRichtung);
        if (typeof data.fischgratRichtung === 'string') setFischgratRichtung(data.fischgratRichtung);
        if (typeof data.nutFederAktiv === 'boolean') setNutFederAktiv(data.nutFederAktiv);
        if (typeof data.balkenAktiv === 'boolean') setBalkenAktiv(data.balkenAktiv);
        if (typeof data.stoesseAufUk === 'boolean') setStoesseAufUk(data.stoesseAufUk);
        if (typeof data.materialTyp === 'string') setMaterialTyp(data.materialTyp);
        if (typeof data.fugenBreite === 'number') setFugenBreite(data.fugenBreite);
        if (typeof data.fugeQuerOnly === 'boolean') setFugeQuerOnly(data.fugeQuerOnly);
        if (data.customPresets && typeof data.customPresets === 'object') {
          setCustomPresets({
            osb: Array.isArray(data.customPresets.osb) ? data.customPresets.osb : [],
            fliesen: Array.isArray(data.customPresets.fliesen) ? data.customPresets.fliesen : [],
            diele: Array.isArray(data.customPresets.diele) ? data.customPresets.diele : [],
          });
        }
      } catch (err) {
        alert('Datei konnte nicht geladen werden: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function plattenFarbe(row, isFull, ausRest) {
    const basisFarben = [
      { fill: 'rgba(16,185,129,0.20)', stroke: '#10b981' },
      { fill: 'rgba(59,130,246,0.20)', stroke: '#3b82f6' },
      { fill: 'rgba(168,85,247,0.20)', stroke: '#a855f7' },
      { fill: 'rgba(236,72,153,0.20)', stroke: '#ec4899' },
      { fill: 'rgba(234,179,8,0.20)', stroke: '#eab308' },
      { fill: 'rgba(14,165,233,0.20)', stroke: '#0ea5e9' },
    ];
    if (!isFull) {
      if (ausRest) return { fill: 'rgba(249,115,22,0.20)', stroke: '#f97316' };  // orange = Zuschnitt aus Rest
      return { fill: 'rgba(239,68,68,0.20)', stroke: '#ef4444' };                // rot = neuer Zuschnitt
    }
    return basisFarben[row % basisFarben.length];
  }

  const polygonGeschlossen = gap.dist <= 0.5 && kanten.length >= 3;
  const canvasZeigePlatten = mode === 'parameter' && showPlatten;
  const canvasZeigeBalken  = balkenAktiv && ((mode === 'parameter' && showBalken) || mode === 'zeichnen');
  const canvasZeigeLabels  = mode === 'zeichnen' || showLabels;

  const rotateTransform = `rotate(${rasterwinkel} ${center.x} ${center.y})`;

  return (
    <div className="paper-theme w-full h-screen flex flex-col" style={{ color: 'var(--ink)' }}>
      <header className="d-topbar">
        <button
          className="d-hamburger d-icon-btn"
          onClick={() => setMobileDrawerOpen(v => !v)}
          aria-label="Menü"
        >
          {/* Hamburger-Icon (3 Striche) */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <line x1="3" y1="6"  x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="d-brand">
          <div className="d-brand-mark">V</div>
          <div>
            <h1>Verlege-Rechner</h1>
            <div className="d-sub">OSB · Fliesen · Dielen · Parkett</div>
          </div>
        </div>

        <div className="d-mode-toggle">
          <button onClick={() => { setMode('zeichnen'); setMobileDrawerOpen(false); }} className={mode === 'zeichnen' ? 'on' : ''}>
            <Edit3 size={15} /><span> Zeichnen</span>
          </button>
          <button
            onClick={() => { setMode('parameter'); setMobileDrawerOpen(false); }}
            className={mode === 'parameter' ? 'on' : ''}
            disabled={!polygonGeschlossen}
            title={!polygonGeschlossen ? 'Polygon zuerst schließen' : ''}
          >
            <Sliders size={15} /><span> Parameter</span>
          </button>
        </div>

        <div className="d-top-actions">
          <button
            onClick={undo}
            disabled={historyRef.current.past.length < 2}
            className="d-icon-btn"
            title="Rückgängig (⌘Z / Ctrl+Z)"
            style={{ opacity: historyRef.current.past.length < 2 ? 0.35 : 1 }}
          >
            <RotateCw size={17} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <button
            onClick={redo}
            disabled={historyRef.current.future.length === 0}
            className="d-icon-btn"
            title="Wiederholen (⇧⌘Z / Ctrl+Shift+Z)"
            style={{ opacity: historyRef.current.future.length === 0 ? 0.35 : 1 }}
          >
            <RotateCw size={17} />
          </button>
          <span style={{ width: 6 }} />
          <button onClick={saveZeichnung} className="d-icon-btn" title="Zeichnung als JSON speichern"><Save size={17} /></button>
          <button onClick={() => fileInputRef.current?.click()} className="d-icon-btn" title="JSON laden"><Upload size={17} /></button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) loadZeichnungFromFile(f);
              e.target.value = '';
            }}
          />
          <button onClick={exportSVG} className="d-btn primary" title="SVG exportieren"><Download size={15} /><span className="d-mobile-text">Drucken</span></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`mobile-drawer-overlay ${mobileDrawerOpen ? 'open' : ''}`}
          onClick={() => setMobileDrawerOpen(false)}
        />
        <aside className={`w-96 bg-slate-900 border-r border-slate-800 overflow-y-auto mobile-drawer-host ${mobileDrawerOpen ? 'open' : ''}`}>

          {mode === 'zeichnen' && (
            <>
              <section className="p-4 border-b border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <Edit3 size={16} /> Kanten definieren
                  </h2>
                  <div className="flex gap-1">
                    <button onClick={presetRechteck} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px]">□ Rechteck</button>
                    <button onClick={presetLForm} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px]">⌐ L-Form</button>
                    <button onClick={presetSchraege} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px]">◢ Schräge</button>
                  </div>
                </div>

                <div className="space-y-1 mb-2">
                  <div className="grid grid-cols-[20px_90px_1fr_24px_24px_24px] gap-1 text-[10px] text-slate-400 px-1 mb-1">
                    <span>#</span><span>Länge (cm)</span><span>Richtung</span><span></span><span></span><span></span>
                  </div>
                  {kanten.map((k, i) => (
                    <div key={i} className="grid grid-cols-[20px_90px_1fr_24px_24px_24px] gap-1 items-center">
                      <span className="text-xs text-slate-500 font-mono">{i + 1}</span>
                      <input
                        type="number" step="0.1" value={k.laenge}
                        onChange={e => updateKante(i, 'laenge', parseFloat(e.target.value) || 0)}
                        className="bg-slate-800 rounded px-2 py-1 text-xs font-mono w-full"
                      />
                      <select
                        value={k.richtung}
                        onChange={e => updateKante(i, 'richtung', e.target.value)}
                        className="bg-slate-800 rounded px-1 py-1 text-xs w-full"
                      >
                        <optgroup label="90°">
                          <option value="rechts">→ rechts</option>
                          <option value="runter">↓ runter</option>
                          <option value="links">← links</option>
                          <option value="hoch">↑ hoch</option>
                        </optgroup>
                        <optgroup label="45°">
                          <option value="rechts-runter">↘ rechts-runter</option>
                          <option value="links-runter">↙ links-runter</option>
                          <option value="rechts-hoch">↗ rechts-hoch</option>
                          <option value="links-hoch">↖ links-hoch</option>
                        </optgroup>
                      </select>
                      <button onClick={() => moveKante(i, -1)} disabled={i === 0} className="p-1 hover:bg-slate-800 rounded disabled:opacity-30" title="Nach oben"><ArrowUp size={12} /></button>
                      <button onClick={() => moveKante(i, 1)} disabled={i === kanten.length - 1} className="p-1 hover:bg-slate-800 rounded disabled:opacity-30" title="Nach unten"><ArrowDown size={12} /></button>
                      <button onClick={() => removeKante(i)} className="p-1 hover:bg-red-900 rounded text-red-400" title="Löschen"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={addKante} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold flex items-center justify-center gap-2 text-white">
                    <Plus size={12} /> Kante
                  </button>
                  <button
                    onClick={() => setPenMode(v => !v)}
                    className={`px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-2 ${penMode ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}
                    title="Im Canvas klicken, um Punkte zu platzieren (Snap: 45° / 90°). ESC zum Beenden."
                  >
                    <Edit3 size={12} /> {penMode ? 'Pen aktiv' : 'Pen-Modus'}
                  </button>
                </div>
                {penMode && (
                  <div className="mt-2 px-3 py-2 rounded text-[11px]" style={{ background: 'var(--amber-bg)', color: 'var(--amber-ink)', border: '1px solid var(--amber)', lineHeight: 1.4 }}>
                    ✏ <b>Klick</b> platziert Punkt (Snap auf 45°/90°). <br/>
                    🔢 Während Preview <b>Zahl tippen</b> → exaktes Maß; <kbd>Enter</kbd> bestätigt.<br/>
                    🖐 <b>Mittelklick</b> zum Pannen · <kbd>Esc</kbd> zum Beenden
                  </div>
                )}

                {gap.dist > 0.5 && (
                  <div className="mt-3 bg-red-950/50 border border-red-700 rounded p-2 text-xs">
                    <p className="font-bold text-red-400 mb-1">⚠ Polygon schließt nicht!</p>
                    <p>Abstand zum Startpunkt: <span className="font-mono font-bold">{gap.dist.toFixed(1)} cm</span></p>
                    <p className="text-slate-400 mt-1">Benötigt: <span className="font-mono">Δx={gap.dx.toFixed(1)}, Δy={gap.dy.toFixed(1)}</span></p>
                    <button onClick={schliessePolygon} className="w-full mt-2 px-2 py-1.5 bg-red-800 hover:bg-red-700 rounded text-xs font-bold">
                      Polygon automatisch schließen
                    </button>
                  </div>
                )}
                {polygonGeschlossen && (
                  <div className="mt-3 bg-emerald-950/50 border border-emerald-700 rounded p-2 text-xs">
                    <p className="font-bold text-emerald-400">✓ Polygon geschlossen</p>
                  </div>
                )}
              </section>

              <section className="p-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-amber-400 mb-3">🪵 Balken-Raster</h2>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 pb-2 border-b border-slate-800">
                    <input type="checkbox" checked={balkenAktiv} onChange={e => setBalkenAktiv(e.target.checked)} />
                    Balken verwenden
                  </label>
                  <div className={balkenAktiv ? '' : 'opacity-40 pointer-events-none'}>
                    <div>
                      <label className="block text-slate-400 mb-1">Richtung</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setBalkenRichtung('vertikal')} className={`px-2 py-2 rounded text-xs ${balkenRichtung === 'vertikal' ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}>↕ Vertikal</button>
                        <button onClick={() => setBalkenRichtung('horizontal')} className={`px-2 py-2 rounded text-xs ${balkenRichtung === 'horizontal' ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}>↔ Horizontal</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Breite (cm)</label>
                        <input type="number" step="0.5" value={balkenBreite} onChange={e => setBalkenBreite(Number(e.target.value))} className="w-full bg-slate-800 rounded px-2 py-1 font-mono" />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Achsabstand (cm)</label>
                        <input type="number" step="0.5" value={balkenAchs} onChange={e => setBalkenAchs(Number(e.target.value))} className="w-full bg-slate-800 rounded px-2 py-1 font-mono" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-slate-400 mb-1">Offset: {balkenOffset} cm</label>
                      <input type="range" min="0" max={balkenAchs} step="0.5" value={balkenOffset} onChange={e => setBalkenOffset(Number(e.target.value))} className="w-full" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="p-4">
                <h2 className="text-sm font-bold text-amber-400 mb-3">📐 Geometrie</h2>
                <div className="space-y-2 text-xs">
                  <StatRow label="Anzahl Kanten" value={kanten.length} />
                  <StatRow label="Umfang" value={`${(umfang / 100).toFixed(2)} m`} />
                  <StatRow label="Fläche" value={`${polygonFlaeche.toFixed(2)} m²`} highlight={polygonGeschlossen} />
                  <StatRow label="Status" value={polygonGeschlossen ? 'geschlossen' : 'offen'} highlight={polygonGeschlossen} warn={!polygonGeschlossen} />
                  {polygonGeschlossen && (
                    <div className="pt-2 mt-2 border-t border-slate-800 text-slate-400">
                      Wechsle in den <span className="text-amber-400 font-bold">Parameter</span>-Modus,
                      um Material und Verlegemuster zu konfigurieren.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {mode === 'parameter' && (
            <>
              {/* ============ 1. MATERIAL & MAßE ============ */}
              <section className="p-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                  <Package size={16} /> {MATERIAL_LABEL[materialTyp]}
                </h2>
                <div className="space-y-3 text-xs">
                  {/* 1. Kategorie */}
                  <div>
                    <label className="block text-slate-400 mb-1">Kategorie</label>
                    <div className="grid grid-cols-2 gap-1">
                      {['osb', 'fliesen', 'diele', 'parkett'].map(m => (
                        <button
                          key={m}
                          onClick={() => applyMaterial(m)}
                          className={`px-2 py-1.5 rounded text-[11px] ${materialTyp === m ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}
                        >
                          {MATERIAL_LABEL[m]}
                        </button>
                      ))}
                    </div>
                    {materialTyp !== 'fliesen' && (
                      <label className="flex items-center gap-2 mt-2 text-slate-300">
                        <input type="checkbox" checked={nutFederAktiv} onChange={e => setNutFederAktivSafe(e.target.checked)} />
                        {materialTyp === 'parkett' ? 'Klicksystem (N/F)' : 'Nut/Feder'}
                        <span className="text-[10px] text-slate-500">— Maße = sichtbare Außenmaße</span>
                      </label>
                    )}
                  </div>

                  {/* 2. Länge / Breite */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">Länge (cm)</label>
                      <input type="number" step="0.1" value={plattenL} onChange={e => setPlattenL(Number(e.target.value))} className="w-full bg-slate-800 rounded px-2 py-1 font-mono" />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Breite (cm)</label>
                      <input type="number" step="0.1" value={plattenB} onChange={e => setPlattenB(Number(e.target.value))} className="w-full bg-slate-800 rounded px-2 py-1 font-mono" />
                    </div>
                  </div>

                  {/* 3. Presets */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400">Presets</label>
                      <button
                        onClick={savePreset}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 rounded text-[10px] font-bold"
                        title="Aktuelle Maße als eigenes Preset speichern"
                      >
                        + aktuell speichern
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {MATERIAL_PRESETS[materialTyp].map((p, i) => (
                        <button
                          key={`std-${i}`}
                          onClick={() => { setPlattenL(p.l); setPlattenB(p.b); }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px]"
                        >
                          {p.label}
                        </button>
                      ))}
                      {(customPresets[materialTyp] || []).map((p, i) => (
                        <div key={`cust-${i}`} className="relative group">
                          <button
                            onClick={() => { setPlattenL(p.l); setPlattenB(p.b); }}
                            className="w-full text-left px-2 py-1 pr-5 bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-700/50 rounded text-[10px] truncate"
                            title={`${p.l}×${p.b} cm — ${p.label}`}
                          >
                            ★ {p.label}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePreset(i); }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-red-400 hover:text-red-300 text-sm leading-none px-1"
                            title="Preset löschen"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fugenbreite (nur Fliesen/Diele ohne N/F-Klick) */}
                  {(materialTyp === 'fliesen' || (materialTyp === 'diele' && !nutFederAktiv)) && (
                    <div>
                      <label className="block text-slate-400 mb-1">
                        Fugenbreite: {(fugenBreite * 10).toFixed(1)} mm
                      </label>
                      <input
                        type="range"
                        min="0"
                        max={materialTyp === 'diele' ? 1.5 : 1.0}
                        step="0.05"
                        value={fugenBreite}
                        onChange={e => setFugenBreite(Number(e.target.value))}
                        className="w-full"
                      />
                      {materialTyp === 'diele' && (
                        <label className="flex items-center gap-2 mt-2">
                          <input type="checkbox" checked={fugeQuerOnly} onChange={e => setFugeQuerOnly(e.target.checked)} />
                          Fuge nur zwischen Dielen
                        </label>
                      )}
                    </div>
                  )}

                  {/* 4. Ausrichtung (nur wenn Balken aktiv) */}
                  {balkenAktiv && (
                    <div>
                      <label className="block text-slate-400 mb-1">Ausrichtung (relativ zu Balken)</label>
                      <div className="grid grid-cols-1 gap-1">
                        <button onClick={() => setPlattenAusrichtung('laengs')} className={`px-2 py-1 rounded text-left ${plattenAusrichtung === 'laengs' ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}>
                          Länge ∥ Balken {materialTyp === 'osb' && '(empfohlen)'}
                        </button>
                        <button onClick={() => setPlattenAusrichtung('quer')} className={`px-2 py-1 rounded text-left ${plattenAusrichtung === 'quer' ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}>
                          Länge ⊥ Balken
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ============ 2. POSITION (Anker-Offset + Rasterwinkel) ============ */}
              <section className="p-4 border-b border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <Sliders size={16} /> Position
                  </h2>
                  <button
                    onClick={autoOptimize}
                    disabled={isOptimizing}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded text-[10px] font-bold flex items-center gap-1"
                    title="Offset + Versatz optimieren (min. Verschnitt)"
                  >
                    <Wand2 size={12} /> {isOptimizing ? 'Suche…' : 'Auto'}
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <p className="text-[10px] text-slate-500">
                    Anker per <span className="text-emerald-400 font-bold">Drag&Drop</span> im Zeichnungs-Canvas verschieben (grünes Fadenkreuz).
                  </p>

                  <div>
                    <label className="block text-slate-400 mb-1">Anker-Offset X (cm): {offsetX.toFixed(1)}</label>
                    <input type="range" min="0" max={plattenDims.pW} step="0.5" value={Math.min(offsetX, plattenDims.pW)} onChange={e => setOffsetX(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Anker-Offset Y (cm): {offsetY.toFixed(1)}</label>
                    <input type="range" min="0" max={plattenDims.pH} step="0.5" value={Math.min(offsetY, plattenDims.pH)} onChange={e => setOffsetY(Number(e.target.value))} className="w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => { setOffsetX(0); setOffsetY(0); }} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px]">
                      Offsets zurücksetzen
                    </button>
                    <button
                      onClick={() => {
                        const p1Idx = Number(startAnker.startsWith('punkt-') ? startAnker.slice(6) : 0);
                        alignToEdge(p1Idx);
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px]"
                      title="Dreht Raster parallel zur Kante, die am Anker beginnt"
                    >
                      ↻ Raster an Ankerkante
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400">Rasterwinkel: {rasterwinkel.toFixed(1)}°</label>
                      <button onClick={() => setRasterwinkel(0)} className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                        <RotateCw size={10} /> 0°
                      </button>
                    </div>
                    <input type="range" min="-45" max="45" step="0.5" value={rasterwinkel} onChange={e => setRasterwinkel(Number(e.target.value))} className="w-full" />
                    {points.length >= 3 && (
                      <select
                        onChange={e => { const v = e.target.value; if (v !== '') alignToEdge(Number(v)); e.target.value = ''; }}
                        className="w-full bg-slate-800 rounded px-2 py-1 text-xs mt-1"
                        defaultValue=""
                      >
                        <option value="">⤴ An Polygon-Kante ausrichten…</option>
                        {points.map((p, i) => {
                          const p2 = points[(i + 1) % points.length];
                          const len = Math.hypot(p2.x - p.x, p2.y - p.y);
                          return <option key={i} value={i}>Kante {i + 1} → {i + 2 > points.length ? 1 : i + 2} ({len.toFixed(1)} cm)</option>;
                        })}
                      </select>
                    )}
                  </div>
                </div>
              </section>

              {/* ============ 3. VERLEGEMUSTER (Icon-Grid) + Richtung ============ */}
              <section className="p-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                  <Grid3x3 size={16} /> Verlegemuster
                </h2>
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { v: 'stapel',            l: 'Stapel' },
                      { v: 'halb',              l: 'Halbverband' },
                      { v: 'drittel',           l: 'Drittelverband' },
                      { v: 'rest',              l: 'Restverband' },
                      { v: 'fischgrat',         l: 'Fischgrät' },
                      { v: 'fischgrat-doppelt', l: 'Doppel-Fischgrät' },
                      { v: 'fischgrat-franz',   l: 'Französisch' },
                    ].map(opt => (
                      <button
                        key={opt.v}
                        onClick={() => setVerlegemuster(opt.v)}
                        title={opt.l}
                        className={`flex flex-col items-center justify-center gap-1 px-1 py-2 rounded border transition ${
                          verlegemuster === opt.v
                            ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                            : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400'
                        }`}
                      >
                        <VerlegemusterIcon type={opt.v} size={28} />
                        <span className="text-[9px] leading-tight text-center">{opt.l}</span>
                      </button>
                    ))}
                  </div>

                  {/* Richtungs-Picker – Fischgrät vs. Standard */}
                  {verlegemuster.startsWith('fischgrat') ? (
                    <div>
                      <label className="block text-slate-400 mb-1">Steigung</label>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => setFischgratRichtung('rechts')} className={`px-2 py-1.5 rounded ${fischgratRichtung === 'rechts' ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}>↗ Rechtssteigend</button>
                        <button onClick={() => setFischgratRichtung('links')} className={`px-2 py-1.5 rounded ${fischgratRichtung === 'links' ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}>↖ Linkssteigend</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-slate-400 mb-1">Verlegerichtung</label>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { v: 'hoch',   l: '↑' },
                          { v: 'runter', l: '↓' },
                          { v: 'links',  l: '←' },
                          { v: 'rechts', l: '→' },
                        ].map(opt => (
                          <button
                            key={opt.v}
                            onClick={() => setVerlegeRichtung(opt.v)}
                            className={`px-2 py-1.5 rounded ${verlegeRichtung === opt.v ? 'bg-amber-600 font-bold' : 'bg-slate-800 hover:bg-slate-700'}`}
                          >
                            {opt.l}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {verlegeRichtung === 'hoch' || verlegeRichtung === 'runter'
                          ? 'Spaltenweise verlegt — Reststück jeder Spalte startet die nächste.'
                          : 'Reihenweise verlegt — Reststück jeder Reihe startet die nächste.'}
                      </p>
                    </div>
                  )}

                  {balkenAktiv && !verlegemuster.startsWith('fischgrat') && (() => {
                    const horizontalPlanks = verlegeRichtung === 'links' || verlegeRichtung === 'rechts';
                    const senkrecht = horizontalPlanks
                      ? balkenRichtung === 'vertikal'
                      : balkenRichtung === 'horizontal';
                    return (
                      <div className="border-t border-slate-800 pt-3">
                        <label className={`flex items-center gap-2 ${senkrecht ? 'text-slate-300' : 'text-slate-500'}`}>
                          <input
                            type="checkbox"
                            checked={stoesseAufUk}
                            onChange={e => setStoesseAufUkSafe(e.target.checked)}
                            disabled={!senkrecht}
                          />
                          Stöße auf Unterkonstruktion
                        </label>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {senkrecht
                            ? 'Plankenstöße werden exakt auf der letzten möglichen Balkenachse gekappt.'
                            : 'Nur verfügbar, wenn Planken senkrecht zu den Balken laufen.'}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </section>

              <section className="p-4 border-b border-slate-800">
                <h2 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                  <Eye size={16} /> Anzeige
                </h2>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showBalken} onChange={e => setShowBalken(e.target.checked)} />Balken anzeigen</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showPlatten} onChange={e => setShowPlatten(e.target.checked)} />Platten anzeigen</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showPlattenNr} onChange={e => setShowPlattenNr(e.target.checked)} />Plattennummern</label>
                  {nutFederAktiv && (
                    <label className="flex items-center gap-2"><input type="checkbox" checked={showNutFeder} onChange={e => setShowNutFeder(e.target.checked)} />Nut/Feder-Kanten</label>
                  )}
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />Kantenlängen</label>
                </div>
              </section>

            </>
          )}
        </aside>

        <main className="flex-1 bg-slate-950 relative overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${effViewBox.x} ${effViewBox.y} ${effViewBox.w} ${effViewBox.h}`}
            className="w-full h-full"
            style={{
              backgroundColor: 'var(--card)',
              backgroundImage:
                'linear-gradient(rgba(60,40,20,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(60,40,20,.05) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              cursor: penMode ? 'crosshair' : (isPanning ? 'grabbing' : 'grab'),
              touchAction: 'none',
            }}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onClick={handlePenClick}
          >
            <defs>
              <pattern id="grid10" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.5" fill="#8b7a5a" opacity="0.4" />
              </pattern>
              <pattern id="grid100" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#a88b55" strokeWidth="0.5" opacity="0.35" />
              </pattern>
              {rotPolygon.length >= 3 && (
                <clipPath id="flaechen-clip-rot">
                  <path d={`M ${rotPolygon.map(p => `${p.x},${p.y}`).join(' L ')} Z`} />
                </clipPath>
              )}
            </defs>

            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid10)" />
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid100)" />

            {points.length >= 3 && (
              <path d={polygonPath} fill="rgba(200,122,31,0.04)" stroke="#2a1f12" strokeWidth="2.5" strokeLinejoin="round" />
            )}

            <g transform={rotateTransform}>
              {canvasZeigeBalken && rBounds && gap.dist < 1 && (
                <g clipPath="url(#flaechen-clip-rot)">
                  {balken.map((b, i) => (
                    <g key={i}>
                      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(180,83,9,0.35)" stroke="rgba(217,119,6,0.6)" strokeWidth="0.4" />
                      {balkenRichtung === 'vertikal' ? (
                        <line x1={b.achse} y1={b.y} x2={b.achse} y2={b.y + b.h} stroke="rgba(217,119,6,0.8)" strokeWidth="0.3" strokeDasharray="4,2" />
                      ) : (
                        <line x1={b.x} y1={b.achse} x2={b.x + b.w} y2={b.achse} stroke="rgba(217,119,6,0.8)" strokeWidth="0.3" strokeDasharray="4,2" />
                      )}
                    </g>
                  ))}
                </g>
              )}

              {canvasZeigePlatten && (
                <g clipPath="url(#flaechen-clip-rot)">
                  {plattenPlan.platten.map((p) => {
                    const farbe = plattenFarbe(p.row, p.isFull, resteNutzen && plattenPlan.stats?.ausRestIds?.has(p.id));
                    const isLandscape = p.w > p.h;
                    // Fischgrät-Platten mit rotation≠0 als Polygon-Pfad (Corners bereits im Display-Frame)
                    if (p.corners && p.corners.length === 4) {
                      const d = `M ${p.corners.map(c => `${c.x},${c.y}`).join(' L ')} Z`;
                      return (
                        <g key={p.id}>
                          <path d={d} fill={farbe.fill} stroke={farbe.stroke} strokeWidth="2" />
                        </g>
                      );
                    }
                    return (
                      <g key={p.id}>
                        <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={farbe.fill} stroke={farbe.stroke} strokeWidth="2" />
                        {showNutFeder && nutFederAktiv && p.isFull && (
                          isLandscape ? (
                            <>
                              <line x1={p.x + 2} y1={p.y + 1.5} x2={p.x + p.w - 2} y2={p.y + 1.5} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
                              <line x1={p.x + 2} y1={p.y + p.h - 1.5} x2={p.x + p.w - 2} y2={p.y + p.h - 1.5} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
                            </>
                          ) : (
                            <>
                              <line x1={p.x + 1.5} y1={p.y + 2} x2={p.x + 1.5} y2={p.y + p.h - 2} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
                              <line x1={p.x + p.w - 1.5} y1={p.y + 2} x2={p.x + p.w - 1.5} y2={p.y + p.h - 2} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
                            </>
                          )
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {canvasZeigePlatten && plattenPlan.platten.filter(p => !p.isFull && p.biggest).map((p) => {
                const xs = p.biggest.map(pt => pt.x);
                const ys = p.biggest.map(pt => pt.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                const cw = maxX - minX, ch = maxY - minY;
                if (cw < 20 || ch < 20) return null;
                const cxm = (minX + maxX) / 2;
                const cym = (minY + maxY) / 2;
                return (
                  <g key={`cut-${p.id}`} pointerEvents="none">
                    <text x={cxm} y={minY + 9} textAnchor="middle" fontSize="8" fill="#fca5a5" fontFamily="monospace" fontWeight="bold">
                      ↔ {cw.toFixed(1)}
                    </text>
                    <text x={minX + 6} y={cym} textAnchor="middle" fontSize="8" fill="#fca5a5" fontFamily="monospace" fontWeight="bold"
                      transform={`rotate(-90 ${minX + 6} ${cym})`}>
                      ↕ {ch.toFixed(1)}
                    </text>
                  </g>
                );
              })}
            </g>

            {canvasZeigePlatten && showPlattenNr && plattenPlan.platten.map((p) => {
              if (p.area <= 3000 || !p.biggest) return null;
              const cxRot = p.biggest.reduce((s, pt) => s + pt.x, 0) / p.biggest.length;
              const cyRot = p.biggest.reduce((s, pt) => s + pt.y, 0) / p.biggest.length;
              const { x: cx, y: cy } = rotatePt({ x: cxRot, y: cyRot }, center.x, center.y, rasterwinkelRad);
              const farbe = plattenFarbe(p.row, p.isFull);
              return (
                <g key={`lbl-${p.id}`} pointerEvents="none">
                  <rect x={cx - 24} y={cy - 16} width="48" height="30" rx="4" fill="rgba(2,6,23,0.88)" stroke={farbe.stroke} strokeWidth="1" />
                  <text x={cx} y={cy - 3} textAnchor="middle" fontSize="13" fill={farbe.stroke} fontFamily="monospace" fontWeight="bold">#{p.id}</text>
                  <text x={cx} y={cy + 9} textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="monospace">
                    {p.isFull ? 'voll' : `${(p.area / 10000).toFixed(2)}m²`}
                  </text>
                </g>
              );
            })}

            {points.map((p, i) => {
              const isAnker = startAnker === `punkt-${i}`;
              return (
                <g key={`pt-${i}`}>
                  <circle cx={p.x} cy={p.y} r={isAnker ? 7 : 5} fill={isAnker ? '#10b981' : '#fbbf24'} stroke="#020617" strokeWidth="2" />
                  <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill={isAnker ? '#10b981' : '#fbbf24'} fontFamily="monospace" fontWeight="bold">P{i + 1}</text>
                </g>
              );
            })}

            {mode === 'parameter' && anchorDisplay && (() => {
              const dragging = !!ankerDrag;
              const color = dragging ? '#fbbf24' : '#10b981';
              const pos = dragging && ankerDrag.snapCandidate ? ankerDrag.snapCandidate : anchorDisplay;
              return (
                <g>
                  {/* Snap-Kandidaten während Drag hervorheben */}
                  {dragging && bounds && (
                    <g pointerEvents="none" opacity="0.6">
                      {[
                        { x: bounds.minX, y: bounds.minY },
                        { x: bounds.maxX, y: bounds.minY },
                        { x: bounds.minX, y: bounds.maxY },
                        { x: bounds.maxX, y: bounds.maxY },
                        ...points,
                      ].map((c, i) => (
                        <circle key={i} cx={c.x} cy={c.y} r="6" fill="none" stroke="#fbbf24" strokeWidth="1" strokeDasharray="2,2" />
                      ))}
                    </g>
                  )}
                  <g pointerEvents="none">
                    <circle cx={pos.x} cy={pos.y} r="9" fill="none" stroke={color} strokeWidth="2" strokeDasharray="3,2" />
                    <line x1={pos.x - 14} y1={pos.y} x2={pos.x + 14} y2={pos.y} stroke={color} strokeWidth="1.2" />
                    <line x1={pos.x} y1={pos.y - 14} x2={pos.x} y2={pos.y + 14} stroke={color} strokeWidth="1.2" />
                    <text x={pos.x + 12} y={pos.y - 12} fontSize="10" fill={color} fontFamily="monospace" fontWeight="bold">
                      {dragging ? '⤧ Anker' : 'Anker'}
                    </text>
                  </g>
                  {/* Großer, transparenter Klick-Hitbox-Kreis für Drag */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="16"
                    fill="transparent"
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onPointerDown={onAnkerPointerDown}
                    onPointerMove={onAnkerPointerMove}
                    onPointerUp={onAnkerPointerUp}
                    onPointerCancel={onAnkerPointerUp}
                  />
                </g>
              );
            })()}

            {gap.dist > 0.5 && points.length >= 2 && (
              <line x1={points[points.length - 1].x} y1={points[points.length - 1].y} x2={points[0].x} y2={points[0].y} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3" />
            )}

            {/* Pen-Modus: Start-Marker + Preview-Linie + Live-Maß */}
            {penMode && (
              <g pointerEvents="none">
                {/* Start-Punkt (Fadenkreuz) */}
                <circle cx={penStart.x} cy={penStart.y} r="6" fill="none" stroke="#c87a1f" strokeWidth="2" />
                <circle cx={penStart.x} cy={penStart.y} r="2.5" fill="#c87a1f" />
                {penDisplay && (() => {
                  const midX = (penStart.x + penDisplay.endX) / 2;
                  const midY = (penStart.y + penDisplay.endY) / 2;
                  const dx = penDisplay.endX - penStart.x;
                  const dy = penDisplay.endY - penStart.y;
                  const len = Math.hypot(dx, dy);
                  const nx = len > 0 ? -dy / len * 22 : 0;
                  const ny = len > 0 ? dx / len * 22 : 0;
                  const typed = !!penDisplay.typedText;
                  const lineColor = typed ? '#3f7a3a' : '#c87a1f';   // grün = getippt, orange = Cursor
                  const bgColor   = typed ? '#3f7a3a' : '#1f1b16';
                  const fgColor   = typed ? '#ffffff' : '#f4dfb2';
                  const labelText = typed
                    ? `${penDisplay.typedText.replace('.', ',')}| cm`
                    : `${penDisplay.length.toFixed(1).replace('.', ',')} cm`;
                  const pillW = Math.max(78, labelText.length * 8 + 20);
                  return (
                    <>
                      <line
                        x1={penStart.x} y1={penStart.y}
                        x2={penDisplay.endX} y2={penDisplay.endY}
                        stroke={lineColor} strokeWidth="2.5" strokeDasharray="6,4" strokeLinecap="round"
                      />
                      <circle cx={penDisplay.endX} cy={penDisplay.endY} r="5" fill={lineColor} stroke="#6a3c0c" strokeWidth="1.5" />
                      {/* Live-Maß-Pill */}
                      <g>
                        <rect
                          x={midX + nx - pillW / 2} y={midY + ny - 13}
                          width={pillW} height="26" rx="7"
                          fill={bgColor} stroke={lineColor} strokeWidth="1.5"
                        />
                        <text
                          x={midX + nx} y={midY + ny + 5} textAnchor="middle"
                          fontSize="13" fontFamily="JetBrains Mono" fontWeight="700" fill={fgColor}
                        >
                          {labelText}
                        </text>
                        {typed && (
                          <text
                            x={midX + nx} y={midY + ny + 20} textAnchor="middle"
                            fontSize="8" fontFamily="Inter Tight, sans-serif" fontWeight="600" fill="rgba(255,255,255,0.65)"
                          >
                            ↵ Enter
                          </text>
                        )}
                      </g>
                    </>
                  );
                })()}
              </g>
            )}

            {canvasZeigeLabels && points.length >= 3 && (() => {
              let sArea = 0;
              for (let i = 0; i < points.length; i++) {
                const j = (i + 1) % points.length;
                sArea += points[i].x * points[j].y - points[j].x * points[i].y;
              }
              const sign = sArea > 0 ? 1 : -1;
              const extStart = 6;   // extension line starts this far from polygon
              const dimLine = 28;   // dimension line offset from polygon
              const extEnd = 34;    // extension line ends slightly past dim line
              const textOff = 38;   // text offset
              return points.map((p1, i) => {
                const p2 = points[(i + 1) % points.length];
                if (!p1 || !p2) return null;
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy);
                if (len < 1) return null;
                const nx = sign * dy / len;
                const ny = -sign * dx / len;
                const e1a = { x: p1.x + nx * extStart, y: p1.y + ny * extStart };
                const e1b = { x: p1.x + nx * extEnd,   y: p1.y + ny * extEnd };
                const e2a = { x: p2.x + nx * extStart, y: p2.y + ny * extStart };
                const e2b = { x: p2.x + nx * extEnd,   y: p2.y + ny * extEnd };
                const d1  = { x: p1.x + nx * dimLine,  y: p1.y + ny * dimLine };
                const d2  = { x: p2.x + nx * dimLine,  y: p2.y + ny * dimLine };
                const tx = (p1.x + p2.x) / 2 + nx * textOff;
                const ty = (p1.y + p2.y) / 2 + ny * textOff;
                let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angleDeg > 90) angleDeg -= 180;
                if (angleDeg < -90) angleDeg += 180;
                const isEditing = editingKante === i;
                return (
                  <g key={`dim-${i}`}>
                    <g pointerEvents="none">
                      <line x1={e1a.x} y1={e1a.y} x2={e1b.x} y2={e1b.y} stroke="#60a5fa" strokeWidth="0.6" opacity="0.75" />
                      <line x1={e2a.x} y1={e2a.y} x2={e2b.x} y2={e2b.y} stroke="#60a5fa" strokeWidth="0.6" opacity="0.75" />
                      <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke="#60a5fa" strokeWidth="0.8" opacity="0.9" />
                    </g>
                    {isEditing ? (
                      <foreignObject x={tx - 42} y={ty - 14} width="84" height="28"
                        transform={`rotate(${angleDeg} ${tx} ${ty})`}>
                        <input
                          type="number" step="0.1" autoFocus
                          defaultValue={kanten[i]?.laenge ?? len}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v) && v > 0) updateKante(i, 'laenge', v);
                            setEditingKante(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            else if (e.key === 'Escape') { e.stopPropagation(); setEditingKante(null); }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%', height: '100%', textAlign: 'center',
                            border: '2px solid var(--amber)', borderRadius: '6px',
                            background: 'var(--card)', color: 'var(--ink)',
                            fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                            fontSize: '13px', outline: 'none', padding: 0,
                          }}
                        />
                      </foreignObject>
                    ) : (
                      <g
                        onClick={(e) => { e.stopPropagation(); setEditingKante(i); }}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Hitbox damit klickbar */}
                        <rect x={tx - 26} y={ty - 10} width="52" height="20" rx="4"
                          fill="transparent"
                          transform={`rotate(${angleDeg} ${tx} ${ty})`} />
                        <text x={tx} y={ty + 3} textAnchor="middle" fontSize="11" fill="#93c5fd" fontFamily="monospace" fontWeight="bold"
                          transform={`rotate(${angleDeg} ${tx} ${ty})`}
                          style={{ userSelect: 'none' }}>
                          {len.toFixed(1)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}
          </svg>

          {mode === 'parameter' && plattenPlan.stats && (
            <div
              className={`absolute top-4 right-4 w-80 flex flex-col gap-3 max-h-[calc(100vh-130px)] overflow-y-auto mobile-statsheet ${mobileStatsOpen ? 'open' : ''}`}
            >
              {/* Mobile-Sheet-Handle: Tap toggelt Auf/Zu (nur sichtbar im Media-Query) */}
              <div
                className="mobile-sheet-handle"
                onClick={() => setMobileStatsOpen(v => !v)}
                aria-label="Auswertung erweitern"
              />
              {/* ==== STAT HERO (Zu kaufen) ==== */}
              <div className="d-stat-hero">
                <div className="d-lbl">Zu kaufen</div>
                <div className="d-big">{plattenPlan.stats.purchasedPlates}</div>
                <div className="d-unit">
                  {MATERIAL_LABEL[materialTyp]} {plattenPlan.stats.plattenDimW}×{plattenPlan.stats.plattenDimH} cm
                </div>
                <div className="d-price">
                  <span className="d-eur">
                    {(plattenPlan.stats.purchasedPlates * PRICE_PER_PLATE[materialTyp]).toFixed(2).replace('.', ',')} €
                  </span>
                  <span className="d-calc">
                    {plattenPlan.stats.purchasedPlates} × {PRICE_PER_PLATE[materialTyp].toFixed(2).replace('.', ',')} €
                  </span>
                </div>
              </div>

              {/* ==== KPI GRID ==== */}
              <div className="d-panel">
                <div className="d-panel-h">
                  <h3>Auswertung</h3>
                  <span className="d-num">LIVE</span>
                </div>
                <div className="d-panel-body">
                  <div className="d-kpi-grid">
                    <div className="d-kpi">
                      <div className="d-k">Fläche</div>
                      <div className="d-v">{plattenPlan.stats.flaeche.toFixed(2).replace('.', ',')}<small> m²</small></div>
                    </div>
                    <div className="d-kpi">
                      <div className="d-k">Nutzfläche</div>
                      <div className="d-v">{plattenPlan.stats.nutzFlaeche.toFixed(2).replace('.', ',')}<small> m²</small></div>
                    </div>
                    <div className="d-kpi good">
                      <div className="d-k">Vollplatten</div>
                      <div className="d-v">{plattenPlan.stats.vollePlatten}</div>
                    </div>
                    <div className="d-kpi warn">
                      <div className="d-k">Zuschnitte</div>
                      <div className="d-v">{plattenPlan.stats.zuschnitte}</div>
                    </div>
                    {resteNutzen && plattenPlan.stats.ausRest > 0 && (
                      <div className="d-kpi" style={{ gridColumn: 'span 2' }}>
                        <div className="d-k">Aus Rest wiederverwendet</div>
                        <div className="d-v" style={{ color: 'var(--green)' }}>
                          {plattenPlan.stats.ausRest}<small> Zuschnitte</small>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="d-sec-label" style={{ marginTop: '14px' }}>Verschnitt</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className="font-display" style={{
                      fontWeight: 700, fontSize: '28px',
                      color: plattenPlan.stats.verschnittProz > 30 ? 'var(--red)' :
                             plattenPlan.stats.verschnittProz < 20 ? 'var(--green)' : 'var(--orange)',
                      letterSpacing: '-.01em',
                    }}>
                      {plattenPlan.stats.verschnittProz.toFixed(1).replace('.', ',')}<small style={{ fontSize: '13px' }}>%</small>
                    </div>
                    <div className="font-mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {((plattenPlan.stats.gekaufteFlaeche - plattenPlan.stats.nutzFlaeche)).toFixed(2).replace('.', ',')} m² Abfall
                    </div>
                  </div>
                  <div className="d-verschnitt-bar">
                    <div className="d-fill" style={{ width: '100%' }} />
                    <div className="d-mark" style={{ left: `${Math.min(100, plattenPlan.stats.verschnittProz * 2)}%` }} />
                  </div>
                  <div className="d-verschnitt-scale">
                    <span>0%</span><span>gut</span><span>25%</span><span>50%+</span>
                  </div>

                  {plattenPlan.stats.stoesseGesamt > 0 && (
                    <>
                      <div className="d-sec-label" style={{ marginTop: '14px' }}>Stöße auf Unterkonstruktion</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <div className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>
                          {plattenPlan.stats.stoesseAufBalken}{' '}
                          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>/ {plattenPlan.stats.stoesseGesamt}</span>
                        </div>
                        <div className="font-mono" style={{
                          fontSize: '11px',
                          color: plattenPlan.stats.stoesseAufBalken === plattenPlan.stats.stoesseGesamt ? 'var(--green)' : 'var(--orange)',
                        }}>
                          {Math.round((plattenPlan.stats.stoesseAufBalken / plattenPlan.stats.stoesseGesamt) * 100)} %
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        {Array.from({ length: Math.min(12, plattenPlan.stats.stoesseGesamt) }).map((_, i) => {
                          const ratio = plattenPlan.stats.stoesseAufBalken / plattenPlan.stats.stoesseGesamt;
                          const threshold = (i + 1) / Math.min(12, plattenPlan.stats.stoesseGesamt);
                          const filled = threshold <= ratio;
                          return (
                            <div key={i} style={{
                              flex: 1, height: '4px',
                              background: filled ? 'var(--green)' : 'var(--paper-3)',
                              borderRadius: '2px',
                            }} />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ==== REST POOL ==== */}
              {resteNutzen && plattenPlan.stats.restStueckePool && plattenPlan.stats.restStueckePool.length > 0 && (
                <div className="d-panel">
                  <div className="d-panel-h">
                    <h3>Rest-Pool</h3>
                    <span className="d-num">{plattenPlan.stats.restStueckePool.length} STK.</span>
                  </div>
                  <div className="d-panel-body">
                    <div className="d-pool">
                      {plattenPlan.stats.restStueckePool.slice(0, 12).map((r, i) => (
                        <span key={i} className="d-rest">{r.toFixed(0)} cm</span>
                      ))}
                      {plattenPlan.stats.restStueckePool.length > 12 && (
                        <span className="d-rest" style={{ background: 'var(--paper-2)', color: 'var(--muted)', borderColor: 'var(--line)' }}>
                          +{plattenPlan.stats.restStueckePool.length - 12}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                      Reste ≥ 5 cm werden wiederverwendet
                    </div>
                  </div>
                </div>
              )}

              {/* ==== CUT LIST (Stückliste) ==== */}
              <div className="d-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="d-panel-h">
                  <h3>Stückliste</h3>
                  <span className="d-num">{plattenPlan.platten.length}</span>
                </div>
                <div className="d-panel-body" style={{ paddingTop: '4px', overflow: 'auto', maxHeight: '260px' }}>
                  <div className="d-cutlist">
                    {plattenPlan.platten.slice(0, 40).map((p, i) => {
                      const ausRest = resteNutzen && plattenPlan.stats.ausRestIds?.has(p.id);
                      const type = p.isFull ? 'Voll' : ausRest ? '↺ Rest' : 'Zuschnitt';
                      const swBg = p.isFull
                        ? 'rgba(63,122,58,.3)'
                        : ausRest
                          ? 'rgba(209,114,45,.35)'
                          : 'rgba(178,72,50,.3)';
                      return (
                        <div key={p.id} className="d-cutlist-row">
                          <span className="d-idx">{String(i + 1).padStart(2, '0')}</span>
                          <span className="d-type"><span className="d-sw" style={{ background: swBg }} />{type}</span>
                          <span className="d-dim">
                            <b>{Math.round(p.w)}×{Math.round(p.h)}</b>
                          </span>
                        </div>
                      );
                    })}
                    {plattenPlan.platten.length > 40 && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', paddingTop: '6px' }}>
                        +{plattenPlan.platten.length - 40} weitere
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rest-wiederverwenden-Toggle (kompakt unter Stückliste) */}
              <label className="d-toggle-row" style={{ padding: '8px 12px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                <span className="d-lbl">
                  Reststücke wiederverwenden
                  <span className="d-sub">Pool-Matching</span>
                </span>
                <span className={`d-switch ${resteNutzen ? 'on' : ''}`} onClick={() => setResteNutzen(!resteNutzen)} />
              </label>
            </div>
          )}

          {/* Pan/Zoom-FABs unten links */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-1.5" style={{ pointerEvents: 'auto' }}>
            <button
              onClick={() => {
                const vb = viewOverride ?? viewBox;
                const { x: cx, y: cy } = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
                const f = 1 / 1.25;
                setViewOverride({ x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: vb.w * f, h: vb.h * f });
              }}
              title="Zoom in"
              style={{
                width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)',
                background: 'var(--card)', color: 'var(--ink-soft)', display: 'grid', placeItems: 'center',
                boxShadow: 'var(--shadow)', cursor: 'pointer',
              }}
            >＋</button>
            <button
              onClick={() => {
                const vb = viewOverride ?? viewBox;
                const { x: cx, y: cy } = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
                const f = 1.25;
                setViewOverride({ x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: vb.w * f, h: vb.h * f });
              }}
              title="Zoom out"
              style={{
                width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)',
                background: 'var(--card)', color: 'var(--ink-soft)', display: 'grid', placeItems: 'center',
                boxShadow: 'var(--shadow)', cursor: 'pointer',
              }}
            >−</button>
            <button
              onClick={resetView}
              disabled={!viewOverride}
              title="Ansicht zurücksetzen (Fit)"
              style={{
                width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)',
                background: viewOverride ? 'var(--amber-bg)' : 'var(--card)',
                color: viewOverride ? 'var(--amber-ink)' : 'var(--muted)',
                display: 'grid', placeItems: 'center',
                boxShadow: 'var(--shadow)', cursor: viewOverride ? 'pointer' : 'default',
                opacity: viewOverride ? 1 : 0.5,
              }}
            >⌂</button>
          </div>

          <div className="absolute bottom-4 right-4 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
            <div className="font-bold text-slate-300 mb-1">Legende</div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-amber-400 bg-amber-400/10"></div>
              <span>Fläche</span>
            </div>
            {mode === 'parameter' && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(180,83,9,0.45)', border: '1px solid rgba(217,119,6,0.6)' }}></div>
                  <span>Balken</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 border-emerald-500 bg-emerald-500/15"></div>
                  <span>Volle Platte</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 border-red-500 bg-red-500/15"></div>
                  <span>Zuschnitt (neue Platte)</span>
                </div>
                {resteNutzen && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border-2 border-orange-500 bg-orange-500/15"></div>
                    <span>Zuschnitt aus Rest</span>
                  </div>
                )}
                {showNutFeder && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5" style={{ background: 'repeating-linear-gradient(to right, #fbbf24 0 3px, transparent 3px 5px)' }}></div>
                    <span>Nut/Feder-Kante</span>
                  </div>
                )}
              </>
            )}
            {mode === 'zeichnen' && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-950"></div>
                <span>Eckpunkt</span>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight, warn }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}:</span>
      <span className={`font-mono font-bold ${warn ? 'text-red-400' : highlight ? 'text-emerald-400' : 'text-slate-100'}`}>
        {value}
      </span>
    </div>
  );
}

// ---- Verlegemuster-Icons (24×24 stroke-based, currentColor) ----
function VerlegemusterIcon({ type, size = 24 }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' };
  switch (type) {
    case 'stapel':
      return (
        <svg {...common}>
          <rect x="3" y="4"  width="8" height="4" />
          <rect x="13" y="4" width="8" height="4" />
          <rect x="3" y="10" width="8" height="4" />
          <rect x="13" y="10" width="8" height="4" />
          <rect x="3" y="16" width="8" height="4" />
          <rect x="13" y="16" width="8" height="4" />
        </svg>
      );
    case 'halb':
      return (
        <svg {...common}>
          <rect x="2" y="4"  width="8" height="4" />
          <rect x="10" y="4" width="8" height="4" />
          <rect x="18" y="4" width="4" height="4" />
          <rect x="2" y="10" width="4" height="4" />
          <rect x="6" y="10" width="8" height="4" />
          <rect x="14" y="10" width="8" height="4" />
          <rect x="2" y="16" width="8" height="4" />
          <rect x="10" y="16" width="8" height="4" />
          <rect x="18" y="16" width="4" height="4" />
        </svg>
      );
    case 'drittel':
      return (
        <svg {...common}>
          <rect x="2" y="4"  width="9" height="4" />
          <rect x="11" y="4" width="9" height="4" />
          <rect x="2" y="10" width="3" height="4" />
          <rect x="5" y="10" width="9" height="4" />
          <rect x="14" y="10" width="8" height="4" />
          <rect x="2" y="16" width="6" height="4" />
          <rect x="8" y="16" width="9" height="4" />
          <rect x="17" y="16" width="5" height="4" />
        </svg>
      );
    case 'rest':
      return (
        <svg {...common}>
          <rect x="2" y="4"  width="9" height="4" />
          <rect x="11" y="4" width="9" height="4" />
          <rect x="20" y="4" width="2" height="4" />
          <rect x="2" y="10" width="2" height="4" />
          <rect x="4" y="10" width="9" height="4" />
          <rect x="13" y="10" width="9" height="4" />
          <rect x="2" y="16" width="4" height="4" />
          <rect x="6" y="16" width="9" height="4" />
          <rect x="15" y="16" width="7" height="4" />
        </svg>
      );
    case 'fischgrat':
      return (
        <svg {...common}>
          {/* L-Paare: horizontal + vertikal */}
          <rect x="2"  y="3"  width="7" height="3" />
          <rect x="9"  y="3"  width="3" height="7" />
          <rect x="12" y="3"  width="7" height="3" />
          <rect x="19" y="3"  width="3" height="7" />
          <rect x="2"  y="10" width="7" height="3" />
          <rect x="9"  y="10" width="3" height="7" />
          <rect x="12" y="10" width="7" height="3" />
          <rect x="19" y="10" width="3" height="7" />
          <rect x="2"  y="17" width="7" height="3" />
          <rect x="12" y="17" width="7" height="3" />
        </svg>
      );
    case 'fischgrat-doppelt':
      return (
        <svg {...common}>
          {/* Doppelte L-Paare */}
          <rect x="2"  y="2"  width="8" height="2" />
          <rect x="2"  y="4"  width="8" height="2" />
          <rect x="10" y="2"  width="2" height="8" />
          <rect x="12" y="2"  width="2" height="8" />
          <rect x="14" y="2"  width="8" height="2" />
          <rect x="14" y="4"  width="8" height="2" />
          <rect x="2"  y="12" width="8" height="2" />
          <rect x="2"  y="14" width="8" height="2" />
          <rect x="10" y="12" width="2" height="8" />
          <rect x="12" y="12" width="2" height="8" />
          <rect x="14" y="12" width="8" height="2" />
          <rect x="14" y="14" width="8" height="2" />
        </svg>
      );
    case 'fischgrat-franz':
      return (
        <svg {...common}>
          {/* 45° gedrehte Streifen in Zick-Zack-Reihen */}
          <g transform="translate(12 12) rotate(45) translate(-12 -12)">
            <rect x="2"  y="6"  width="9" height="3" />
            <rect x="13" y="6"  width="9" height="3" />
            <rect x="2"  y="11" width="9" height="3" />
            <rect x="13" y="11" width="9" height="3" />
            <rect x="2"  y="16" width="9" height="3" />
            <rect x="13" y="16" width="9" height="3" />
          </g>
        </svg>
      );
    default:
      return <svg {...common} />;
  }
}
