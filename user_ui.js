/* ============================
   user_ui.js
   UI Controller — Production Quality
   ============================ */

let destinationId = null;
let currentPathData = null;
let searchable = [];

let activeStepIndex = 0;
let navSteps = [];

/* ============================
   INIT
   ============================ */
function initUI() {
  updateLocationUI();
  setupFloorSwitcher();
  setupBlockSwitcher();
  setupSearch();
  setupBottomSheet();
  setupCancelRoute();
  setupStartLocationManual();
  setupNavHud();

  // Render map for current floor
  if (window.userState.currentFloorId) {
    window.renderFloor(window.userState.currentFloorId);
    setupFloorSwitcher();
    setupBlockSwitcher();
  }

  if (window.lucide) window.lucide.createIcons();
}

/* ============================
   LOCATION UI
   ============================ */
function updateLocationUI() {
  const badge = document.getElementById('youAreHereBadge');
  const title = document.getElementById('sheetTitle');
  const subtitle = document.getElementById('sheetSubtitle');

  if (window.userState.currentLocationElId) {
    const rec = window.findElementById(window.userState.currentLocationElId);
    if (rec) {
      badge.classList.remove('hidden');
      title.textContent = rec.el.name || rec.el.type || 'Your Location';
      const floorInfo = window.state.floors.find(f => f.id === rec.floorId);
      subtitle.textContent = floorInfo ? floorInfo.name : '';
    } else {
      badge.classList.add('hidden');
      title.textContent = 'Map Loaded';
      subtitle.textContent = 'Search a destination to navigate';
    }
  } else {
    badge.classList.add('hidden');
    title.textContent = 'Map Loaded';
    subtitle.textContent = 'Scan a QR code or search a room';
  }
}

/* ============================
   FLOOR SWITCHER
   ============================ */
function setupFloorSwitcher() {
  const switcher = document.getElementById('floorSwitcher');
  switcher.innerHTML = '';

  if (!window.state || !window.state.floors) return;

  // Determine current active building
  let currentBldgId = window.userState.currentBuildingId;
  if (!currentBldgId && window.userState.currentFloorId) {
    const curFloor = window.state.floors.find(f => f.id === window.userState.currentFloorId);
    if (curFloor) {
      currentBldgId = curFloor.buildingId;
      window.userState.currentBuildingId = currentBldgId;
    }
  }

  // Filter floors belonging to the current building
  const floors = window.state.floors
    .filter(f => !currentBldgId || f.buildingId === currentBldgId)
    .reverse();

  floors.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `floor-btn${f.id === window.userState.currentFloorId ? ' active' : ''}`;

    // Abbreviate floor names
    let short = f.name;
    const low = short.toLowerCase();
    if (low.includes('ground') || low.includes('g ')) short = 'G';
    else if (low.includes('basement')) short = 'B';
    else {
      const numMatch = short.match(/\d+/);
      if (numMatch) short = numMatch[0];
      else short = short.substring(0, 2).toUpperCase();
    }
    btn.textContent = short;
    btn.title = f.name;

    btn.onclick = () => switchFloor(f.id);
    switcher.appendChild(btn);
  });
}

function switchFloor(floorId) {
  window.userState.currentFloorId = floorId;
  
  // Keep building ID updated
  const f = window.state.floors.find(fl => fl.id === floorId);
  if (f) {
    window.userState.currentBuildingId = f.buildingId || null;
  }

  document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
  
  // Rebuild floor switcher to ensure correct active buttons and building grouping
  setupFloorSwitcher();
  setupBlockSwitcher();

  window.renderFloor(floorId);

  // Redraw path if exists
  if (currentPathData) {
    window.drawRoute(currentPathData.path, currentPathData.edges);
  }
}

/* ============================
   SEARCH
   ============================ */
function setupSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const dropdown = document.getElementById('searchDropdown');

  // Build searchable index
  searchable = [];
  if (window.state && window.state.floors) {
    window.state.floors.forEach(f => {
      const bldg = window.state.buildings ? window.state.buildings.find(b => b.id === f.buildingId) : null;
      const blocks = f.blocks || [];
      blocks.forEach(b => {
        const elements = b.elements || [];
        elements.forEach(el => {
          const type = (el.type || '').toLowerCase();
          // Skip infrastructure elements from search
          if (type.startsWith('corridor') || type === 'text' || type === 'waypoint' || type === 'bridge') return;
          searchable.push({
            id: el.id,
            name: el.name || type,
            type: type,
            floorName: f.name,
            floorId: f.id,
            buildingName: bldg ? bldg.name : ''
          });
        });
      });
    });
  }

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase().trim();
    dropdown.innerHTML = '';

    if (val.length > 0) {
      clearBtn.classList.remove('hidden');
      dropdown.classList.remove('hidden');

      // Fuzzy-ish search: split query into words, all must match
      const words = val.split(/\s+/);
      const results = searchable.filter(s => {
        const hay = `${s.name} ${s.type} ${s.floorName} ${s.buildingName}`.toLowerCase();
        return words.every(w => hay.includes(w));
      });

      if (results.length === 0) {
        dropdown.innerHTML = '<div class="search-item"><div class="item-sub" style="padding:4px 0;">No results found</div></div>';
      } else {
        results.slice(0, 10).forEach(res => {
          const item = document.createElement('div');
          item.className = 'search-item';

          const { iconName, iconClass } = getElementIcon(res.type);

          item.innerHTML = `
            <div class="item-icon ${iconClass}">
              <i data-lucide="${iconName}" style="width:18px;height:18px;"></i>
            </div>
            <div style="flex:1; min-width:0;">
              <div class="item-title">${highlightMatch(res.name, val)}</div>
              <div class="item-sub">${res.floorName}${res.buildingName ? ' · ' + res.buildingName : ''}</div>
            </div>
          `;

          item.onclick = () => {
            input.value = res.name;
            dropdown.classList.add('hidden');
            destinationId = res.id;
            calculateRoute();
          };

          dropdown.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
      }
    } else {
      clearBtn.classList.add('hidden');
      dropdown.classList.add('hidden');
      if (destinationId) {
        destinationId = null;
        clearRouteData();
      }
    }
  });

  // Close dropdown on outside click
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.top-bar') && !e.target.closest('.search-dropdown')) {
      dropdown.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    dropdown.classList.add('hidden');
    destinationId = null;
    clearRouteData();
  });
}

function getElementIcon(type) {
  if (type.includes('restroom') || type.includes('toilet') || type.includes('wc')) return { iconName: 'bath', iconClass: 'facility' };
  if (type.includes('cooler') || type.includes('water')) return { iconName: 'droplets', iconClass: 'facility' };
  if (type.includes('stair')) return { iconName: 'arrow-up-down', iconClass: 'stairs' };
  if (type.includes('elevator') || type.includes('lift')) return { iconName: 'chevrons-up', iconClass: 'stairs' };
  if (type === 'door') return { iconName: 'door-open', iconClass: 'facility' };
  if (type === 'entry_exit') return { iconName: 'log-in', iconClass: 'facility' };
  if (type.includes('hall')) return { iconName: 'landmark', iconClass: 'room' };
  return { iconName: 'map-pin', iconClass: 'room' };
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return text.substring(0, idx) +
    '<strong style="color:var(--primary);">' + text.substring(idx, idx + query.length) + '</strong>' +
    text.substring(idx + query.length);
}

/* ============================
   BOTTOM SHEET
   ============================ */
function setupBottomSheet() {
  const sheet = document.getElementById('bottomSheet');
  const handle = document.getElementById('sheetHandle');
  let dragStartY = 0;
  let sheetStartTranslateY = 0;
  let dragging = false;

  const states = ['collapsed', 'peek', 'expanded'];
  let currentState = 'collapsed';

  function getSheetTranslateY() {
    const st = getComputedStyle(sheet);
    const matrix = new DOMMatrixReadOnly(st.transform);
    return matrix.m42;
  }

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragStartY = e.clientY;
    sheetStartTranslateY = getSheetTranslateY();
    sheet.style.transition = 'none';
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - dragStartY;
    const newY = sheetStartTranslateY + dy;
    sheet.style.transform = `translateY(${Math.max(0, newY)}px)`;
  });

  handle.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    const dy = e.clientY - dragStartY;

    if (currentState === 'collapsed' || currentState === 'peek') {
      if (dy < -40) {
        setSheetState('expanded');
      } else if (dy > 40) {
        setSheetState('collapsed');
      } else {
        setSheetState(currentState);
      }
    } else if (currentState === 'expanded') {
      if (dy > 60) {
        setSheetState(destinationId ? 'peek' : 'collapsed');
      } else {
        setSheetState('expanded');
      }
    }
  });

  function setSheetState(newState) {
    sheet.classList.remove('collapsed', 'peek', 'expanded');
    sheet.classList.add(newState);
    sheet.style.transform = '';
    currentState = newState;
  }
  window._setSheetState = setSheetState;
}

/* ============================
   ROUTE CALCULATION
   ============================ */
function calculateRoute() {
  console.log("Current location:", window.userState.currentLocationElId);
  console.log("Destination:", destinationId);
  navSteps = [];
  activeStepIndex = 0;

  if (!window.userState.currentLocationElId) {
    window.showUserToast('Set your location first (scan QR)');
    console.warn('[Route] No currentLocationElId set');
    return;
  }
  if (!destinationId) {
    window.showUserToast('Select a destination first');
    console.warn('[Route] No destinationId set');
    return;
  }

  const startId = window.userState.currentLocationElId;

  // Guard: compare with type coercion (both could be int or string)
  if (String(startId) === String(destinationId)) {
    window.showUserToast('You are already here!');
    console.warn('[Route] Start === Destination:', startId);
    return;
  }

  console.log('[Route] Computing path from', startId, 'to', destinationId);

  // Build graph and run Dijkstra
  const adj = buildGraph();
  const result = dijkstra(adj, startId, destinationId);

  if (!result) {
    document.getElementById('routeSteps').innerHTML =
      '<div style="text-align:center;padding:16px;color:var(--danger);font-size:14px;font-weight:500;">No route found between these locations.</div>';
    
    // Ensure the top header of the route card at least shows the attempted locations
    const startRec = window.findElementById(startId);
    const endRec = window.findElementById(destinationId);
    document.getElementById('routeFromText').textContent = startRec ? (startRec.el.name || 'Start') : 'Your Location';
    document.getElementById('routeToText').textContent = endRec ? (endRec.el.name || 'Destination') : 'Destination';
    document.getElementById('routeTimeText').textContent = '--';
    document.getElementById('routeDistText').textContent = '--';

    showRouteCard();
    if (window._setSheetState) window._setSheetState('peek');
    return;
  }

  currentPathData = result;

  // Populate route UI
  populateRouteUI(result);
  showRouteCard();

  // Switch to starting floor and draw
  const startRec = window.findElementById(startId);
  if (startRec) {
    window.userState.currentFloorId = startRec.floorId;
    window.renderFloor(startRec.floorId);
    setupFloorSwitcher();
    window.drawRoute(result.path, result.edges);
  }

  // Expand sheet to peek
  if (window._setSheetState) window._setSheetState('peek');
}

function populateRouteUI(result) {
  const { path, edges } = result;

  // From / To text
  const startRec = window.findElementById(path[0]);
  const endRec = window.findElementById(path[path.length - 1]);
  document.getElementById('routeFromText').textContent = startRec ? (startRec.el.name || 'Start') : 'Your Location';
  document.getElementById('routeToText').textContent = endRec ? (endRec.el.name || 'Destination') : 'Destination';

  // Calculate distance and time
  let totalDistPx = 0;
  let stairCount = 0;
  let elevatorCount = 0;
  const floorSet = new Set();

  for (let i = 0; i < path.length; i++) {
    const rec = window.findElementById(path[i]);
    if (rec) floorSet.add(rec.floorId);
  }

  for (let i = 0; i < path.length - 1; i++) {
    const fromRec = window.findElementById(path[i]);
    const toRec = window.findElementById(path[i + 1]);
    if (!fromRec || !toRec) continue;

    const edge = edges.find(e => (e.from === path[i] && e.to === path[i + 1]) || (e.from === path[i + 1] && e.to === path[i]));
    if (edge && edge.type === 'stair') {
      if ((fromRec.el.type || '').toLowerCase() === 'elevator' || (toRec.el.type || '').toLowerCase() === 'elevator') {
        elevatorCount++;
      } else {
        stairCount++;
      }
      totalDistPx += 100;
    } else if (edge && edge.type === 'universal') {
      totalDistPx += 80;
    } else {
      const ca = { x: fromRec.el.x + fromRec.el.w / 2, y: fromRec.el.y + fromRec.el.h / 2 };
      const cb = { x: toRec.el.x + toRec.el.w / 2, y: toRec.el.y + toRec.el.h / 2 };
      totalDistPx += Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2);
    }
  }

  const distMeters = Math.round(totalDistPx * 0.05);
  const totalSec = (distMeters / 1.4) + (stairCount * 15) + (elevatorCount * 10);
  let timeStr;
  if (totalSec < 60) timeStr = `${Math.round(totalSec)}s`;
  else {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.round(totalSec % 60);
    timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  document.getElementById('routeTimeText').textContent = timeStr;
  document.getElementById('routeDistText').textContent = `${distMeters}m`;

  const floorsChip = document.getElementById('routeFloorsChip');
  if (floorSet.size > 1) {
    floorsChip.style.display = '';
    document.getElementById('routeFloorsText').textContent = `${floorSet.size} floors`;
  } else {
    floorsChip.style.display = 'none';
  }

  // Generate turn-by-turn steps
  generateSteps(path, edges);
}

/* ============================
   STEP-BY-STEP DIRECTIONS
   ============================ */
function generateSteps(path, edges) {
  const stepsContainer = document.getElementById('routeSteps');
  stepsContainer.innerHTML = '';

  if (!path || path.length < 2) return;

  let stepNum = 1;
  let currentFloorId = null;
  let lastDirection = null;
  let corridorCount = 0;
  navSteps = [];

  for (let i = 0; i < path.length; i++) {
    const elId = path[i];
    const rec = window.findElementById(elId);
    if (!rec) continue;

    const el = rec.el;
    const type = (el.type || '').toLowerCase();

    // Floor change header
    if (rec.floorId !== currentFloorId) {
      currentFloorId = rec.floorId;
      const floorName = rec.floorName || 'Unknown Floor';
      addStep(stepsContainer, '📍', `On <strong>${floorName}</strong>`, 'floor-change', rec.floorId, elId);
    }

    // Start
    if (i === 0) {
      const displayTxt = `Start at <strong>${el.name || el.type}</strong>`;
      const stepEl = addStep(stepsContainer, stepNum++, displayTxt, null, rec.floorId, elId);
      navSteps.push({ text: displayTxt, floorId: rec.floorId, elId, domEl: stepEl });
      continue;
    }

    // End
    if (i === path.length - 1) {
      const displayTxt = `Arrive at <strong>${el.name || el.type}</strong>`;
      const stepEl = addStep(stepsContainer, '🏁', displayTxt, 'arrival', rec.floorId, elId);
      navSteps.push({ text: displayTxt, floorId: rec.floorId, elId, domEl: stepEl });
      continue;
    }

    const prevElId = path[i - 1];
    const prevRec = window.findElementById(prevElId);
    const edge = edges.find(e => (e.from === prevElId && e.to === elId));

    // Floor transition (stair/elevator)
    if (edge && edge.type === 'stair') {
      const connectorType = (type === 'elevator' || (prevRec && prevRec.el.type === 'Elevator')) ? 'elevator' : 'stairs';
      const targetFloor = edge.meta.toFloorName || 'next floor';
      const icon = connectorType === 'elevator' ? '🛗' : '🪜';
      const displayTxt = `Take the <strong>${connectorType}</strong> to <strong>${targetFloor}</strong>`;
      const stepEl = addStep(stepsContainer, icon, displayTxt, 'floor-change', rec.floorId, elId);
      navSteps.push({ text: displayTxt, floorId: rec.floorId, elId, domEl: stepEl });
      corridorCount = 0;
      continue;
    }

    // Universal link
    if (edge && edge.type === 'universal') {
      const targetFloor = edge.meta.toFloorName || '';
      const displayTxt = `Use connection to <strong>${el.name || el.type}</strong>${targetFloor ? ` (${targetFloor})` : ''}`;
      const stepEl = addStep(stepsContainer, '🔗', displayTxt, 'floor-change', rec.floorId, elId);
      navSteps.push({ text: displayTxt, floorId: rec.floorId, elId, domEl: stepEl });
      corridorCount = 0;
      continue;
    }

    // Door
    if (type === 'door' || type === 'entry_exit') {
      const displayTxt = `Go through <strong>${el.name || (type === 'door' ? 'door' : 'entrance')}</strong>`;
      const stepEl = addStep(stepsContainer, stepNum++, displayTxt, null, rec.floorId, elId);
      navSteps.push({ text: displayTxt, floorId: rec.floorId, elId, domEl: stepEl });
      continue;
    }

    // Corridor / Waypoint — calculate direction
    if (type === 'corridor' || type.startsWith('corridor-') || type === 'waypoint') {
      if (type === 'waypoint') { corridorCount++; continue; }
      if (corridorCount === 0) {
        // Calculate direction from previous element
        if (prevRec && i + 1 < path.length) {
          const nextRec = window.findElementById(path[i + 1]);
          const dir = getDirectionText(prevRec.el, el, nextRec ? nextRec.el : null);
          if (dir && dir !== lastDirection) {
            const stepEl = addStep(stepsContainer, stepNum++, dir, null, rec.floorId, elId);
            navSteps.push({ text: dir, floorId: rec.floorId, elId, domEl: stepEl });
            lastDirection = dir;
          }
        }
      }
      corridorCount++;
      continue;
    }

    // Regular room (not start/end) — usually a pass-through
    if (!type.startsWith('corridor') && type !== 'waypoint' && type !== 'bridge') {
      const displayTxt = `Pass through <strong>${el.name || el.type}</strong>`;
      const stepEl = addStep(stepsContainer, stepNum++, displayTxt, null, rec.floorId, elId);
      navSteps.push({ text: displayTxt, floorId: rec.floorId, elId, domEl: stepEl });
    }
  }

  activeStepIndex = 0;
  updateNavHud();

  if (window.lucide) window.lucide.createIcons();
}

function getDirectionText(prevEl, currentEl, nextEl) {
  if (!prevEl || !currentEl) return null;

  const prevCx = prevEl.x + prevEl.w / 2;
  const prevCy = prevEl.y + prevEl.h / 2;
  const curCx = currentEl.x + currentEl.w / 2;
  const curCy = currentEl.y + currentEl.h / 2;

  const name = currentEl.name || 'corridor';

  if (nextEl) {
    const nextCx = nextEl.x + nextEl.w / 2;
    const nextCy = nextEl.y + nextEl.h / 2;

    // Vector from prev→current and current→next
    const v1x = curCx - prevCx, v1y = curCy - prevCy;
    const v2x = nextCx - curCx, v2y = nextCy - curCy;

    // Cross product to determine turn direction
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    const angle = Math.atan2(cross, dot) * (180 / Math.PI);

    if (Math.abs(angle) < 25) {
      return `Walk straight through <strong>${name}</strong>`;
    } else if (angle > 25 && angle < 155) {
      return `Turn right into <strong>${name}</strong>`;
    } else if (angle < -25 && angle > -155) {
      return `Turn left into <strong>${name}</strong>`;
    } else {
      return `Turn around through <strong>${name}</strong>`;
    }
  }

  return `Continue through <strong>${name}</strong>`;
}

function addStep(container, num, text, extraClass, targetFloorId, targetElId) {
  const div = document.createElement('div');
  div.className = 'step-item';

  if (targetFloorId) {
    div.classList.add('clickable-step');
    div.addEventListener('click', () => {
      // De-highlight any other active segments, highlight this one
      document.querySelectorAll('.clickable-step').forEach(el => el.classList.remove('active-segment'));
      div.classList.add('active-segment');

      // Switch to the floor
      switchFloor(targetFloorId);

      // Center map on the element if targetElId is provided
      if (targetElId && window.centerOnElement) {
        setTimeout(() => {
          window.centerOnElement(targetElId);
          // Highlight target element temporarily
          const elementOnMap = document.querySelector(`[data-id="${targetElId}"]`);
          if (elementOnMap) {
            elementOnMap.classList.add('pulse-highlight');
            setTimeout(() => elementOnMap.classList.remove('pulse-highlight'), 1800);
          }
        }, 250);
      }
    });
  }

  const numDiv = document.createElement('div');
  numDiv.className = `step-num${extraClass ? ' ' + extraClass : ''}`;
  numDiv.textContent = typeof num === 'number' ? num : '';
  if (typeof num === 'string') numDiv.textContent = num;

  const textDiv = document.createElement('div');
  textDiv.className = 'step-text';
  textDiv.innerHTML = text;

  div.append(numDiv, textDiv);
  container.appendChild(div);
  return div;
}

/* ============================
   ROUTE CARD VISIBILITY
   ============================ */
function showRouteCard() {
  document.getElementById('locationCard').classList.add('hidden');
  document.getElementById('routeCard').classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function hideRouteCard() {
  document.getElementById('locationCard').classList.remove('hidden');
  document.getElementById('routeCard').classList.add('hidden');
}

function setupCancelRoute() {
  const btn = document.getElementById('cancelRouteBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      clearRouteData();
    });
  }
}

function clearRouteData() {
  currentPathData = null;
  destinationId = null;
  navSteps = [];
  activeStepIndex = 0;
  const hud = document.getElementById('navHud');
  if (hud) hud.style.display = 'none';

  window.clearRoute();
  hideRouteCard();
  updateLocationUI();

  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').classList.add('hidden');

  if (window._setSheetState) window._setSheetState('collapsed');

  // Re-render current floor
  if (window.userState.currentFloorId) {
    window.renderFloor(window.userState.currentFloorId);
  }
}

/* ============================
   MANUAL LOCATION SELECTOR
   ============================ */
function setupStartLocationManual() {
  const changeLocBtn = document.getElementById('setLocationBtnTop');
  if (changeLocBtn) {
    changeLocBtn.addEventListener('click', () => {
      openStartLocationModal();
    });
  }

  const changeStartFromRouteBtn = document.getElementById('changeStartFromRouteBtn');
  if (changeStartFromRouteBtn) {
    changeStartFromRouteBtn.addEventListener('click', () => {
      openStartLocationModal();
    });
  }

  const cancelBtn = document.getElementById('cancelStartLocationBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeStartLocationModal();
    });
  }

  const confirmBtn = document.getElementById('confirmStartLocationBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      confirmStartLocation();
    });
  }
}

function openStartLocationModal() {
  const select = document.getElementById('startLocationSelect');
  if (!select) return;
  select.innerHTML = '';

  // Populate dropdown with all searchable locations
  searchable.forEach(res => {
    const opt = document.createElement('option');
    opt.value = res.id;
    // Label: "Room Name (Floor Name · Building Name)"
    opt.textContent = `${res.name} (${res.floorName}${res.buildingName ? ' · ' + res.buildingName : ''})`;
    // Select the current location if it matches
    if (String(res.id) === String(window.userState.currentLocationElId)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  const modal = document.getElementById('startLocationModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeStartLocationModal() {
  const modal = document.getElementById('startLocationModal');
  if (modal) modal.classList.add('hidden');
}

function confirmStartLocation() {
  const select = document.getElementById('startLocationSelect');
  if (!select) return;

  const selectedId = parseInt(select.value, 10);
  if (isNaN(selectedId)) return;

  // Update state
  window.userState.currentLocationElId = selectedId;
  window.userState.qrParsed = false; // Mark as manual selection

  // Find the floor of this element and switch to it
  const rec = window.findElementById(selectedId);
  if (rec) {
    window.userState.currentFloorId = rec.floorId;
    const floorInfo = window.state.floors.find(f => f.id === rec.floorId);
    window.userState.currentBuildingId = floorInfo ? (floorInfo.buildingId || null) : null;
    
    window.renderFloor(rec.floorId);
    setupFloorSwitcher();
    setupBlockSwitcher();
    // Center map on this element
    if (window.centerOnElement) {
      setTimeout(() => window.centerOnElement(selectedId), 200);
    }
  }

  // Refresh UI
  updateLocationUI();
  closeStartLocationModal();
  window.showUserToast('Start location updated');

  // Recalculate route if destination is active
  if (destinationId) {
    calculateRoute();
  }
}

function setupBlockSwitcher() {
  const container = document.getElementById('blockSwitcher');
  if (!container) return;
  container.innerHTML = '';

  if (!window.state || !window.state.buildings || window.state.buildings.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  const buildings = window.state.buildings;

  // Fallback active building detection
  if (!window.userState.currentBuildingId && window.state.floors.length > 0) {
    const activeFloor = window.state.floors.find(f => f.id === window.userState.currentFloorId);
    if (activeFloor) {
      window.userState.currentBuildingId = activeFloor.buildingId;
    } else {
      window.userState.currentBuildingId = window.state.floors[0].buildingId;
    }
  }

  buildings.forEach(bldg => {
    const btn = document.createElement('button');
    btn.className = 'block-btn';
    if (bldg.id === window.userState.currentBuildingId) {
      btn.classList.add('active');
    }
    btn.textContent = bldg.name;
    btn.addEventListener('click', () => {
      if (window.userState.currentBuildingId === bldg.id) return;

      window.userState.currentBuildingId = bldg.id;

      // Filter and load first floor of selected building
      const floors = window.state.floors.filter(f => f.buildingId === bldg.id);
      if (floors.length > 0) {
        switchFloor(floors[0].id);
      } else {
        setupFloorSwitcher();
        setupBlockSwitcher();
      }
    });
    container.appendChild(btn);
  });
}

function setupNavHud() {
  const prevBtn = document.getElementById('navPrevBtn');
  const nextBtn = document.getElementById('navNextBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (activeStepIndex > 0) {
        activeStepIndex--;
        updateNavHud();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (activeStepIndex < navSteps.length - 1) {
        activeStepIndex++;
        updateNavHud();
      } else {
        window.showUserToast('You have arrived!');
      }
    });
  }
}

function updateNavHud() {
  const hud = document.getElementById('navHud');
  const prevBtn = document.getElementById('navPrevBtn');
  const nextBtn = document.getElementById('navNextBtn');
  const stepText = document.getElementById('navStepNumText');
  const instructionText = document.getElementById('navInstructionText');

  if (!hud || navSteps.length === 0) {
    if (hud) hud.style.display = 'none';
    return;
  }

  hud.style.display = 'flex';

  const currentStep = navSteps[activeStepIndex];
  stepText.textContent = `Step ${activeStepIndex + 1} of ${navSteps.length}`;
  instructionText.innerHTML = currentStep.text;

  prevBtn.disabled = activeStepIndex === 0;

  const nextSpan = nextBtn.querySelector('span');
  const nextIcon = nextBtn.querySelector('i');
  if (activeStepIndex === navSteps.length - 1) {
    if (nextSpan) nextSpan.textContent = 'Arrived';
    if (nextIcon) {
      nextIcon.setAttribute('data-lucide', 'check');
      nextIcon.className = '';
    }
  } else {
    if (nextSpan) nextSpan.textContent = 'Next';
    if (nextIcon) {
      nextIcon.setAttribute('data-lucide', 'chevron-right');
      nextIcon.className = '';
    }
  }
  if (window.lucide) window.lucide.createIcons();

  // Switch to step floor and center
  switchFloor(currentStep.floorId);
  if (currentStep.elId && window.centerOnElement) {
    setTimeout(() => {
      window.centerOnElement(currentStep.elId);
      const elementOnMap = document.querySelector(`[data-id="${currentStep.elId}"]`);
      if (elementOnMap) {
        elementOnMap.classList.add('pulse-highlight');
        setTimeout(() => elementOnMap.classList.remove('pulse-highlight'), 1800);
      }
    }, 250);
  }

  // Highlight corresponding item in list
  navSteps.forEach((step, index) => {
    if (index === activeStepIndex) {
      if (step.domEl) {
        step.domEl.classList.add('active-segment');
        step.domEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      if (step.domEl) {
        step.domEl.classList.remove('active-segment');
      }
    }
  });
}

/* ============================
   INIT HOOK
   ============================ */
window.addEventListener('mapDataLoaded', () => {
  initUI();
});
