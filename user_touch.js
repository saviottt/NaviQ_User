/* ============================
   user_touch.js
   Touch Pan/Zoom — Production Quality
   ============================ */
(function() {

let isDragging = false;
let startPan = { x: 0, y: 0 };
let activePointers = new Map();
let initialPinchDist = 0;
let initialPinchCenter = null;
let initialPinchViewBox = null;
let lastTap = 0;

// Momentum / inertia
let velocity = { x: 0, y: 0 };
let lastMove = { x: 0, y: 0, t: 0 };
let momentumRAF = null;

function initTouchControls() {
  const container = document.getElementById('mapContainer');
  container.addEventListener('pointerdown', onPointerDown, { passive: false });
  container.addEventListener('pointermove', onPointerMove, { passive: false });
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('wheel', onWheel, { passive: false });

  // Recenter button
  const recenterBtn = document.getElementById('recenterBtn');
  if (recenterBtn) {
    recenterBtn.addEventListener('click', () => {
      if (window.userState.currentLocationElId && window.centerOnElement) {
        window.centerOnElement(window.userState.currentLocationElId);
      } else if (window.resetView) {
        window.resetView();
      }
    });
  }
}

function getSvg() {
  return document.querySelector('#svgWrapper svg');
}

function getViewBox() {
  return window.userState ? window.userState.viewBox : null;
}

function screenToViewBoxScale() {
  const svg = getSvg();
  const vb = getViewBox();
  if (!svg || !vb) return { sx: 1, sy: 1 };
  return { sx: vb.w / svg.clientWidth, sy: vb.h / svg.clientHeight };
}

/* ============================
   POINTER HANDLERS
   ============================ */
function onPointerDown(e) {
  const vb = getViewBox();
  if (!vb) return;
  e.preventDefault();
  cancelMomentum();

  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 1) {
    isDragging = true;
    startPan = { x: e.clientX, y: e.clientY };
    lastMove = { x: e.clientX, y: e.clientY, t: performance.now() };
    velocity = { x: 0, y: 0 };

    // Double-tap detection
    const now = Date.now();
    if (now - lastTap < 300) {
      handleDoubleTap(e);
      lastTap = 0;
    } else {
      lastTap = now;
    }
  } else if (activePointers.size === 2) {
    isDragging = false;
    const pts = Array.from(activePointers.values());
    initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    initialPinchCenter = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2
    };
    initialPinchViewBox = { ...vb };
  }
}

function onPointerMove(e) {
  const vb = getViewBox();
  if (!vb) return;

  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  } else {
    return;
  }

  if (activePointers.size === 1 && isDragging) {
    const now = performance.now();
    const dx = e.clientX - startPan.x;
    const dy = e.clientY - startPan.y;
    const scale = screenToViewBoxScale();

    vb.x -= dx * scale.sx;
    vb.y -= dy * scale.sy;
    applyViewBox();

    // Track velocity for momentum
    const dt = now - lastMove.t;
    if (dt > 0) {
      velocity.x = (e.clientX - lastMove.x) / dt;
      velocity.y = (e.clientY - lastMove.y) / dt;
    }

    startPan = { x: e.clientX, y: e.clientY };
    lastMove = { x: e.clientX, y: e.clientY, t: now };

  } else if (activePointers.size === 2 && initialPinchViewBox) {
    const pts = Array.from(activePointers.values());
    const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const currentCenter = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2
    };

    if (initialPinchDist > 0) {
      const scale = initialPinchDist / currentDist;
      const clampedScale = Math.max(0.25, Math.min(4, scale));

      const newW = initialPinchViewBox.w * clampedScale;
      const newH = initialPinchViewBox.h * clampedScale;

      // Zoom around pinch center
      const svgScale = screenToViewBoxScale();
      const panDx = (initialPinchCenter.x - currentCenter.x) * svgScale.sx;
      const panDy = (initialPinchCenter.y - currentCenter.y) * svgScale.sy;

      const cx = initialPinchViewBox.x + initialPinchViewBox.w / 2 + panDx;
      const cy = initialPinchViewBox.y + initialPinchViewBox.h / 2 + panDy;

      vb.w = newW;
      vb.h = newH;
      vb.x = cx - newW / 2;
      vb.y = cy - newH / 2;

      applyViewBox();
    }
  }
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId);

  if (activePointers.size === 0) {
    if (isDragging) {
      isDragging = false;
      startMomentum();
    }
  } else if (activePointers.size === 1) {
    const pts = Array.from(activePointers.values());
    startPan = { x: pts[0].x, y: pts[0].y };
    lastMove = { x: pts[0].x, y: pts[0].y, t: performance.now() };
    isDragging = true;
    initialPinchViewBox = null;
  }
}

/* ============================
   DOUBLE TAP ZOOM
   ============================ */
function handleDoubleTap(e) {
  const vb = getViewBox();
  const initVb = window.userState.initialViewBox;
  if (!vb || !initVb) return;

  // If zoomed in, reset. Otherwise zoom in 2x at tap point.
  const isZoomedIn = vb.w < initVb.w * 0.8;
  if (isZoomedIn) {
    window.userState.viewBox = { ...initVb };
  } else {
    const scale = screenToViewBoxScale();
    const tapX = vb.x + e.clientX * scale.sx;
    const tapY = vb.y + e.clientY * scale.sy;
    const newW = vb.w * 0.5;
    const newH = vb.h * 0.5;
    window.userState.viewBox = { x: tapX - newW / 2, y: tapY - newH / 2, w: newW, h: newH };
  }
  applyViewBox();
}

/* ============================
   MOMENTUM
   ============================ */
function startMomentum() {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < 0.1) return;

  const scale = screenToViewBoxScale();
  let vx = -velocity.x * scale.sx * 16;
  let vy = -velocity.y * scale.sy * 16;

  function tick() {
    const vb = getViewBox();
    if (!vb) return;

    vx *= 0.92;
    vy *= 0.92;

    if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) return;

    vb.x += vx;
    vb.y += vy;
    applyViewBox();
    momentumRAF = requestAnimationFrame(tick);
  }
  momentumRAF = requestAnimationFrame(tick);
}

function cancelMomentum() {
  if (momentumRAF) {
    cancelAnimationFrame(momentumRAF);
    momentumRAF = null;
  }
}

/* ============================
   WHEEL ZOOM
   ============================ */
function onWheel(e) {
  e.preventDefault();
  const vb = getViewBox();
  if (!vb) return;

  const factor = e.deltaY > 0 ? 1.08 : 0.92;
  const scale = screenToViewBoxScale();

  // Zoom towards mouse position
  const mouseVBx = vb.x + e.clientX * scale.sx;
  const mouseVBy = vb.y + e.clientY * scale.sy;

  const newW = vb.w * factor;
  const newH = vb.h * factor;

  // Anchor zoom to mouse
  vb.x = mouseVBx - (e.clientX / getSvg().clientWidth) * newW;
  vb.y = mouseVBy - (e.clientY / getSvg().clientHeight) * newH;
  vb.w = newW;
  vb.h = newH;

  applyViewBox();
}

/* ============================
   APPLY VIEWBOX
   ============================ */
function applyViewBox() {
  const svg = getSvg();
  const vb = getViewBox();
  if (!svg || !vb) return;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

/* ============================
   INIT
   ============================ */
window.addEventListener('mapDataLoaded', () => {
  initTouchControls();
});

})();
