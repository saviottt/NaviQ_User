/* =================================================================
   SHAPED CORRIDOR SVG BUILDER
   ================================================================= */
function buildCorridorSvg(el) {
  const w = el.w, h = el.h;
  const color = el.color || '#e8f4fd';
  const stroke = 'none';
  const sw = 0;
  const ns = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;';

  const ax = w / 3;
  const ay = h / 3;

  const poly = pts => {
    const el = document.createElementNS(ns, 'polygon');
    el.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    return el;
  };
  const rect = (x, y, rw, rh) => {
    const el = document.createElementNS(ns, 'rect');
    el.setAttribute('x', x); el.setAttribute('y', y);
    el.setAttribute('width', rw); el.setAttribute('height', rh);
    return el;
  };
  const ellipse = () => {
    const el = document.createElementNS(ns, 'ellipse');
    el.setAttribute('cx', w / 2); el.setAttribute('cy', h / 2);
    el.setAttribute('rx', w / 2 - sw); el.setAttribute('ry', h / 2 - sw);
    return el;
  };

  let shape;
  const t = el.type;

  if (t === 'Corridor-Square' || t === 'Corridor-Rect') {
    shape = rect(sw, sw, w - sw * 2, h - sw * 2);

  } else if (t === 'Corridor-Circle') {
    shape = ellipse();

  } else if (t === 'Corridor-Triangle') {
    shape = poly([[w / 2, sw], [w - sw, h - sw], [sw, h - sw]]);

  } else if (t === 'Corridor-L') {
    const cw = ax, ch = ay;
    shape = poly([
      [sw, sw],
      [sw + cw, sw],
      [sw + cw, h - sw - ch],
      [w - sw, h - sw - ch],
      [w - sw, h - sw],
      [sw, h - sw],
    ]);

  } else if (t === 'Corridor-T') {
    const barH = ay;
    const colW = ax;
    const cx = w / 2;
    shape = poly([
      [sw, sw],
      [w - sw, sw],
      [w - sw, sw + barH],
      [cx + colW / 2, sw + barH],
      [cx + colW / 2, h - sw],
      [cx - colW / 2, h - sw],
      [cx - colW / 2, sw + barH],
      [sw, sw + barH],
    ]);

  } else if (t === 'Corridor-U') {
    const sideW = ax;
    const botH = ay;
    const p = document.createElementNS(ns, 'path');
    const ix = sw + sideW;
    const iy = sw;
    const iw = w - sw * 2 - sideW * 2;
    const ih = h - sw - botH - sw;
    p.setAttribute('d',
      `M${sw},${sw} L${w - sw},${sw} L${w - sw},${h - sw} L${sw},${h - sw} Z ` +
      `M${ix},${iy} L${ix},${iy + ih} L${ix + iw},${iy + ih} L${ix + iw},${iy} Z`
    );
    p.setAttribute('fill-rule', 'evenodd');
    p.setAttribute('fill', color);
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', sw);
    p.setAttribute('stroke-linejoin', 'round');
    p.classList.add('corridor-shape');
    svg.appendChild(p);
    return svg;

  } else if (t === 'Corridor-H') {
    const barW = ax;
    const crossH = ay;
    const cy = h / 2;
    shape = poly([
      [sw, sw],
      [sw + barW, sw],
      [sw + barW, cy - crossH / 2],
      [w - sw - barW, cy - crossH / 2],
      [w - sw - barW, sw],
      [w - sw, sw],
      [w - sw, h - sw],
      [w - sw - barW, h - sw],
      [w - sw - barW, cy + crossH / 2],
      [sw + barW, cy + crossH / 2],
      [sw + barW, h - sw],
      [sw, h - sw],
    ]);

  } else if (t === 'Corridor-E') {
    const barW = ax;
    const prongH = h / 7;
    const prongL = w - sw;
    const midProngL = w * 0.75;
    shape = poly([
      [sw, sw],
      [prongL, sw],
      [prongL, sw + prongH],
      [sw + barW, sw + prongH],
      [sw + barW, h / 2 - prongH / 2],
      [midProngL, h / 2 - prongH / 2],
      [midProngL, h / 2 + prongH / 2],
      [sw + barW, h / 2 + prongH / 2],
      [sw + barW, h - sw - prongH],
      [prongL, h - sw - prongH],
      [prongL, h - sw],
      [sw, h - sw],
    ]);

  } else if (t === 'Corridor-Y') {
    const stemW = ax * 0.7;
    const cx = w / 2;
    const jY = h * 0.52;
    const armW = ax * 0.65;
    shape = poly([
      [cx - stemW / 2, h - sw],
      [cx + stemW / 2, h - sw],
      [cx + stemW / 2, jY],
      [w - sw, sw],
      [w - sw - armW * 1.1, sw],
      [cx + stemW / 2, jY + armW * 0.5],
      [cx - stemW / 2, jY + armW * 0.5],
      [sw + armW * 1.1, sw],
      [sw, sw],
      [cx - stemW / 2, jY],
    ]);

  } else if (t === 'Corridor-Cross') {
    const ax = w / 3, ay = h / 3;
    const cx = w / 2, cy = h / 2;
    shape = poly([
      [cx - ax / 2, sw],
      [cx + ax / 2, sw],
      [cx + ax / 2, cy - ay / 2],
      [w - sw, cy - ay / 2],
      [w - sw, cy + ay / 2],
      [cx + ax / 2, cy + ay / 2],
      [cx + ax / 2, h - sw],
      [cx - ax / 2, h - sw],
      [cx - ax / 2, cy + ay / 2],
      [sw, cy + ay / 2],
      [sw, cy - ay / 2],
      [cx - ax / 2, cy - ay / 2],
    ]);

  } else if (t === 'Corridor-Courtyard') {
    const margin = Math.min(w, h) * 0.28;
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d',
      `M${sw},${sw} L${w - sw},${sw} L${w - sw},${h - sw} L${sw},${h - sw} Z ` +
      `M${sw + margin},${sw + margin} L${sw + margin},${h - sw - margin} ` +
      `L${w - sw - margin},${h - sw - margin} L${w - sw - margin},${sw + margin} Z`
    );
    p.setAttribute('fill-rule', 'evenodd');
    p.setAttribute('fill', color);
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', sw);
    p.setAttribute('stroke-linejoin', 'round');
    p.classList.add('corridor-shape');
    svg.appendChild(p);
    return svg;
  }

  if (shape) {
    shape.setAttribute('fill', color);
    shape.setAttribute('stroke', stroke);
    shape.setAttribute('stroke-width', sw);
    shape.setAttribute('stroke-linejoin', 'round');
    shape.classList.add('corridor-shape');
    svg.appendChild(shape);
  }
  return svg;
}
