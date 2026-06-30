import { supabase } from './user_supabase.js';

/* ============================
   GLOBAL USER STATE
   ============================ */
window.userState = {
  currentFloorId: null,
  currentLocationElId: null,
  currentBuildingId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  viewBox: null,
  initialViewBox: null,
  qrParsed: false    // true if location came from QR
};

/* ============================
   QR / URL PARAM PARSER
   ============================ */
function parseLocationFromURL() {
  const params = new URLSearchParams(window.location.search);

  // Support: ?building=2&floor=4&el=81234
  // Also support: ?building_name=SomeBuilding
  const buildingId = parseInt(params.get('building'));
  const floorId    = parseInt(params.get('floor'));
  const elId       = parseInt(params.get('el'));
  const buildingName = params.get('building_name') || null;

  console.log('[QR Parse] URL params:', { buildingId, floorId, elId, buildingName });

  if (!isNaN(elId)) {
    return { buildingId: isNaN(buildingId) ? null : buildingId,
             floorId:    isNaN(floorId)    ? null : floorId,
             elId,
             buildingName };
  }
  // Even if no element ID, building_name alone can select the building row
  if (buildingName) {
    return { buildingId: isNaN(buildingId) ? null : buildingId,
             floorId:    isNaN(floorId)    ? null : floorId,
             elId: null,
             buildingName };
  }
  return null;
}

function validateAndApplyQRLocation(qr) {
  if (!qr || !qr.elId || !window.state) {
    console.log('[QR Validate] Skipped — no elId or no state');
    return false;
  }

  // Find the element across all floors
  for (const f of window.state.floors) {
    const blocks = f.blocks || [];
    for (const b of blocks) {
      const elements = b.elements || [];
      const el = elements.find(e => String(e.id) === String(qr.elId));
      if (el) {
        window.userState.currentLocationElId = el.id;
        window.userState.currentFloorId = f.id;
        window.userState.currentBuildingId = f.buildingId || null;
        window.userState.qrParsed = true;
        console.log('[QR Validate] ✅ Location set:', { elId: el.id, elName: el.name, floorId: f.id });
        return true;
      }
    }
  }
  console.warn('[QR Validate] ❌ Element ID', qr.elId, 'not found in any floor');
  return false;
}

function fallbackLocation() {
  if (!window.state || !window.state.floors || window.state.floors.length === 0) {
    console.warn('[Fallback] No floors in state — cannot set location');
    return;
  }

  let bestEl = null;
  let bestFloor = null;
  let score = -1;

  // Score element types to find the best connected starting point
  const typeScores = {
    'entry_exit': 100,
    'corridor': 80,
    'hall': 70,
    'staircase': 60,
    'elevator': 60
  };

  for (const f of window.state.floors) {
    const blocks = f.blocks || [];
    for (const b of blocks) {
      const elements = b.elements || [];
      for (const el of elements) {
        if (el.type === 'text') continue;
        const type = (el.type || '').toLowerCase();
        let elScore = typeScores[type] || (type.startsWith('corridor') ? 80 : 10);
        
        if (elScore > score) {
          score = elScore;
          bestEl = el;
          bestFloor = f;
        }
        if (score === 100) break;
      }
      if (score === 100) break;
    }
    if (score === 100) break;
  }

  if (bestEl) {
    window.userState.currentLocationElId = bestEl.id;
    window.userState.currentFloorId = bestFloor.id;
    window.userState.currentBuildingId = bestFloor.buildingId || null;
    console.log('[Fallback] Set to element:', { elId: bestEl.id, type: bestEl.type, name: bestEl.name });
  } else {
    console.warn('[Fallback] No elements found at all');
  }
}

/* ============================
   DATA LOADER
   ============================ */
async function loadBuildings() {
  try {
    // Parse URL params first to know if a specific building is requested
    const qr = parseLocationFromURL();
    const requestedBuildingName = qr ? qr.buildingName : null;

    let row = null;

    if (requestedBuildingName) {
      // Fetch specific building by name
      console.log('[Load] Fetching building by name:', requestedBuildingName);
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .eq('building_name', requestedBuildingName)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) row = data[0];
    }

    if (!row) {
      // Fetch the LATEST deployed building (most recently updated)
      console.log('[Load] Fetching latest building...');
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) row = data[0];
    }

    if (!row) {
      updateSheet('No map data', 'Please deploy a map from Admin.');
      hideSplash();
      return;
    }

    console.log('[Load] Using building row:', {
      building_name: row.building_name,
      updated_at: row.updated_at,
      has_json_data: !!row.json_data
    });

    const layoutData = row.json_data;

    if (!layoutData) {
      console.error('[Load] json_data is null/undefined. Row keys:', Object.keys(row));
      updateSheet('Invalid data', 'Building data is empty — please redeploy from Admin.');
      hideSplash();
      return;
    }

    console.log('[Load] Layout keys:', Object.keys(layoutData));
    console.log('[Load] Floors count:', (layoutData.floors || []).length);

    // Inject into global state for pathfinder.js compatibility
    window.state.buildings = layoutData.buildings || [];
    window.state.floors = layoutData.floors || [];
    window.state.stairLinks = layoutData.stairLinks || [];
    window.state.universalLinks = layoutData.universalLinks || [];
    window.state.walls = layoutData.walls || [];

    console.log('[Load] State injected:', {
      buildings: window.state.buildings.length,
      floors: window.state.floors.length,
      stairLinks: window.state.stairLinks.length,
      walls: window.state.walls.length
    });

    // Apply QR-based location or fallback
    if (qr && qr.elId) {
      const applied = validateAndApplyQRLocation(qr);
      if (!applied) {
        showUserToast('QR location not found on map — using default');
        fallbackLocation();
      }
    } else {
      console.log('[Load] No QR element — using fallback location');
      fallbackLocation();
    }

    // Default floor if still null
    if (!window.userState.currentFloorId && window.state.floors.length > 0) {
      window.userState.currentFloorId = window.state.floors[0].id;
    }

    console.log('[Load] Final userState:', {
      currentLocationElId: window.userState.currentLocationElId,
      currentFloorId: window.userState.currentFloorId,
      qrParsed: window.userState.qrParsed
    });

    // Dispatch ready
    window.dispatchEvent(new Event('mapDataLoaded'));

  } catch (err) {
    console.error('[Load] Failed to load map data:', err);
    updateSheet('Load Failed', err.message);
  } finally {
    hideSplash();
  }
}

/* ============================
   SPLASH
   ============================ */
function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 600);
  }, 400);
}

/* ============================
   TOAST
   ============================ */
window.showUserToast = function(msg, duration = 2500) {
  const t = document.getElementById('userToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
};

/* ============================
   HELPERS
   ============================ */
function updateSheet(title, subtitle) {
  const t = document.getElementById('sheetTitle');
  const s = document.getElementById('sheetSubtitle');
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}

/* ============================
   INIT
   ============================ */
// Run immediately on script execution to prevent DOMContentLoaded race condition.
// Since this module script executes deferred (after document parsing), the DOM is guaranteed to be ready.
if (window.lucide) window.lucide.createIcons();
loadBuildings();