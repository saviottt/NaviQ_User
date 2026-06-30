/* =================================================================
   STATE
   ================================================================= */
let state = {
  buildings: [{ id: 1, name: 'Main Building' }],
  currBuildingId: 1,
  floors: [{
    id: 1, buildingId: 1, name: 'Ground Floor',
    blocks: [{ id: 101, name: 'Block A', elements: [] }]
  }],
  stairLinks: [],
  universalLinks: [],
  walls: [],
  currFloorId: 1,
  currBlockId: 101,
  selectedIds: [],
  clipboard: [],
  selectedWallId: null,
  zoom: 1,
  gridSize: 20,
  panX: 40,
  panY: 40,
  is3D: false,
  rotX: 52,
  rotZ: -30,
  activeTool: 'select',
  elementsLocked: false
};
window.state = state;

let undoStack = [];
let redoStack = [];

/* =================================================================
   HELPERS
   ================================================================= */
const curFloor = () => state.floors.find(f => f.id === state.currFloorId);

const curBlock = () => {
  const f = curFloor();
  return f ? (f.blocks.find(b => b.id === state.currBlockId) || f.blocks[0]) : null;
};

const getSelected = () => {
  if (!state.selectedIds || state.selectedIds.length !== 1) return null;
  const f = curFloor();
  if (!f) return null;
  for (let b of f.blocks) {
    let el = b.elements.find(e => String(e.id) === String(state.selectedIds[0]));
    if (el) return el;
  }
  return null;
};

const getSelectedElements = () => {
  if (!state.selectedIds || state.selectedIds.length === 0) return [];
  const f = curFloor();
  if (!f) return [];
  const selected = [];
  for (let b of f.blocks) {
    b.elements.forEach(e => {
      if (state.selectedIds.map(String).includes(String(e.id))) selected.push(e);
    });
  }
  state.walls.forEach(w => {
    if (w.floorId === f.id && state.selectedIds.map(String).includes(String(w.id))) {
      selected.push({ ...w, isWall: true });
    }
  });
  return selected;
};

function allElements() {
  const result = [];
  state.floors.forEach(f => {
    const bldg = state.buildings.find(b => b.id === f.buildingId);
    const buildingName = bldg ? bldg.name : 'Default Building';
    f.blocks.forEach(b => {
      b.elements.forEach(el => {
        result.push({ el, floorId: f.id, floorName: f.name, blockId: b.id, blockName: b.name, buildingId: f.buildingId, buildingName });
      });
    });
  });
  return result;
}

function getElById(elId) {
  for (const f of state.floors) {
    const bldg = state.buildings.find(b => b.id === f.buildingId);
    const buildingName = bldg ? bldg.name : 'Default Building';
    for (const b of f.blocks) {
      const el = b.elements.find(e => e.id === elId);
      if (el) return { el, floorId: f.id, floorName: f.name, blockId: b.id, blockName: b.name, buildingId: f.buildingId, buildingName };
    }
  }
  return null;
}

function isStairOrElevator(el) {
  return el.type === 'Staircase' || el.type === 'Elevator' || el.isStairs;
}

function isVerticalJunction(el) {
  const type = (el.type || '').toLowerCase();
  const name = (el.name || '').toLowerCase();
  return type === 'hall' || name.includes('stair hall') || name.includes('stair lobby') || name.includes('vertical junction');
}

function isVerticalConnector(el) {
  return isStairOrElevator(el) || isVerticalJunction(el);
}

function elLabel(rec) {
  const bldgStr = rec.buildingName ? `${rec.buildingName} › ` : '';
  return `${rec.el.name} (${bldgStr}${rec.floorName} › ${rec.blockName})`;
}

function saveState() {
  try {
    localStorage.setItem('layoutProData', JSON.stringify({
      buildings: state.buildings,
      currBuildingId: state.currBuildingId,
      floors: state.floors,
      stairLinks: state.stairLinks,
      universalLinks: state.universalLinks,
      walls: state.walls
    }));
    showToast('Saved');
  } catch (e) { showToast('Save failed'); }
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem('layoutProData');
    if (!raw) return;
    const parsed = JSON.parse(raw);

    if (parsed.buildings) {
      state.buildings = parsed.buildings;
      state.currBuildingId = parsed.currBuildingId || parsed.buildings[0].id;
    } else {
      state.buildings = [{ id: 1, name: 'Main Building' }];
      state.currBuildingId = 1;
    }

    if (parsed.floors) {
      state.floors = parsed.floors;
      if (!parsed.buildings) state.floors.forEach(f => f.buildingId = 1);
      state.stairLinks = parsed.stairLinks || [];
      state.universalLinks = parsed.universalLinks || [];
      state.walls = parsed.walls || [];
      state.currFloorId = state.floors[0].id;
      state.currBlockId = state.floors[0].blocks[0].id;
      state.selectedIds = [];
    } else if (Array.isArray(parsed)) {
      state.floors = parsed;
      if (!parsed.buildings) state.floors.forEach(f => f.buildingId = 1);
      state.stairLinks = [];
      state.universalLinks = [];
      state.walls = [];
      state.currFloorId = state.floors[0].id;
      state.currBlockId = state.floors[0].blocks[0].id;
    }
    showToast('Layout restored');
  } catch (e) { console.warn('Restore failed', e); }
}

function pushHistory() {
  undoStack.push(JSON.stringify({
    buildings: state.buildings,
    currBuildingId: state.currBuildingId,
    floors: state.floors,
    stairLinks: state.stairLinks,
    universalLinks: state.universalLinks,
    walls: state.walls
  }));
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  saveState();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({
    buildings: state.buildings,
    currBuildingId: state.currBuildingId,
    floors: state.floors,
    stairLinks: state.stairLinks,
    universalLinks: state.universalLinks,
    walls: state.walls
  }));
  const s = JSON.parse(undoStack.pop());
  state.buildings = s.buildings || [{ id: 1, name: 'Main Building' }];
  state.currBuildingId = s.currBuildingId || 1;
  state.floors = s.floors;
  state.stairLinks = s.stairLinks || [];
  state.universalLinks = s.universalLinks || [];
  state.walls = s.walls || [];
  renderAll();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({
    buildings: state.buildings,
    currBuildingId: state.currBuildingId,
    floors: state.floors,
    stairLinks: state.stairLinks,
    universalLinks: state.universalLinks,
    walls: state.walls
  }));
  const s = JSON.parse(redoStack.pop());
  state.buildings = s.buildings || [{ id: 1, name: 'Main Building' }];
  state.currBuildingId = s.currBuildingId || 1;
  state.floors = s.floors;
  state.stairLinks = s.stairLinks || [];
  state.universalLinks = s.universalLinks || [];
  state.walls = s.walls || [];
  renderAll();
}

function confirmClearCanvas() {
  document.getElementById('clearCanvasModal').classList.remove('hidden');
}

function clearCanvas() {
  document.getElementById('clearCanvasModal').classList.add('hidden');
  pushHistory();
  state.buildings = [{ id: 1, name: 'Main Building' }];
  state.currBuildingId = 1;
  state.floors = [{ id: 1, buildingId: 1, name: 'Ground Floor', blocks: [{ id: 101, name: 'Block A', elements: [] }] }];
  state.stairLinks = [];
  state.universalLinks = [];
  state.walls = [];
  state.currFloorId = 1;
  state.currBlockId = 101;
  state.selectedIds = [];
  state.selectedWallId = null;
  state.is3D = false;
  undoStack.length = 0;
  redoStack.length = 0;
  localStorage.removeItem('layoutProData');
  clearPathHighlights();
  renderAll();
  showToast('Canvas cleared');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.style.opacity = 1;
    setTimeout(() => {
      t.style.opacity = 0;
    }, 1800);
  }
}

function getCanvas() {
  return document.getElementById('canvas');
}

function getCanvasWrap() {
  return document.getElementById('canvasWrap');
}

function toggleLockAllElements(locked) {
  state.elementsLocked = !!locked;
  showToast(locked ? 'All elements locked' : 'All elements unlocked');
}
window.toggleLockAllElements = toggleLockAllElements;
