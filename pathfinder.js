window._pathState = null;

function setPathState(val) {
  window._pathState = val;
}

/* =================================================================
   PATH FINDER (Dijkstra across floors)
   ================================================================= */
function rectCenter(el) {
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 };
}

function rectsOverlapOrTouch(a, b, tolerance = 5) {
  return !(a.x + a.w + tolerance < b.x ||
    b.x + b.w + tolerance < a.x ||
    a.y + a.h + tolerance < b.y ||
    b.y + b.h + tolerance < a.y);
}

function dist(a, b) {
  const ca = rectCenter(a), cb = rectCenter(b);
  return Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2);
}

// Passage types — path can only travel THROUGH these element types (Hall is a room type and is excluded from passage types)
const PASSAGE_TYPES = new Set(['corridor', 'door', 'elevator', 'staircase', 'hall', 'window', 'entry_exit', 'waypoint', 'bridge']);

function isPassage(el) {
  const t = (el.type || '').toLowerCase();
  return PASSAGE_TYPES.has(t) || t.startsWith('corridor') || el.isStairs;
}

function isBridge(el) {
  return (el.type || '').toLowerCase() === 'bridge';
}

// Returns the shared edge region between two touching rects, or null if not touching
function getSharedEdge(a, b, tolerance = 8) {
  const aR = a.x + a.w, aB = a.y + a.h;
  const bR = b.x + b.w, bB = b.y + b.h;

  // Vertical shared edge (left-right)
  if (Math.abs(aR - b.x) <= tolerance || Math.abs(bR - a.x) <= tolerance) {
    const edgeX = Math.abs(aR - b.x) <= tolerance ? (aR + b.x) / 2 : (bR + a.x) / 2;
    const y0 = Math.max(a.y, b.y), y1 = Math.min(aB, bB);
    if (y1 > y0) return { x: edgeX, y: (y0 + y1) / 2, y0, y1, x0: edgeX, x1: edgeX, axis: 'v' };
  }
  // Horizontal shared edge (top-bottom)
  if (Math.abs(aB - b.y) <= tolerance || Math.abs(bB - a.y) <= tolerance) {
    const edgeY = Math.abs(aB - b.y) <= tolerance ? (aB + b.y) / 2 : (bB + a.y) / 2;
    const x0 = Math.max(a.x, b.x), x1 = Math.min(aR, bR);
    if (x1 > x0) return { x: (x0 + x1) / 2, y: edgeY, x0, x1, y0: edgeY, y1: edgeY, axis: 'h' };
  }
  // Overlapping
  const ox0 = Math.max(a.x, b.x), ox1 = Math.min(aR, bR);
  const oy0 = Math.max(a.y, b.y), oy1 = Math.min(aB, bB);
  if (ox1 > ox0 && oy1 > oy0) return { x: (ox0 + ox1) / 2, y: (oy0 + oy1) / 2, axis: 'o' };
  return null;
}

// Check if any door/passage element from the block's elements sits on the shared edge between a and b
function doorOnSharedEdge(a, b, blockEls, tolerance = 20) {
  // Vertical connectors (stairs/elevators/junctions) automatically have open shared edges and bypass wall checks
  if (isVerticalConnector(a) || isVerticalConnector(b)) return true;

  const edge = getSharedEdge(a, b);
  if (!edge) return false;

  for (const el of blockEls) {
    if (!(['door', 'window', 'entry_exit'].includes((el.type || '').toLowerCase()))) continue;
    const er = el.x + el.w, eb = el.y + el.h;

    if (edge.axis === 'v') {
      const doorCx = el.x + el.w / 2;
      if (Math.abs(doorCx - edge.x) <= tolerance) {
        const dy0 = Math.max(el.y, edge.y0), dy1 = Math.min(eb, edge.y1);
        if (dy1 > dy0) return true;
      }
    } else if (edge.axis === 'h') {
      const doorCy = el.y + el.h / 2;
      if (Math.abs(doorCy - edge.y) <= tolerance) {
        const dx0 = Math.max(el.x, edge.x0), dx1 = Math.min(er, edge.x1);
        if (dx1 > dx0) return true;
      }
    } else if (edge.axis === 'o') {
      if (Math.abs((el.x + el.w / 2) - edge.x) <= tolerance &&
        Math.abs((el.y + el.h / 2) - edge.y) <= tolerance) return true;
    }
  }
  return false;
}

// Check if a wall on the current floor blocks the shared boundary between two elements
function wallBlocksEdge(a, b, floorId) {
  const edge = getSharedEdge(a, b);
  if (!edge) return false;

  const floorWalls = state.walls.filter(w => w.floorId === floorId);
  if (floorWalls.length === 0) return false;

  for (const wall of floorWalls) {
    const wR = wall.x + wall.w, wB = wall.y + wall.h;

    if (edge.axis === 'v') {
      if (wall.x <= edge.x + 8 && wR >= edge.x - 8) {
        const wy0 = Math.max(wall.y, edge.y0), wy1 = Math.min(wB, edge.y1);
        const overlapLen = wy1 - wy0;
        const edgeLen = edge.y1 - edge.y0;
        if (overlapLen > edgeLen * 0.3) return true;
      }
    } else if (edge.axis === 'h') {
      if (wall.y <= edge.y + 8 && wB >= edge.y - 8) {
        const wx0 = Math.max(wall.x, edge.x0), wx1 = Math.min(wR, edge.x1);
        const overlapLen = wx1 - wx0;
        const edgeLen = edge.x1 - edge.x0;
        if (overlapLen > edgeLen * 0.3) return true;
      }
    } else if (edge.axis === 'o') {
      if (wall.x < edge.x + 10 && wR > edge.x - 10 && wall.y < edge.y + 10 && wB > edge.y - 10) return true;
    }
  }
  return false;
}



function doorBelongsToRoom(room, door) {
  const doorCx = door.x + door.w / 2;
  const doorCy = door.y + door.h / 2;
  if (door.w >= door.h) {
    // Horizontal door: connects vertically. Center x must be inside room's x-range
    return doorCx >= room.x - 2 && doorCx <= room.x + room.w + 2;
  } else {
    // Vertical door: connects horizontally. Center y must be inside room's y-range
    return doorCy >= room.y - 2 && doorCy <= room.y + room.h + 2;
  }
}

function getDoorsOrOpenings(el, floorEls) {
  if (isPassage(el)) return [];
  return floorEls.filter(item => {
    if (item.id === el.id) return false;
    const type = (item.type || '').toLowerCase();
    if (['door', 'window', 'entry_exit'].includes(type)) {
      if (rectsOverlapOrTouch(el, item, 12)) {
        return doorBelongsToRoom(el, item);
      }
    }
    return false;
  });
}

function buildGraph() {
  const adj = new Map();
  const allEls = allElements().filter(r => (r.el.type || '').toLowerCase() !== 'text');

  allEls.forEach(r => adj.set(r.el.id, []));
  state.floors.forEach(f => {
    const floorEls = f.blocks.flatMap(b => b.elements).filter(el => (el.type || '').toLowerCase() !== 'text');

    const hasWaypointsCorridorsArr = floorEls.filter(c => {
       const type = (c.type || '').toLowerCase();
       const name = (c.name || '').toLowerCase();
        const isCorridorOrHall = type === 'corridor' || type.startsWith('corridor-') || 
                                 name.includes('stair hall') || name.includes('stair lobby') || name.includes('vertical junction');
       if (isCorridorOrHall) {
          return floorEls.some(el => (el.type || '').toLowerCase() === 'waypoint' && rectsOverlapOrTouch(c, el));
       }
       return false;
    });
    const hasWaypointsSet = new Set(hasWaypointsCorridorsArr.map(c => c.id));

    for (let i = 0; i < floorEls.length; i++) {
      for (let j = i + 1; j < floorEls.length; j++) {
        const a = floorEls[i], bEl = floorEls[j];

        // NEW LOGIC: If both overlap, but one is a Corridor that has waypoints, SKIP the standard connection!
        // Exception: never skip if one element is a bridge — bridges must always connect
        if (hasWaypointsSet && (hasWaypointsSet.has(a.id) || hasWaypointsSet.has(bEl.id))) {
          if (!isBridge(a) && !isBridge(bEl)) continue;
        }

        const hasBridge = isBridge(a) || isBridge(bEl);
        const touchTol = (isVerticalConnector(a) || isVerticalConnector(bEl) || hasBridge) ? 15 : 5;
        if (!rectsOverlapOrTouch(a, bEl, touchTol)) continue;

        // Two vertical connectors should never connect directly to each other
        if (isVerticalConnector(a) && isVerticalConnector(bEl)) continue;

        // Door ownership check: a door can only connect to a room if it belongs to that room's wall
        if (!isPassage(a) && ['door', 'window', 'entry_exit'].includes((bEl.type || '').toLowerCase())) {
          if (!doorBelongsToRoom(a, bEl)) continue;
        }
        if (!isPassage(bEl) && ['door', 'window', 'entry_exit'].includes((a.type || '').toLowerCase())) {
          if (!doorBelongsToRoom(bEl, a)) continue;
        }

        // Door constraint: if a room has doors/openings, it can ONLY connect to those doors/openings.
        // This applies even for bridges — rooms must be reached through their doors.
        const aDoors = getDoorsOrOpenings(a, floorEls);
        if (aDoors.length > 0 && !aDoors.some(d => d.id === bEl.id)) continue;

        const bDoors = getDoorsOrOpenings(bEl, floorEls);
        if (bDoors.length > 0 && !bDoors.some(d => d.id === a.id)) continue;

        // Wall blocking: skip if a wall blocks the shared edge (unless a door opens it)
        // Bridges bypass wall checks ONLY when connecting to other passage elements
        // (corridors, waypoints, doors) — NOT when connecting to rooms
        const bridgeToPassage = (isBridge(a) && isPassage(bEl)) || (isBridge(bEl) && isPassage(a));
        if (!bridgeToPassage) {
          const blocked = wallBlocksEdge(a, bEl, f.id);
          if (blocked) {
            const hasDoorOpening = doorOnSharedEdge(a, bEl, floorEls);
            if (!hasDoorOpening) continue;
          }
        }

        const edgePoint = getSharedWallMidpoint(a, bEl);

        const aCenter = rectCenter(a);
        const bCenter = rectCenter(bEl);

        const dA = Math.sqrt((aCenter.x - edgePoint.x) ** 2 + (aCenter.y - edgePoint.y) ** 2);
        const dB = Math.sqrt((bCenter.x - edgePoint.x) ** 2 + (bCenter.y - edgePoint.y) ** 2);

        adj.get(a.id).push({
          neighborId: bEl.id,
          cost: dA,
          type: 'same',
          meta: {
            floorId: f.id,
            floorName: f.name,
            transition: edgePoint
          }
        });

        adj.get(bEl.id).push({
          neighborId: a.id,
          cost: dB,
          type: 'same',
          meta: {
            floorId: f.id,
            floorName: f.name,
            transition: edgePoint
          }
        });
      }
    }

    // --- NEW LOGIC: Waypoint MST for Corridors ---
    // Group into clusters of overlapping corridors
    const clusters = [];
    const visitedCorr = new Set();
    hasWaypointsCorridorsArr.forEach(c => {
       if (visitedCorr.has(c.id)) return;
       const cluster = [];
       const q = [c];
       visitedCorr.add(c.id);
       while (q.length > 0) {
          const curr = q.shift();
          cluster.push(curr);
          hasWaypointsCorridorsArr.forEach(otherC => {
             if (!visitedCorr.has(otherC.id) && rectsOverlapOrTouch(curr, otherC)) {
                visitedCorr.add(otherC.id);
                q.push(otherC);
             }
          });
       }
       clusters.push(cluster);
     });

     clusters.forEach(cluster => {
        const wps = new Set();
        const others = new Map();
        cluster.forEach(c => {
           floorEls.forEach(el => {
              if (hasWaypointsSet.has(el.id)) return; // Skip other waypoint corridors
              if (rectsOverlapOrTouch(c, el, 15)) {
                 // Bridges always bypass wall checks — their purpose is to cross barriers
                 if (!isBridge(el)) {
                   const blocked = wallBlocksEdge(c, el, f.id);
                   if (blocked) {
                     const hasDoorOpening = doorOnSharedEdge(c, el, floorEls);
                     if (!hasDoorOpening) return;
                   }
                 }
                 if ((el.type || '').toLowerCase() === 'waypoint') wps.add(el);
                 else if (!others.has(el.id)) others.set(el.id, { el, touchedC: c });
              }
           });
        });
        
        const wpsArr = Array.from(wps);
        const othersArr = Array.from(others.values());
        
        // Connect others to nearest wp (with wall blocking checks)
        othersArr.forEach(({ el: other, touchedC }) => {
           // Door constraint: if other is a room and has doors/openings, do not connect it directly to the waypoint!
           const otherDoors = getDoorsOrOpenings(other, floorEls);
           if (otherDoors.length > 0) return;

           let nearestWp = null;
           let minDist = Infinity;
           wpsArr.forEach(wp => {
              // Bridges and doors skip wall-line checks — they are connectors by nature
              const isOtherDoor = ['door', 'entry_exit'].includes((other.type || '').toLowerCase());
              const isOtherBridge = isBridge(other);
              if (!isOtherDoor && !isOtherBridge && wallBlocksLine(rectCenter(other), rectCenter(wp), f.id, floorEls)) {
                 const hasDoor = findTransitionElement(other, wp, floorEls);
                 if (!hasDoor) return; // Blocked, skip this waypoint
              }
              const d = dist(other, wp);
              if (d < minDist) { minDist = d; nearestWp = wp; }
           });
           if (nearestWp) {
              // Use the physical boundary with the corridor as the visual transition point,
              // instead of a direct line to the waypoint which might cut across rooms.
              const edgePoint = getSharedWallMidpoint(other, touchedC) || getSharedWallMidpoint(other, nearestWp);
              const otherCenter = rectCenter(other);
              const wpCenter = rectCenter(nearestWp);
              const dOther = Math.sqrt((otherCenter.x - edgePoint.x) ** 2 + (otherCenter.y - edgePoint.y) ** 2);
              const dWp = Math.sqrt((wpCenter.x - edgePoint.x) ** 2 + (wpCenter.y - edgePoint.y) ** 2);

              adj.get(other.id).push({
                neighborId: nearestWp.id, cost: dOther, type: 'same', 
                meta: { floorId: f.id, floorName: f.name, transition: edgePoint }
              });
              adj.get(nearestWp.id).push({
                neighborId: other.id, cost: dWp, type: 'same', 
                meta: { floorId: f.id, floorName: f.name, transition: edgePoint }
              });
           }
        });

        // MST for waypoints (with wall blocking checks)
        if (wpsArr.length > 1) {
           const edges = [];
           for (let i = 0; i < wpsArr.length; i++) {
              for (let j = i + 1; j < wpsArr.length; j++) {
                 if (!wallBlocksLine(rectCenter(wpsArr[i]), rectCenter(wpsArr[j]), f.id, floorEls)) {
                    edges.push({ a: wpsArr[i], b: wpsArr[j], d: dist(wpsArr[i], wpsArr[j]) });
                 }
              }
           }
           edges.sort((e1, e2) => e1.d - e2.d);
           const parent = {};
           const find = (i) => { if (parent[i] === undefined) return i; return parent[i] = find(parent[i]); };
           const union = (i, j) => {
              const rootI = find(i); const rootJ = find(j);
              if (rootI !== rootJ) { parent[rootI] = rootJ; return true; }
              return false;
           };
           
           edges.forEach(e => {
              if (union(e.a.id, e.b.id)) {
                 const edgePoint = getSharedWallMidpoint(e.a, e.b);
                 const aCenter = rectCenter(e.a);
                 const bCenter = rectCenter(e.b);
                 const dA = Math.sqrt((aCenter.x - edgePoint.x) ** 2 + (aCenter.y - edgePoint.y) ** 2);
                 const dB = Math.sqrt((bCenter.x - edgePoint.x) ** 2 + (bCenter.y - edgePoint.y) ** 2);

                 adj.get(e.a.id).push({ neighborId: e.b.id, cost: dA, type: 'same', meta: { floorId: f.id, floorName: f.name, transition: edgePoint } });
                 adj.get(e.b.id).push({ neighborId: e.a.id, cost: dB, type: 'same', meta: { floorId: f.id, floorName: f.name, transition: edgePoint } });
              }
           });
        }
     });

    // --- CROSS-BLOCK BRIDGE AUTO-DETECTION ---
    // Scan for bridge elements and ensure they connect to all touching passage elements
    // (corridors, waypoints, doors). Bridges do NOT connect directly to rooms with doors
    // — the path must go through the corridor/waypoint chain.
    const bridgeEls = floorEls.filter(el => isBridge(el));
    bridgeEls.forEach(bridge => {
      floorEls.forEach(other => {
        if (other.id === bridge.id) return;
        if (isBridge(other)) return; // don't connect bridge-to-bridge
        if ((other.type || '').toLowerCase() === 'text') return;

        const touchTol = 15;
        if (!rectsOverlapOrTouch(bridge, other, touchTol)) return;

        // Check if this connection already exists
        const existing = adj.get(bridge.id);
        if (existing && existing.some(e => e.neighborId === other.id)) return;

        // Door constraint: if the other element has doors, don't connect directly
        // (the room must be reached through its doors → corridor → bridge)
        const otherDoors = getDoorsOrOpenings(other, floorEls);
        if (otherDoors.length > 0) return;

        // Wall check: bridges bypass walls only for passage-type neighbors
        if (!isPassage(other)) {
          const blocked = wallBlocksEdge(bridge, other, f.id);
          if (blocked) {
            const hasDoorOpening = doorOnSharedEdge(bridge, other, floorEls);
            if (!hasDoorOpening) return;
          }
        }

        const edgePoint = getSharedWallMidpoint(bridge, other);
        const bridgeCenter = rectCenter(bridge);
        const otherCenter = rectCenter(other);
        const dBridge = Math.sqrt((bridgeCenter.x - edgePoint.x) ** 2 + (bridgeCenter.y - edgePoint.y) ** 2);
        const dOther = Math.sqrt((otherCenter.x - edgePoint.x) ** 2 + (otherCenter.y - edgePoint.y) ** 2);

        adj.get(bridge.id).push({
          neighborId: other.id,
          cost: dBridge,
          type: 'same',
          meta: { floorId: f.id, floorName: f.name, transition: edgePoint }
        });
        adj.get(other.id).push({
          neighborId: bridge.id,
          cost: dOther,
          type: 'same',
          meta: { floorId: f.id, floorName: f.name, transition: edgePoint }
        });
      });
    });
  });

  const STAIR_COST = 120;
  const JUNCTION_COST = 35;
  state.stairLinks.forEach(lk => {
    if (adj.has(lk.fromElId) && adj.has(lk.toElId)) {
      const fromFloor = state.floors.find(f => f.id === lk.fromFloorId);
      const toFloor = state.floors.find(f => f.id === lk.toFloorId);
      const fromRec = getElById(lk.fromElId);
      const toRec = getElById(lk.toElId);
      const isCrossFloor = lk.fromFloorId !== lk.toFloorId;
      const usesJunction = !!(fromRec && toRec && (isVerticalJunction(fromRec.el) || isVerticalJunction(toRec.el)));
      const linkCost = isCrossFloor ? STAIR_COST : JUNCTION_COST;

      const fromBldg = state.buildings.find(b => b.id === fromFloor?.buildingId);
      const toBldg = state.buildings.find(b => b.id === toFloor?.buildingId);
      const baseMeta = { usesJunction, isCrossFloor, fromBuildingName: fromBldg?.name || '', toBuildingName: toBldg?.name || '' };

      adj.get(lk.fromElId).push({
        neighborId: lk.toElId, cost: linkCost, type: 'stair',
        meta: { ...baseMeta, fromFloorName: fromFloor?.name, toFloorName: toFloor?.name }
      });
      adj.get(lk.toElId).push({
        neighborId: lk.fromElId, cost: linkCost, type: 'stair',
        meta: { ...baseMeta, fromFloorName: toFloor?.name, toFloorName: fromFloor?.name, fromBuildingName: toBldg?.name || '', toBuildingName: fromBldg?.name || '' }
      });
    }
  });

  const LINK_COST = 100;
  state.universalLinks.forEach(lk => {
    if (adj.has(lk.fromElId) && adj.has(lk.toElId)) {
      const fromFloor = state.floors.find(f => f.id === lk.fromFloorId);
      const toFloor = state.floors.find(f => f.id === lk.toFloorId);
      const isCrossFloor = lk.fromFloorId !== lk.toFloorId;

      const fromBldg = state.buildings.find(b => b.id === fromFloor?.buildingId);
      const toBldg = state.buildings.find(b => b.id === toFloor?.buildingId);

      adj.get(lk.fromElId).push({
        neighborId: lk.toElId, cost: LINK_COST, type: isCrossFloor ? 'universal' : 'same',
        meta: { fromFloorName: fromFloor?.name, toFloorName: toFloor?.name, floorId: lk.toFloorId, floorName: toFloor?.name, isUniversalLink: true, fromBuildingName: fromBldg?.name || '', toBuildingName: toBldg?.name || '' }
      });
      adj.get(lk.toElId).push({
        neighborId: lk.fromElId, cost: LINK_COST, type: isCrossFloor ? 'universal' : 'same',
        meta: { fromFloorName: toFloor?.name, toFloorName: fromFloor?.name, floorId: lk.fromFloorId, floorName: fromFloor?.name, isUniversalLink: true, fromBuildingName: toBldg?.name || '', toBuildingName: fromBldg?.name || '' }
      });
    }
  });

  return adj;
}

function lineSegmentsIntersect(p1, p2, p3, p4) {
  const dx12 = p2.x - p1.x;
  const dy12 = p2.y - p1.y;
  const dx34 = p4.x - p3.x;
  const dy34 = p4.y - p3.y;

  const denominator = dy34 * dx12 - dx34 * dy12;
  if (denominator === 0) return false;

  const ua = (dx34 * (p1.y - p3.y) - dy34 * (p1.x - p3.x)) / denominator;
  const ub = (dx12 * (p1.y - p3.y) - dy12 * (p1.x - p3.x)) / denominator;

  return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}

function lineIntersectsRect(p1, p2, r) {
  const inRect = (p) => (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  if (inRect(p1) || inRect(p2)) return true;

  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.w, y: r.y };
  const bl = { x: r.x, y: r.y + r.h };
  const br = { x: r.x + r.w, y: r.y + r.h };

  return lineSegmentsIntersect(p1, p2, tl, tr) ||
         lineSegmentsIntersect(p1, p2, tr, br) ||
         lineSegmentsIntersect(p1, p2, br, bl) ||
         lineSegmentsIntersect(p1, p2, bl, tl);
}

function wallBlocksLine(p1, p2, floorId, floorEls) {
  const floorWalls = state.walls.filter(w => w.floorId === floorId);
  const openings = floorEls.filter(el => {
    const t = (el.type || '').toLowerCase();
    return ['door', 'entry_exit', 'staircase', 'elevator', 'bridge'].includes(t) || 
           isVerticalConnector(el);
  });
  for (const wall of floorWalls) {
    if (lineIntersectsRect(p1, p2, wall)) {
      // Only bypass this wall if an opening physically overlaps or is near this specific wall
      // (i.e. there's a door/staircase/bridge cut into or adjacent to this wall)
      const wallHasOpening = openings.some(op => rectsOverlapOrTouch(op, wall, 12));
      if (!wallHasOpening) {
        return true;
      }
    }
  }
  return false;
}

function dijkstra(adj, startId, endId) {
  // Coerce startId and endId to the exact types of the keys in the adj map
  let graphStartId = startId;
  let graphEndId = endId;
  for (const k of adj.keys()) {
    if (String(k) === String(startId)) graphStartId = k;
    if (String(k) === String(endId)) graphEndId = k;
  }

  const dist2 = new Map();
  const prev = new Map();
  const edgeMeta = new Map();
  const visited = new Set();
  const pq = [];

  adj.forEach((_, id) => dist2.set(id, Infinity));
  
  if (!dist2.has(graphStartId)) {
    console.warn('[Dijkstra] startId not found in graph:', startId);
    return null;
  }
  if (!dist2.has(graphEndId)) {
    console.warn('[Dijkstra] endId not found in graph:', endId);
    return null;
  }

  dist2.set(graphStartId, 0);
  pq.push({ cost: 0, id: graphStartId });

  while (pq.length) {
    pq.sort((a, b) => a.cost - b.cost);
    const { cost, id } = pq.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (id === graphEndId) break;

    const neighbors = adj.get(id) || [];
    neighbors.forEach(({ neighborId, cost: edgeCost, type, meta }) => {
      const newCost = cost + edgeCost;
      if (newCost < dist2.get(neighborId)) {
        dist2.set(neighborId, newCost);
        prev.set(neighborId, id);
        edgeMeta.set(neighborId, { type, meta });
        pq.push({ cost: newCost, id: neighborId });
      }
    });
  }

  if (dist2.get(graphEndId) === Infinity) return null;

  const path = [];
  const edges = [];
  let cur = graphEndId;
  while (cur !== undefined && cur !== null) {
    path.unshift(cur);
    const meta = edgeMeta.get(cur);
    if (meta) edges.unshift({ to: cur, from: prev.get(cur), ...meta });
    cur = prev.get(cur);
  }
  return { path, cost: dist2.get(graphEndId), edges };
}

function clearPathResult() {
  document.getElementById('pathResult').innerHTML = '';
}

function clearPathHighlights() {
  window._pathState = null;
  document.querySelectorAll('.element').forEach(el => {
    el.classList.remove('path-highlight', 'path-start', 'path-end');
    const badge = el.querySelector('.path-num');
    if (badge) badge.remove();
  });
  const svg = document.getElementById('pathArrowSvg');
  if (svg) svg.innerHTML = '';
  const bar = document.getElementById('pathFloorBar');
  if (bar) { bar.innerHTML = ''; bar.style.display = 'none'; }
  const cb = document.getElementById('pathClearBtn');
  if (cb) cb.style.display = 'none';
  const rdp = document.getElementById('routeDetailsPanel');
  if (rdp) rdp.style.display = 'none';
}

function findTransitionElement(a, b, floorEls) {
  for (const el of floorEls) {
    if (el.id === a.id || el.id === b.id) continue;
    const type = (el.type || '').toLowerCase();
    if (['door', 'window', 'entry_exit'].includes(type)) {
      if (rectsOverlapOrTouch(el, a, 12) && rectsOverlapOrTouch(el, b, 12)) {
        return el;
      }
    }
  }
  return null;
}

// Find the midpoint of the overlap segment between two touching rectangles
// Returns a point ON the shared wall — the actual doorway/passage location
function getSharedWallMidpoint(a, b) {
  const rec = getElById(a.id);
  const isAPassage = isPassage(a);
  const isBPassage = isPassage(b);
  const isAOpen = ['door', 'window', 'entry_exit', 'waypoint'].includes((a.type || '').toLowerCase());
  const isBOpen = ['door', 'window', 'entry_exit', 'waypoint'].includes((b.type || '').toLowerCase());

  if (rec && !isAOpen && !isBOpen && (!isAPassage || !isBPassage)) {
    const floor = state.floors.find(f => f.id === rec.floorId);
    const floorEls = floor ? floor.blocks.flatMap(bl => bl.elements) : [];
    const transitionEl = findTransitionElement(a, b, floorEls);
    if (transitionEl) {
      const edge = getSharedEdge(a, b, 12);
      return {
        x: transitionEl.x + transitionEl.w / 2,
        y: transitionEl.y + transitionEl.h / 2,
        axis: edge ? edge.axis : 'f'
      };
    }
  }

  const edge = getSharedEdge(a, b, 10);
  if (edge) return edge;

  return {
    x: (a.x + a.w / 2 + b.x + b.w / 2) / 2,
    y: (a.y + a.h / 2 + b.y + b.h / 2) / 2,
    axis: 'f'
  };
}

function generatePathDirections(path, edges) {
  if (!path || path.length < 2) return '';
  
  let html = `
    <div style="margin-top:14px; border-top:1px solid var(--border-color); padding-top:12px;">
      <div style="font-weight:700; font-size:13px; color:var(--text-primary); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <i data-lucide="footprints" style="width:14px; height:14px; color:var(--accent-primary);"></i>
        Step-by-Step Directions
      </div>
      <ol class="path-directions-list" style="margin:0; padding-left:16px; font-size:12px; color:var(--text-secondary); line-height:1.6; max-height:180px; overflow-y:auto; list-style-type:decimal;">
  `;
  
  let currentFloorId = null;
  const steps = [];
  
  for (let i = 0; i < path.length; i++) {
    const elId = path[i];
    const rec = getElById(elId);
    if (!rec) continue;
    
    const el = rec.el;
    const typeStr = (el.type || '').toLowerCase();
    
    if (rec.floorId !== currentFloorId) {
      currentFloorId = rec.floorId;
      const bldgNameStr = rec.buildingName ? ` in <b>${rec.buildingName}</b>` : '';
      steps.push({ type: 'floor', text: `📍 On <b>${rec.floorName}</b>${bldgNameStr}:`, floorId: rec.floorId });
    }
    
    if (i === 0) {
      steps.push({ type: 'start', text: `Start at <b>${el.name || el.type}</b>`, floorId: rec.floorId });
    } else {
      const prevElId = path[i - 1];
      const prevRec = getElById(prevElId);
      if (!prevRec) continue;
      const edge = edges.find(e => (e.from === prevElId && e.to === elId) || (e.from === elId && e.to === prevElId));
      
      if (edge && edge.type === 'stair') {
        const upOrDown = prevRec.el.stairDir === 'down' ? 'down' : 'up';
        const targetFloorName = edge.meta.toFloorName || 'next floor';
        const targetBuildingName = edge.meta.toBuildingName || '';
        const bldgStr = (targetBuildingName && targetBuildingName !== prevRec.buildingName) ? ` of <b>${targetBuildingName}</b>` : '';
        const connectorType = (prevRec.el.type === 'Elevator' || el.type === 'Elevator') ? 'Elevator' : 'Stairs';
        steps.push({ 
          type: 'stair', 
          text: `Take <b>${prevRec.el.name}</b> (${connectorType}) ${upOrDown} to <b>${targetFloorName}</b>${bldgStr} (exiting at ${el.name})`, 
          floorId: rec.floorId 
        });
      } else if (edge && edge.type === 'universal') {
        const fromFloorName = prevRec.floorName || 'current floor';
        const fromBuildingName = prevRec.buildingName || '';
        const toFloorName = rec.floorName || 'target floor';
        const toBuildingName = rec.buildingName || '';
        
        let linkText = '';
        if (fromBuildingName && toBuildingName && fromBuildingName !== toBuildingName) {
          linkText = `Cross bridge from <b>${prevRec.el.name}</b> (${fromFloorName}, ${fromBuildingName}) to <b>${el.name}</b> (${toFloorName}, ${toBuildingName})`;
        } else if (prevRec.floorId !== rec.floorId) {
          linkText = `Use vertical link from <b>${prevRec.el.name}</b> (${fromFloorName}) to <b>${el.name}</b> (${toFloorName})`;
        } else {
          linkText = `Use connection from <b>${prevRec.el.name}</b> to <b>${el.name}</b>`;
        }
        steps.push({ 
          type: 'link', 
          text: linkText, 
          floorId: rec.floorId 
        });
      } else if (typeStr === 'door') {
        steps.push({ type: 'door', text: `Go through door <b>${el.name || ''}</b>`, floorId: rec.floorId });
      } else if (typeStr === 'window') {
        steps.push({ type: 'window', text: `Go through window <b>${el.name || ''}</b>`, floorId: rec.floorId });
      } else if (typeStr === 'entry_exit') {
        steps.push({ type: 'entry_exit', text: `Go through entry/exit point <b>${el.name || ''}</b>`, floorId: rec.floorId });
      } else if (typeStr === 'waypoint') {
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.type === 'waypoint') continue;
        steps.push({ type: 'waypoint', text: `Walk along the corridor`, floorId: rec.floorId });
      } else if (typeStr === 'bridge') {
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.type === 'bridge') continue;
        steps.push({ type: 'bridge', text: `Cross bridge <b>${el.name || ''}</b>`, floorId: rec.floorId });
      } else if (typeStr === 'corridor' || typeStr.startsWith('corridor-')) {
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.type === 'corridor') continue;
        steps.push({ type: 'corridor', text: `Enter corridor <b>${el.name || ''}</b>`, floorId: rec.floorId });
      } else {
        steps.push({ type: 'room', text: `Enter <b>${el.name || el.type}</b>`, floorId: rec.floorId });
      }
    }
  }
  
  steps.forEach(step => {
    if (step.type === 'floor') {
      html += `<li style="list-style-type:none; margin-left:-16px; margin-top:8px; margin-bottom:4px; color:var(--accent-primary); font-weight:700;">${step.text}</li>`;
    } else {
      html += `<li style="margin-bottom:3px;">${step.text}</li>`;
    }
  });
  
  html += `
      </ol>
    </div>
  `;
  
  return html;
}

function runPathFinder() {
  clearPathHighlights();
  const fromId = parseInt(document.getElementById('pfFrom').value);
  const toId = parseInt(document.getElementById('pfTo').value);

  if (fromId === toId) {
    document.getElementById('pathResult').innerHTML = '<div class="path-empty">Start and end are the same room!</div>';
    return;
  }

  const stopSelects = document.querySelectorAll('.pf-stop-select');
  const stopIds = Array.from(stopSelects).map(sel => parseInt(sel.value));
  const sequence = [fromId, ...stopIds, toId];

  const adj = buildGraph();
  let combinedPath = [];
  let combinedEdges = [];
  let success = true;

  for (let i = 0; i < sequence.length - 1; i++) {
    const sId = sequence[i];
    const eId = sequence[i + 1];
    if (sId === eId) continue;
    const res = dijkstra(adj, sId, eId);
    if (!res) {
      success = false;
      break;
    }
    if (i === 0) {
      combinedPath.push(...res.path);
    } else {
      combinedPath.push(...res.path.slice(1));
    }
    combinedEdges.push(...res.edges);
  }

  const result = success ? { path: combinedPath, edges: combinedEdges } : null;
  const resultDiv = document.getElementById('pathResult');

  if (!result) {
    const fromRec = getElById(fromId);
    const toRec = getElById(toId);
    const sameFloor = fromRec && toRec && fromRec.floorId === toRec.floorId;

    let reason = '';
    let fix = '';

    if (!sameFloor) {
      const fromFloorHasLinks = state.stairLinks.some(lk => lk.fromFloorId === fromRec?.floorId || lk.toFloorId === fromRec?.floorId)
        || state.universalLinks.some(lk => lk.fromFloorId === fromRec?.floorId || lk.toFloorId === fromRec?.floorId);
      const toFloorHasLinks = state.stairLinks.some(lk => lk.fromFloorId === toRec?.floorId || lk.toFloorId === toRec?.floorId)
        || state.universalLinks.some(lk => lk.fromFloorId === toRec?.floorId || lk.toFloorId === toRec?.floorId);
      const totalLinks = state.stairLinks.length + state.universalLinks.length;

      if (totalLinks === 0) {
        reason = 'No connections exist between any floors.';
        fix = 'Select any element on the canvas → click <b>🔗 Link to Any Element</b> in the Properties panel to connect elements across floors. You can also use Staircase, Elevator, or Stair Hall linking.';
      } else if (!fromFloorHasLinks) {
        reason = `<b>${fromRec?.floorName}</b> has no cross-floor links.`;
        fix = `Go to <b>${fromRec?.floorName}</b>, select any element → click <b>🔗 Link to Any Element</b> to connect it to an element on another floor.`;
      } else if (!toFloorHasLinks) {
        reason = `<b>${toRec?.floorName}</b> has no cross-floor links.`;
        fix = `Go to <b>${toRec?.floorName}</b>, select any element → click <b>🔗 Link to Any Element</b> to connect it to an element on another floor.`;
      } else {
        reason = 'The linked elements on each floor are not connected to the rooms in the path.';
        fix = 'Make sure the linked elements are touching (overlapping) corridors or rooms on their floor, forming a connected chain.';
      }
    } else {
      reason = 'The rooms are on the same floor but no connected path exists between them.';
      fix = 'Paths travel through <b>Corridors</b>, <b>Doors</b>, <b>Elevators</b>, <b>Staircases</b>, <b>Stair Halls</b>, and <b>Element Links</b>. Make sure each room touches a Corridor or has a Door element on its shared wall, or use <b>🔗 Link to Any Element</b> to directly connect them.';
    }

    resultDiv.innerHTML = `<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:12px;font-size:13px;line-height:1.6;">
      <div style="font-weight:700;color:#dc2626;margin-bottom:6px;">❌ No path found</div>
      <div style="color:#7f1d1d;margin-bottom:8px;">${reason}</div>
      <div style="background:#fef2f2;border-radius:6px;padding:8px;color:#991b1b;">
        <b>How to fix:</b><br>${fix}
      </div>
    </div>`;
    return;
  }

  const { path, edges } = result;
  const numFloors = new Set(path.map(id => getElById(id)?.floorId)).size;

  // Calculate distance & ETA
  let totalDistancePx = 0;
  let stairTransitions = 0;
  let elevatorTransitions = 0;
  
  for (let i = 0; i < path.length - 1; i++) {
    const fromRec = getElById(path[i]);
    const toRec = getElById(path[i+1]);
    if (!fromRec || !toRec) continue;
    
    const edge = edges.find(e => (e.from === path[i] && e.to === path[i+1]) || (e.from === path[i+1] && e.to === path[i]));
    if (edge && edge.type === 'stair') {
      if (fromRec.el.type === 'Elevator' || toRec.el.type === 'Elevator') {
        elevatorTransitions++;
      } else {
        stairTransitions++;
      }
      totalDistancePx += 100;
    } else if (edge && edge.type === 'universal') {
      totalDistancePx += 80;
    } else {
      const d = dist(fromRec.el, toRec.el);
      totalDistancePx += d;
    }
  }
  
  const totalDistanceMeters = Math.round(totalDistancePx * 0.05);
  let totalSeconds = (totalDistanceMeters / 1.4) + (stairTransitions * 15) + (elevatorTransitions * 10);
  
  let etaStr = '';
  if (totalSeconds < 60) {
    etaStr = `${Math.round(totalSeconds)}s`;
  } else {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.round(totalSeconds % 60);
    etaStr = `${mins}m ${secs}s`;
  }

  resultDiv.innerHTML = `<div class="path-summary" style="margin-bottom:8px;">
    ✅ Path found — <strong>${path.length} spaces</strong> across <strong>${numFloors} floor(s)</strong>
    ${numFloors > 1 ? '<br><span style="font-size:12px;color:#8e44ad;">Use the floor switcher on the map to see each floor.</span>' : ''}
  </div>`;

  window._pathState = { path, edges };

  const startRec = getElById(fromId);
  if (startRec) {
    state.currFloorId = startRec.floorId;
    state.currBlockId = startRec.blockId;
    state.selectedIds = [];
    renderAll();
  }

  // Populate floating Route details panel
  const rdp = document.getElementById('routeDetailsPanel');
  if (rdp) {
    const rdc = document.getElementById('routeDetailsContent');
    if (rdc) {
      const fromRec = getElById(fromId);
      const toRec = getElById(toId);
      rdc.innerHTML = `
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px; line-height:1.4;">
          From: <b>${fromRec ? elLabel(fromRec) : 'Start'}</b><br>
          To: <b>${toRec ? elLabel(toRec) : 'Destination'}</b>
        </div>
        <div style="background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px; display:flex; justify-content:space-around; font-size:12px; color:var(--text-primary); margin-bottom:10px;">
          <div style="text-align:center;">
            <div style="color:var(--text-secondary); font-size:9px; text-transform:uppercase; margin-bottom:2px; font-weight:600;">Distance</div>
            <div style="font-weight:700; font-size:14px; color:var(--accent-primary);">${totalDistanceMeters} m</div>
          </div>
          <div style="width:1px; background:var(--border-color);"></div>
          <div style="text-align:center;">
            <div style="color:var(--text-secondary); font-size:9px; text-transform:uppercase; margin-bottom:2px; font-weight:600;">Est. Time</div>
            <div style="font-weight:700; font-size:14px; color:var(--accent-success);">${etaStr}</div>
          </div>
        </div>
        ${generatePathDirections(path, edges)}
      `;
      rdp.style.display = 'flex';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  document.getElementById('pathModal').classList.add('hidden');

  setTimeout(() => {
    const activeFloor = startRec ? startRec.floorId : state.currFloorId;
    drawPathArrows(path, edges, activeFloor, true);
    applyPathHighlights(path, activeFloor);
    buildFloorBar(path, edges, activeFloor);
    const cb = document.getElementById('pathClearBtn');
    if (cb) cb.style.display = 'block';
    showToast(`Path found: ${path.length} steps — animating on map`);
  }, 60);
}

function clearPathfinderStops() {
  const container = document.getElementById('pfStopsContainer');
  if (container) container.innerHTML = '';
}

function addPathfinderStop() {
  const container = document.getElementById('pfStopsContainer');
  if (!container) return;

  const allEls = allElements();
  const rooms = allEls.filter(r =>
    !['door', 'window', 'entry_exit', 'text', 'waypoint'].includes(r.el.type?.toLowerCase()) &&
    !r.el.type?.startsWith('Corridor-') &&
    r.el.type !== 'Corridor' &&
    r.el.type !== 'bridge'
  );

  const row = document.createElement('div');
  row.className = 'pathfinder-stop-row';
  row.style.cssText = 'display:flex; gap:6px; align-items:center; margin-top:4px;';

  const select = document.createElement('select');
  select.className = 'pf-stop-select';
  select.style.cssText = 'flex:1; margin-bottom:0;';
  select.onchange = clearPathResult;

  rooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.el.id;
    opt.textContent = elLabel(r);
    select.appendChild(opt);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.style.cssText = 'padding:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0;';
  delBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px;"></i>';
  delBtn.onclick = () => {
    row.remove();
    clearPathResult();
  };

  row.appendChild(select);
  row.appendChild(delBtn);
  container.appendChild(row);

  if (window.lucide) window.lucide.createIcons();
}

function openPathFinder() {
  clearPathHighlights();
  clearPathfinderStops();
  const allEls = allElements();
  const rooms = allEls.filter(r => !['door', 'window', 'entry_exit', 'text', 'waypoint'].includes(r.el.type?.toLowerCase()) && !r.el.type?.startsWith('Corridor-') && r.el.type !== 'Corridor' && r.el.type !== 'bridge');

  const fromSel = document.getElementById('pfFrom');
  const toSel = document.getElementById('pfTo');
  fromSel.innerHTML = '';
  toSel.innerHTML = '';

  rooms.forEach(r => {
    const opt1 = document.createElement('option');
    opt1.value = r.el.id;
    opt1.textContent = elLabel(r);
    fromSel.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = r.el.id;
    opt2.textContent = elLabel(r);
    toSel.appendChild(opt2);
  });

  if (toSel.options.length > 1) toSel.selectedIndex = 1;

  clearPathResult();
  document.getElementById('pathModal').classList.remove('hidden');
}

function closePathModal() {
  document.getElementById('pathModal').classList.add('hidden');
}
