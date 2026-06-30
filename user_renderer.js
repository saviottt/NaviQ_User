/* ============================
   user_renderer.js
   SVG Rendering Engine — Production Quality
   ============================ */
const SVG_NS = 'http://www.w3.org/2000/svg';

let mainSvg = null;
let defsEl  = null;
let mapGroup = null;
let pathGroup = null;
let markerGroup = null;
let _floorCache = new Map();  // floorId → DocumentFragment cache

/* ============================
   INIT
   ============================ */
function initRenderer() {
  const wrapper = document.getElementById('svgWrapper');
  wrapper.innerHTML = '';

  mainSvg = document.createElementNS(SVG_NS, 'svg');
  mainSvg.style.width = '100%';
  mainSvg.style.height = '100%';

  // Defs for filters and gradients
  defsEl = document.createElementNS(SVG_NS, 'defs');

  // Room shadow filter
  const shadowFilter = createSVGElement('filter', { id: 'roomShadow', x: '-5%', y: '-5%', width: '120%', height: '120%' });
  const feOffset = createSVGElement('feOffset', { in: 'SourceAlpha', dx: '0', dy: '1' });
  const feBlur = createSVGElement('feGaussianBlur', { stdDeviation: '2', result: 'blur' });
  const feFlood = createSVGElement('feFlood', { 'flood-color': 'rgba(0,0,0,0.06)' });
  const feComp = createSVGElement('feComposite', { in2: 'blur', operator: 'in' });
  const feMerge = createSVGElement('feMerge');
  feMerge.appendChild(createSVGElement('feMergeNode'));
  feMerge.appendChild(createSVGElement('feMergeNode', { in: 'SourceGraphic' }));
  shadowFilter.append(feOffset, feBlur, feFlood, feComp, feMerge);
  defsEl.appendChild(shadowFilter);

  // Path glow filter
  const glowFilter = createSVGElement('filter', { id: 'pathGlow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const gBlur = createSVGElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '3', result: 'glow' });
  const gMerge = createSVGElement('feMerge');
  gMerge.appendChild(createSVGElement('feMergeNode', { in: 'glow' }));
  gMerge.appendChild(createSVGElement('feMergeNode', { in: 'SourceGraphic' }));
  glowFilter.append(gBlur, gMerge);
  defsEl.appendChild(glowFilter);

  mainSvg.appendChild(defsEl);

  mapGroup    = createSVGElement('g', { id: 'mapElements' });
  pathGroup   = createSVGElement('g', { id: 'routeElements' });
  markerGroup = createSVGElement('g', { id: 'markerElements' });

  mainSvg.append(mapGroup, pathGroup, markerGroup);
  wrapper.appendChild(mainSvg);
}

/* ============================
   RENDER FLOOR
   ============================ */
function renderFloor(floorId) {
  if (!mainSvg) initRenderer();

  mapGroup.innerHTML = '';
  pathGroup.innerHTML = '';
  markerGroup.innerHTML = '';

  if (!window.state || !window.state.floors) return;

  const floor = window.state.floors.find(f => f.id === floorId);
  if (!floor) return;

  // Ensure blocks array exists to prevent crash
  if (!floor.blocks) floor.blocks = [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const updateBounds = (x, y, w, h) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  };

  const frag = document.createDocumentFragment();

  // --- Pass 1: Corridors (background) ---
  floor.blocks.forEach(block => {
    block.elements.forEach(el => {
      const type = (el.type || '').toLowerCase();
      const isCorridor = type === 'corridor' || type.startsWith('corridor-');
      if (!isCorridor) return;
      updateBounds(el.x, el.y, el.w, el.h);
      frag.appendChild(buildElementSVG(el, 'corridor'));
    });
  });

  // --- Pass 2: Walls ---
  const floorWalls = (window.state.walls || []).filter(w => w.floorId === floorId);
  floorWalls.forEach(wall => {
    updateBounds(wall.x, wall.y, wall.w, wall.h);
    const rect = createSVGElement('rect', {
      x: wall.x, y: wall.y, width: wall.w, height: wall.h,
      class: 'svg-wall', rx: 1,
      transform: `rotate(${wall.r || 0}, ${wall.x + wall.w/2}, ${wall.y + wall.h/2})`
    });
    if (wall.color) rect.setAttribute('fill', wall.color);
    frag.appendChild(rect);
  });

  // --- Pass 3: Rooms ---
  floor.blocks.forEach(block => {
    block.elements.forEach(el => {
      const type = (el.type || '').toLowerCase();
      const isCorridor = type === 'corridor' || type.startsWith('corridor-');
      const isDoor = type === 'door'; const isEntry = type === 'entry_exit';
      const isWaypoint = type === 'waypoint'; const isText = type === 'text';
      const isBridge = type === 'bridge';
      if (isCorridor || isDoor || isEntry || isWaypoint || isText || isBridge) return;
      updateBounds(el.x, el.y, el.w, el.h);
      frag.appendChild(buildElementSVG(el, 'room'));
    });
  });

  // --- Pass 4: Doors, Entry/Exit, Bridges ---
  floor.blocks.forEach(block => {
    block.elements.forEach(el => {
      const type = (el.type || '').toLowerCase();
      if (type === 'door' || type === 'entry_exit' || type === 'bridge') {
        updateBounds(el.x, el.y, el.w, el.h);
        frag.appendChild(buildElementSVG(el, type));
      }
    });
  });

  // --- Pass 5: Text labels ---
  floor.blocks.forEach(block => {
    block.elements.forEach(el => {
      if ((el.type || '').toLowerCase() === 'text') {
        updateBounds(el.x, el.y, el.w, el.h);
        frag.appendChild(buildElementSVG(el, 'text'));
      }
    });
  });

  mapGroup.appendChild(frag);

  // ViewBox
  if (minX !== Infinity) {
    const pad = 80;
    const vw = maxX - minX + pad * 2;
    const vh = maxY - minY + pad * 2;
    const vb = { x: minX - pad, y: minY - pad, w: vw, h: vh };
    mainSvg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    window.userState.initialViewBox = { ...vb };
    window.userState.viewBox = { ...vb };
  }

  // Draw "You Are Here" marker
  drawYouAreHereMarker();
}

/* ============================
   BUILD ELEMENT SVG
   ============================ */
function buildElementSVG(el, category) {
  const g = createSVGElement('g', {
    id: `user-el-${el.id}`,
    transform: `translate(${el.x}, ${el.y}) rotate(${el.r || 0}, ${el.w/2}, ${el.h/2})`,
    'data-el-id': el.id
  });

  const type = (el.type || '').toLowerCase();
  const isStair = el.isStairs || type === 'staircase';
  const isElevator = type === 'elevator';

  if (category === 'text') {
    const text = createSVGElement('text', {
      x: el.w / 2, y: el.h / 2, class: 'svg-label'
    });
    text.textContent = el.name || '';
    g.appendChild(text);
    return g;
  }

  // Handle shaped corridors
  if (category === 'corridor' && type.startsWith('corridor-') && typeof buildCorridorSvg === 'function') {
    const tempSvg = buildCorridorSvg(el);
    // Restyle corridor shapes for user view
    while (tempSvg.firstChild) {
      const child = tempSvg.firstChild;
      if (child.classList) {
        child.classList.add('svg-corridor');
        child.setAttribute('stroke', 'var(--corridor-stroke)');
        child.setAttribute('stroke-width', '0.5');
      }
      g.appendChild(child);
    }
    return g;
  }

  // Standard rect
  const rect = createSVGElement('rect', {
    width: el.w, height: el.h, rx: category === 'room' ? 3 : 1
  });

  if (category === 'corridor') {
    rect.setAttribute('class', 'svg-corridor');
  } else if (category === 'door') {
    rect.setAttribute('class', 'svg-door');
  } else if (category === 'entry_exit') {
    rect.setAttribute('class', 'svg-entry');
  } else if (category === 'bridge') {
    rect.setAttribute('class', 'svg-corridor');
    rect.setAttribute('stroke-dasharray', '4 2');
  } else if (isStair) {
    rect.setAttribute('class', 'svg-stair');
    // Draw stair lines
    const steps = Math.min(6, Math.floor(Math.max(el.w, el.h) / 12));
    const isHoriz = el.w >= el.h;
    for (let s = 1; s < steps; s++) {
      const line = createSVGElement('line', { stroke: 'rgba(0,0,0,0.15)', 'stroke-width': 0.8 });
      if (isHoriz) {
        const sx = (s / steps) * el.w;
        line.setAttribute('x1', sx); line.setAttribute('y1', 0);
        line.setAttribute('x2', sx); line.setAttribute('y2', el.h);
      } else {
        const sy = (s / steps) * el.h;
        line.setAttribute('x1', 0); line.setAttribute('y1', sy);
        line.setAttribute('x2', el.w); line.setAttribute('y2', sy);
      }
      g.appendChild(line);
    }
  } else if (isElevator) {
    rect.setAttribute('class', 'svg-elevator');
  } else {
    rect.setAttribute('class', 'svg-room');
    rect.setAttribute('filter', 'url(#roomShadow)');
    if (el.color) rect.setAttribute('fill', el.color);
  }

  g.appendChild(rect);

  // Labels for rooms and named elements
  if (el.name && el.w > 25 && el.h > 18) {
    if (category === 'room' && !isStair && !isElevator) {
      const fontSize = Math.min(13, Math.max(8, Math.min(el.w, el.h) / 5));
      const label = createSVGElement('text', {
        x: el.w / 2, y: el.h / 2,
        class: el.w < 60 ? 'svg-label svg-label-small' : 'svg-label',
        'font-size': fontSize
      });
      // Truncate if too long
      const maxChars = Math.floor(el.w / (fontSize * 0.55));
      label.textContent = el.name.length > maxChars ? el.name.substring(0, maxChars - 1) + '…' : el.name;
      g.appendChild(label);
    }
  }

  // Small icons for special elements
  if (isStair && el.w > 20 && el.h > 14) {
    const icon = createSVGElement('text', { x: el.w/2, y: el.h/2, class: 'svg-icon-text' });
    icon.textContent = '🪜';
    g.appendChild(icon);
  } else if (isElevator && el.w > 20 && el.h > 14) {
    const icon = createSVGElement('text', { x: el.w/2, y: el.h/2, class: 'svg-icon-text' });
    icon.textContent = '🛗';
    g.appendChild(icon);
  } else if (category === 'entry_exit' && el.w > 16 && el.h > 12) {
    const icon = createSVGElement('text', { x: el.w/2, y: el.h/2, class: 'svg-icon-text', 'font-size': 10 });
    icon.textContent = '🚪';
    g.appendChild(icon);
  }

  return g;
}

/* ============================
   YOU ARE HERE MARKER
   ============================ */
function drawYouAreHereMarker() {
  const existingMarker = document.getElementById('youHereGroup');
  if (existingMarker) existingMarker.remove();

  const elId = window.userState.currentLocationElId;
  if (!elId) return;

  const rec = findElementById(elId);
  if (!rec || rec.floorId !== window.userState.currentFloorId) return;

  const cx = rec.el.x + rec.el.w / 2;
  const cy = rec.el.y + rec.el.h / 2;

  const g = createSVGElement('g', { id: 'youHereGroup', class: 'you-here-marker' });
  g.appendChild(createSVGElement('circle', { cx, cy, r: 20, class: 'you-here-outer' }));
  g.appendChild(createSVGElement('circle', { cx, cy, r: 10, class: 'you-here-ring' }));
  g.appendChild(createSVGElement('circle', { cx, cy, r: 5, class: 'you-here-dot' }));

  markerGroup.appendChild(g);
}

/* ============================
   DESTINATION MARKER
   ============================ */
function drawDestinationMarker(elId) {
  const existing = document.getElementById('destMarkerGroup');
  if (existing) existing.remove();

  const rec = findElementById(elId);
  if (!rec || rec.floorId !== window.userState.currentFloorId) return;

  const cx = rec.el.x + rec.el.w / 2;
  const cy = rec.el.y + rec.el.h / 2;

  const g = createSVGElement('g', { id: 'destMarkerGroup' });

  // Pin shape
  const pin = createSVGElement('path', {
    d: `M${cx},${cy - 8} C${cx - 12},${cy - 28} ${cx - 18},${cy - 36} ${cx},${cy - 44} C${cx + 18},${cy - 36} ${cx + 12},${cy - 28} ${cx},${cy - 8}Z`,
    class: 'dest-marker-pin'
  });
  const dot = createSVGElement('circle', { cx, cy: cy - 30, r: 4, class: 'dest-marker-dot' });

  g.append(pin, dot);
  markerGroup.appendChild(g);
}

/* ============================
   ROUTE DRAWING
   ============================ */
function clearRoute() {
  if (pathGroup) pathGroup.innerHTML = '';
  // Remove highlight classes
  document.querySelectorAll('.svg-room.highlighted, .svg-room.destination').forEach(el => {
    el.classList.remove('highlighted', 'destination');
  });
  const destMarker = document.getElementById('destMarkerGroup');
  if (destMarker) destMarker.remove();
}

function drawRoute(pathIds, edges) {
  clearRoute();
  if (!pathIds || pathIds.length < 2) return;

  const currentFloor = window.userState.currentFloorId;

  // Collect nodes on current floor with transition points from edges
  const points = [];
  for (let i = 0; i < pathIds.length; i++) {
    const id = pathIds[i];
    const rec = findElementById(id);
    if (!rec) continue;

    if (rec.floorId === currentFloor) {
      // If there's an edge WITH a transition point leading TO this node, use it
      if (edges && i > 0) {
        const edge = edges.find(e => e.to === id && e.from === pathIds[i - 1]);
        if (edge && edge.meta && edge.meta.transition) {
          const prevRec = findElementById(pathIds[i - 1]);
          if (prevRec && prevRec.floorId === currentFloor) {
            points.push({ x: edge.meta.transition.x, y: edge.meta.transition.y });
          }
        }
      }
      points.push({ x: rec.el.x + rec.el.w / 2, y: rec.el.y + rec.el.h / 2 });
    }
  }

  if (points.length < 2) return;

  // Build smooth path string using Catmull-Rom to Bezier conversion
  const dStr = buildSmoothPath(points);

  // Background glow
  const bgPath = createSVGElement('path', { d: dStr, class: 'route-path-bg' });
  pathGroup.appendChild(bgPath);

  // Main path
  const mainPath = createSVGElement('path', { d: dStr, class: 'route-path', filter: 'url(#pathGlow)' });
  pathGroup.appendChild(mainPath);

  // Animated dashes on top
  const animPath = createSVGElement('path', { d: dStr, class: 'route-path-animated' });
  pathGroup.appendChild(animPath);

  // Animate path drawing
  const len = mainPath.getTotalLength();
  mainPath.style.strokeDasharray = len;
  mainPath.style.strokeDashoffset = len;
  mainPath.style.transition = 'stroke-dashoffset 1.2s ease-in-out';
  requestAnimationFrame(() => { mainPath.style.strokeDashoffset = '0'; });

  // After animation, let CSS marching ants take over
  setTimeout(() => {
    mainPath.style.strokeDasharray = '';
    mainPath.style.strokeDashoffset = '';
    mainPath.style.transition = '';
  }, 1400);

  // Highlight start room
  const startG = document.querySelector(`#user-el-${pathIds[0]} .svg-room`);
  if (startG) startG.classList.add('highlighted');

  // Highlight and mark destination
  const endId = pathIds[pathIds.length - 1];
  const endG = document.querySelector(`#user-el-${endId} .svg-room`);
  if (endG) endG.classList.add('destination');
  drawDestinationMarker(endId);

  // Re-draw You Are Here on top
  drawYouAreHereMarker();
}

/* Build smooth Catmull-Rom path */
function buildSmoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

/* ============================
   HELPERS
   ============================ */
function findElementById(elId) {
  if (!window.state || !window.state.floors) return null;
  for (const f of window.state.floors) {
    for (const b of f.blocks) {
      const el = b.elements.find(e => String(e.id) === String(elId));
      if (el) return { el, floorId: f.id, floorName: f.name, blockId: b.id };
    }
  }
  return null;
}

function createSVGElement(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
  }
  return el;
}

/* ============================
   CENTER ON ELEMENT
   ============================ */
function centerOnElement(elId) {
  const rec = findElementById(elId);
  if (!rec || !window.userState.viewBox) return;

  const cx = rec.el.x + rec.el.w / 2;
  const cy = rec.el.y + rec.el.h / 2;

  // Zoom in a bit
  const zoomW = Math.min(window.userState.initialViewBox.w * 0.5, 600);
  const zoomH = zoomW * (window.innerHeight / window.innerWidth);

  window.userState.viewBox = { x: cx - zoomW / 2, y: cy - zoomH / 2, w: zoomW, h: zoomH };
  applyViewBoxSmooth();
}

function resetView() {
  if (!window.userState.initialViewBox) return;
  window.userState.viewBox = { ...window.userState.initialViewBox };
  applyViewBoxSmooth();
}

function applyViewBoxSmooth() {
  const svg = document.querySelector('#svgWrapper svg');
  if (!svg || !window.userState.viewBox) return;
  const { x, y, w, h } = window.userState.viewBox;
  // Use CSS transition for smooth pan
  svg.style.transition = 'none';
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
}

/* ============================
   INIT HOOK
   ============================ */
window.addEventListener('mapDataLoaded', () => {
  initRenderer();
  if (window.userState.currentFloorId) {
    renderFloor(window.userState.currentFloorId);
    // Center on user location
    if (window.userState.currentLocationElId) {
      setTimeout(() => centerOnElement(window.userState.currentLocationElId), 300);
    }
  }
});

// Expose
window.renderFloor = renderFloor;
window.drawRoute = drawRoute;
window.clearRoute = clearRoute;
window.findElementById = findElementById;
window.centerOnElement = centerOnElement;
window.resetView = resetView;
window.drawYouAreHereMarker = drawYouAreHereMarker;
