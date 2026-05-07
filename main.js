const canvas = document.getElementById("main-canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay-canvas");
const octx = overlay.getContext("2d");
const textEl = document.getElementById("text-input-el");
const wrapper = document.getElementById("canvas-wrapper");

let currentTool = "pencil";
let isDrawing = false;
let startX = 0,
  startY = 0;
let zoom = 1;
let gridVisible = false;
let smoothMode = false;
let gridCanvas = null;

// Style
let strokeColor = "#000000";
let fillColor = "#ffffff";
let brushSize = 4;
let opacityVal = 1;
let blurVal = 0;
let useStroke = true;
let useFill = false;
let lineCap = "round";
let dashPattern = [];
let polygonSides = 6;
let cornerRadius = 0;
let fontSize = 24;
let fontFamily = "Arial";
let fontBold = false;
let fontItalic = false;

// Path
let pathPoints = [];
let polyPoints = [];
let sprayTimer = null;
let textPos = { x: 0, y: 0 };

// History
const MAX_HIST = 40;
let history = [];
let histIdx = -1;

/* ============================================================
   PALETTE
============================================================ */
const PALETTE_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b7b7b7",
  "#cccccc",
  "#d9d9d9",
  "#ffffff",
  "#ff0000",
  "#ff4040",
  "#ff9900",
  "#ffcc00",
  "#00cc00",
  "#00cccc",
  "#0066ff",
  "#6600cc",
  "#ff66cc",
  "#cc0000",
  "#cc6600",
  "#cccc00",
  "#006600",
  "#006666",
  "#003399",
  "#330099",
  "#ffcccc",
  "#ffe5cc",
  "#ffffcc",
  "#ccffcc",
  "#ccffff",
  "#cce5ff",
  "#e5ccff",
  "#ffcce5",
];
const palEl = document.getElementById("palette");
PALETTE_COLORS.forEach((c) => {
  const d = document.createElement("div");
  d.className = "pal-color";
  d.style.background = c;
  d.title = c + " (Shift+klik untuk Fill)";
  d.addEventListener("click", (e) =>
    e.shiftKey ? setFillColor(c) : setStrokeColor(c),
  );
  palEl.appendChild(d);
});

/* ============================================================
   COLOR
============================================================ */
const colorStrokeInput = document.getElementById("color-stroke");
const colorFillInput = document.getElementById("color-fill");
colorStrokeInput.addEventListener("input", (e) =>
  setStrokeColor(e.target.value),
);
colorFillInput.addEventListener("input", (e) => setFillColor(e.target.value));

function setStrokeColor(c) {
  strokeColor = c;
  colorStrokeInput.value = c;
  colorStrokeInput.closest(".color-swatch").style.background = c;
  document.getElementById("label-stroke").textContent = c;
}
function setFillColor(c) {
  fillColor = c;
  colorFillInput.value = c;
  document.getElementById("swatch-fill").style.background = c;
  document.getElementById("label-fill").textContent = c;
}

/* ============================================================
   SLIDERS
============================================================ */
function bindSlider(id, valId, suffix, cb) {
  const sl = document.getElementById(id),
    lbl = document.getElementById(valId);
  sl.addEventListener("input", () => {
    lbl.textContent = sl.value + (suffix || "");
    cb(+sl.value);
  });
}
bindSlider("size-slider", "size-val", "", (v) => (brushSize = v));
bindSlider("opacity-slider", "opacity-val", "%", (v) => (opacityVal = v / 100));
bindSlider("blur-slider", "blur-val", "", (v) => (blurVal = v));
bindSlider("sides-slider", "sides-val", "", (v) => (polygonSides = v));
bindSlider("corner-slider", "corner-val", "", (v) => (cornerRadius = v));
bindSlider("font-size-slider", "font-size-val", "", (v) => (fontSize = v));
document
  .getElementById("linecap-select")
  .addEventListener("change", (e) => (lineCap = e.target.value));
document.getElementById("dash-select").addEventListener("change", (e) => {
  dashPattern = e.target.value ? e.target.value.split(",").map(Number) : [];
});
document
  .getElementById("font-family-select")
  .addEventListener("change", (e) => (fontFamily = e.target.value));

/* ============================================================
   TOGGLES
============================================================ */
function toggleStroke() {
  useStroke = !useStroke;
  document
    .getElementById("btn-stroke-on")
    .classList.toggle("active", useStroke);
}
function toggleFill() {
  useFill = !useFill;
  document.getElementById("btn-fill-on").classList.toggle("active", useFill);
}
function toggleBold() {
  fontBold = !fontBold;
  document.getElementById("btn-bold").classList.toggle("active", fontBold);
}
function toggleItalic() {
  fontItalic = !fontItalic;
  document.getElementById("btn-italic").classList.toggle("active", fontItalic);
}

/* ============================================================
   TOOLS
============================================================ */
const toolNames = {
  pencil: "Pensil",
  brush: "Kuas",
  eraser: "Penghapus",
  spray: "Semprot",
  fill: "Isi Warna",
  eyedropper: "Pipet Warna",
  line: "Garis",
  arrow: "Panah",
  rect: "Persegi",
  circle: "Lingkaran",
  triangle: "Segitiga",
  polygon: "Poligon",
  star: "Bintang",
  text: "Teks",
};

function setTool(tool) {
  finishTextInput();
  if (currentTool === "polygon" && tool !== "polygon") finishPolygon();
  currentTool = tool;
  document
    .querySelectorAll(".tool-btn")
    .forEach((b) => b.classList.remove("active"));
  const el = document.getElementById("t-" + tool);
  if (el) el.classList.add("active");
  document.getElementById("stat-tool").textContent = toolNames[tool] || tool;
  const hints = {
    polygon: "Klik untuk menambah titik · Klik ganda untuk menutup",
    fill: "Klik area untuk mengisi warna",
    eyedropper: "Klik piksel untuk memilih warna",
    text: "Klik kanvas lalu ketik · Enter untuk selesai",
  };
  document.getElementById("stat-hint").textContent =
    hints[tool] || "Tekan Ctrl+Z untuk Undo";
  const cursorMap = {
    eraser: "cell",
    fill: "cell",
    eyedropper: "crosshair",
    text: "text",
  };
  const cur = cursorMap[tool] || "crosshair";
  canvas.style.cursor = cur;
}

/* ============================================================
   CTX STYLE
============================================================ */
function applyStyle(c) {
  c.lineWidth = brushSize;
  c.lineCap = lineCap;
  c.lineJoin = "round";
  c.globalAlpha = opacityVal;
  c.filter = blurVal > 0 ? `blur(${blurVal}px)` : "none";
  c.setLineDash(dashPattern);
  c.strokeStyle = strokeColor;
  c.fillStyle = fillColor;
}
function resetCtx(c) {
  c.globalAlpha = 1;
  c.filter = "none";
  c.setLineDash([]);
  c.globalCompositeOperation = "source-over";
}

function getFont() {
  return `${fontBold ? "bold " : ""}${fontItalic ? "italic " : ""}${fontSize}px ${fontFamily}`;
}

/* ============================================================
   GET MOUSE POS
============================================================ */
function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const cx = e.clientX !== undefined ? e.clientX : e.pageX;
  const cy = e.clientY !== undefined ? e.clientY : e.pageY;
  return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
}

/* ============================================================
   EVENTS
============================================================ */
canvas.addEventListener("mousedown", onDown);
canvas.addEventListener("mousemove", onMove);
canvas.addEventListener("mouseup", onUp);
canvas.addEventListener("mouseleave", (e) => {
  if (isDrawing) onUp(e);
});
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    onDown(e.touches[0]);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    onMove(e.touches[0]);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    onUp(e.changedTouches[0]);
  },
  { passive: false },
);
canvas.addEventListener("dblclick", (e) => {
  if (currentTool === "polygon") {
    finishPolygon();
  }
});

function onDown(e) {
  const p = getPos(e);
  if (currentTool === "text") {
    startTextInput(p.x, p.y);
    return;
  }
  if (currentTool === "eyedropper") {
    pickColor(p.x, p.y);
    return;
  }
  if (currentTool === "fill") {
    floodFill(Math.round(p.x), Math.round(p.y));
    return;
  }
  if (currentTool === "polygon") {
    handlePolygonClick(p.x, p.y);
    return;
  }

  isDrawing = true;
  startX = p.x;
  startY = p.y;

  if (["pencil", "brush", "eraser"].includes(currentTool)) {
    saveSnap();
    pathPoints = [{ x: p.x, y: p.y }];
    applyStyle(ctx);
    if (currentTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  if (currentTool === "spray") {
    saveSnap();
    sprayAt(p.x, p.y);
    sprayTimer = setInterval(() => sprayAt(startX, startY), 25);
  }
}

function onMove(e) {
  const p = getPos(e);
  document.getElementById("stat-pos").textContent =
    `${Math.round(p.x)}, ${Math.round(p.y)}`;

  if (currentTool === "polygon" && polyPoints.length > 0) {
    drawPolyPreview(p.x, p.y);
    return;
  }
  if (currentTool === "spray" && isDrawing) {
    startX = p.x;
    startY = p.y;
    return;
  }
  if (!isDrawing) return;

  if (currentTool === "pencil" || currentTool === "brush") {
    pathPoints.push({ x: p.x, y: p.y });
    if (currentTool === "brush") {
      applyStyle(ctx);
      ctx.lineWidth = brushSize * 3;
      ctx.globalAlpha = opacityVal * 0.18;
      ctx.globalCompositeOperation = "source-over";
    } else {
      applyStyle(ctx);
      ctx.globalCompositeOperation = "source-over";
    }
    drawSmoothPath(ctx, pathPoints);
  } else if (currentTool === "eraser") {
    applyStyle(ctx);
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    ctx.lineWidth = brushSize * 2;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  } else {
    // preview shapes on overlay
    octx.clearRect(0, 0, overlay.width, overlay.height);
    applyStyle(octx);
    drawShape(octx, currentTool, startX, startY, p.x, p.y);
    resetCtx(octx);
  }
}

function onUp(e) {
  clearInterval(sprayTimer);
  sprayTimer = null;
  if (!isDrawing) return;
  isDrawing = false;

  if (["pencil", "brush", "eraser", "spray"].includes(currentTool)) {
    resetCtx(ctx);
    return;
  }
  const p = getPos(e);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  saveSnap();
  applyStyle(ctx);
  ctx.globalCompositeOperation = "source-over";
  drawShape(ctx, currentTool, startX, startY, p.x, p.y);
  resetCtx(ctx);
}

/* ============================================================
   DRAW SHAPES
============================================================ */
function drawShape(c, tool, x1, y1, x2, y2) {
  const w = x2 - x1,
    h = y2 - y1;
  c.beginPath();
  switch (tool) {
    case "line":
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      if (useStroke) c.stroke();
      break;
    case "arrow":
      drawArrow(c, x1, y1, x2, y2);
      break;
    case "rect":
      if (cornerRadius > 0) roundRect(c, x1, y1, w, h, cornerRadius);
      else c.rect(x1, y1, w, h);
      if (useFill) c.fill();
      if (useStroke) c.stroke();
      break;
    case "circle": {
      c.ellipse(
        x1 + w / 2,
        y1 + h / 2,
        Math.abs(w) / 2,
        Math.abs(h) / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (useFill) c.fill();
      if (useStroke) c.stroke();
      break;
    }
    case "triangle":
      c.moveTo(x1 + w / 2, y1);
      c.lineTo(x2, y2);
      c.lineTo(x1, y2);
      c.closePath();
      if (useFill) c.fill();
      if (useStroke) c.stroke();
      break;
    case "polygon":
      drawRegPoly(
        c,
        x1 + w / 2,
        y1 + h / 2,
        Math.min(Math.abs(w), Math.abs(h)) / 2,
        polygonSides,
      );
      if (useFill) c.fill();
      if (useStroke) c.stroke();
      break;
    case "star":
      drawStar(
        c,
        x1 + w / 2,
        y1 + h / 2,
        Math.min(Math.abs(w), Math.abs(h)) / 2,
        Math.min(Math.abs(w), Math.abs(h)) / 4,
        5,
      );
      if (useFill) c.fill();
      if (useStroke) c.stroke();
      break;
  }
}

function drawArrow(c, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const headLen = Math.min(brushSize * 6 + 12, len * 0.4);
  const ha = 0.42;
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.lineTo(
    x2 - headLen * Math.cos(angle - ha),
    y2 - headLen * Math.sin(angle - ha),
  );
  c.moveTo(x2, y2);
  c.lineTo(
    x2 - headLen * Math.cos(angle + ha),
    y2 - headLen * Math.sin(angle + ha),
  );
  if (useStroke) c.stroke();
}

function drawRegPoly(c, cx, cy, r, n) {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    i === 0
      ? c.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  c.closePath();
}

function drawStar(c, cx, cy, outerR, innerR, pts) {
  c.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    i === 0
      ? c.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  c.closePath();
}

function roundRect(c, x, y, w, h, r) {
  const sx = w < 0 ? x + w : x,
    sy = h < 0 ? y + h : y,
    aw = Math.abs(w),
    ah = Math.abs(h);
  const rx = Math.min(r, aw / 2),
    ry = Math.min(r, ah / 2);
  c.beginPath();
  c.moveTo(sx + rx, sy);
  c.lineTo(sx + aw - rx, sy);
  c.quadraticCurveTo(sx + aw, sy, sx + aw, sy + ry);
  c.lineTo(sx + aw, sy + ah - ry);
  c.quadraticCurveTo(sx + aw, sy + ah, sx + aw - rx, sy + ah);
  c.lineTo(sx + rx, sy + ah);
  c.quadraticCurveTo(sx, sy + ah, sx, sy + ah - ry);
  c.lineTo(sx, sy + ry);
  c.quadraticCurveTo(sx, sy, sx + rx, sy);
  c.closePath();
}

/* ============================================================
   SMOOTH PATH
============================================================ */
function drawSmoothPath(c, pts) {
  if (pts.length < 2) return;
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  if (smoothMode && pts.length > 2) {
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2,
        my = (pts[i].y + pts[i + 1].y) / 2;
      c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  } else {
    pts.slice(1).forEach((p) => c.lineTo(p.x, p.y));
  }
  c.stroke();
}

/* ============================================================
   POLYGON TOOL
============================================================ */
function handlePolygonClick(x, y) {
  polyPoints.push({ x, y });
  drawPolyPreview(x, y);
}
function drawPolyPreview(mx, my) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (polyPoints.length === 0) return;
  applyStyle(octx);
  octx.beginPath();
  polyPoints.forEach((p, i) =>
    i === 0 ? octx.moveTo(p.x, p.y) : octx.lineTo(p.x, p.y),
  );
  octx.lineTo(mx, my);
  if (useStroke) octx.stroke();
  // highlight first point
  octx.fillStyle = "#5c6ef8";
  octx.globalAlpha = 1;
  octx.filter = "none";
  octx.beginPath();
  octx.arc(polyPoints[0].x, polyPoints[0].y, 5, 0, Math.PI * 2);
  octx.fill();
}
function finishPolygon() {
  if (polyPoints.length < 2) {
    polyPoints = [];
    octx.clearRect(0, 0, overlay.width, overlay.height);
    return;
  }
  octx.clearRect(0, 0, overlay.width, overlay.height);
  saveSnap();
  applyStyle(ctx);
  ctx.beginPath();
  polyPoints.forEach((p, i) =>
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
  );
  ctx.closePath();
  if (useFill) ctx.fill();
  if (useStroke) ctx.stroke();
  resetCtx(ctx);
  polyPoints = [];
  showToast("Poligon selesai");
}

/* ============================================================
   SPRAY
============================================================ */
function sprayAt(x, y) {
  const r = brushSize * 4 + 4,
    density = Math.max(10, brushSize * 4);
  ctx.fillStyle = strokeColor;
  ctx.globalAlpha = opacityVal;
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < density; i++) {
    const a = Math.random() * Math.PI * 2,
      d = Math.random() * r;
    ctx.beginPath();
    ctx.arc(
      x + d * Math.cos(a),
      y + d * Math.sin(a),
      Math.random() * 1.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  resetCtx(ctx);
}

/* ============================================================
   COLOR PICKER
============================================================ */
function pickColor(x, y) {
  const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  const hex =
    "#" +
    [data[0], data[1], data[2]]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  setStrokeColor(hex);
  showToast("Warna dipilih: " + hex);
}

/* ============================================================
   FLOOD FILL (scanline)
============================================================ */
function floodFill(px, py) {
  saveSnap();
  const W = canvas.width,
    H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H),
    data = img.data;
  const idx = (py * W + px) * 4;
  const [tr, tg, tb, ta] = [
    data[idx],
    data[idx + 1],
    data[idx + 2],
    data[idx + 3],
  ];
  const [fr, fg, fb] = hexToRGB(strokeColor);
  const fa = Math.round(opacityVal * 255);
  if (tr === fr && tg === fg && tb === fb && ta === fa) {
    showToast("Warna sudah sama");
    return;
  }
  function match(i) {
    return (
      data[i] === tr &&
      data[i + 1] === tg &&
      data[i + 2] === tb &&
      data[i + 3] === ta
    );
  }
  function paint(i) {
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;
  }
  const vis = new Uint8Array(W * H),
    stack = [[px, py]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
    const ci = cy * W + cx;
    if (vis[ci]) continue;
    if (!match(ci * 4)) continue;
    vis[ci] = 1;
    paint(ci * 4);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  ctx.putImageData(img, 0, 0);
  showToast("Area diisi");
}
function hexToRGB(h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/* ============================================================
   TEXT TOOL
============================================================ */
function startTextInput(x, y) {
  finishTextInput();
  textPos = { x, y };
  textEl.style.display = "block";
  textEl.style.left = x * zoom + "px";
  textEl.style.top = (y - fontSize) * zoom + "px";
  textEl.style.fontSize = fontSize * zoom + "px";
  textEl.style.fontFamily = fontFamily;
  textEl.style.fontWeight = fontBold ? "bold" : "normal";
  textEl.style.fontStyle = fontItalic ? "italic" : "normal";
  textEl.style.color = strokeColor;
  textEl.style.opacity = opacityVal;
  textEl.value = "";
  textEl.style.height = "auto";
  textEl.focus();
}
function finishTextInput() {
  if (textEl.style.display === "none") return;
  const txt = textEl.value.trim();
  if (txt) {
    saveSnap();
    ctx.globalAlpha = opacityVal;
    ctx.filter = blurVal > 0 ? `blur(${blurVal}px)` : "none";
    ctx.font = getFont();
    ctx.fillStyle = strokeColor;
    ctx.globalCompositeOperation = "source-over";
    const lines = txt.split("\n");
    lines.forEach((line, i) =>
      ctx.fillText(line, textPos.x, textPos.y + i * (fontSize * 1.25)),
    );
    resetCtx(ctx);
  }
  textEl.style.display = "none";
  textEl.value = "";
}
textEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    textEl.value = "";
    finishTextInput();
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    finishTextInput();
  }
  setTimeout(() => {
    textEl.style.height = "auto";
    textEl.style.height = textEl.scrollHeight + "px";
  }, 0);
});

/* ============================================================
   HISTORY
============================================================ */
function saveSnap() {
  if (histIdx < history.length - 1) history.splice(histIdx + 1);
  history.push(canvas.toDataURL());
  if (history.length > MAX_HIST) history.shift();
  histIdx = history.length - 1;
  updateHistLabel();
}
function undo() {
  if (histIdx <= 0) {
    showToast("Tidak ada yang bisa di-undo");
    return;
  }
  histIdx--;
  restoreSnap(history[histIdx]);
}
function redo() {
  if (histIdx >= history.length - 1) {
    showToast("Tidak ada yang bisa di-redo");
    return;
  }
  histIdx++;
  restoreSnap(history[histIdx]);
}
function restoreSnap(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  updateHistLabel();
}
function updateHistLabel() {
  document.getElementById("stat-history").textContent =
    `${histIdx}/${history.length - 1}`;
}

/* ============================================================
   CANVAS OPS
============================================================ */
function confirmClear() {
  document.getElementById("modal-clear").classList.add("show");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}
function clearCanvas() {
  saveSnap();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  closeModal("modal-clear");
  showToast("Kanvas dihapus ✓");
}
function resizeCanvas() {
  const nw = +document.getElementById("canvas-w").value;
  const nh = +document.getElementById("canvas-h").value;
  if (!nw || !nh || nw < 10 || nh < 10) {
    showToast("Ukuran tidak valid");
    return;
  }
  const tmp = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = nw;
  canvas.height = nh;
  overlay.width = nw;
  overlay.height = nh;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, nw, nh);
  ctx.putImageData(tmp, 0, 0);
  document.getElementById("stat-size").textContent = `${nw} × ${nh}`;
  if (gridVisible) drawGrid();
  saveSnap();
  showToast(`Kanvas diubah ke ${nw}×${nh}`);
}

/* ============================================================
   ZOOM
============================================================ */
function setZoom(z) {
  zoom = Math.max(0.1, Math.min(5, parseFloat((+z).toFixed(2))));
  wrapper.style.transform = `scale(${zoom})`;
  document.getElementById("zoom-label").textContent =
    Math.round(zoom * 100) + "%";
}
document.getElementById("canvas-area").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.08 : -0.08));
  },
  { passive: false },
);

/* ============================================================
   GRID
============================================================ */
function toggleGrid() {
  gridVisible = !gridVisible;
  document.getElementById("btn-grid").classList.toggle("active", gridVisible);
  if (gridVisible) drawGrid();
  else {
    gridCanvas && gridCanvas.remove();
    gridCanvas = null;
  }
}
function drawGrid() {
  if (!gridCanvas) {
    gridCanvas = document.createElement("canvas");
    gridCanvas.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;opacity:.2";
    wrapper.appendChild(gridCanvas);
  }
  gridCanvas.width = canvas.width;
  gridCanvas.height = canvas.height;
  const gc = gridCanvas.getContext("2d");
  gc.strokeStyle = "#0088ff";
  gc.lineWidth = 0.5;
  const step = 20;
  for (let x = 0; x <= canvas.width; x += step) {
    gc.beginPath();
    gc.moveTo(x, 0);
    gc.lineTo(x, canvas.height);
    gc.stroke();
  }
  for (let y = 0; y <= canvas.height; y += step) {
    gc.beginPath();
    gc.moveTo(0, y);
    gc.lineTo(canvas.width, y);
    gc.stroke();
  }
}

/* ============================================================
   SMOOTH
============================================================ */
function toggleSmooth() {
  smoothMode = !smoothMode;
  document.getElementById("btn-smooth").classList.toggle("active", smoothMode);
  showToast("Mode halus: " + (smoothMode ? "ON" : "OFF"));
}

/* ============================================================
   EXPORT
============================================================ */
function exportPNG() {
  finishTextInput();
  const a = document.createElement("a");
  a.download = "gambar-canvasku.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
  showToast("Disimpan sebagai PNG ✓");
}
function exportJPEG() {
  finishTextInput();
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const tc = tmp.getContext("2d");
  tc.fillStyle = "#fff";
  tc.fillRect(0, 0, tmp.width, tmp.height);
  tc.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = "gambar-canvasku.jpg";
  a.href = tmp.toDataURL("image/jpeg", 0.92);
  a.click();
  showToast("Disimpan sebagai JPEG ✓");
}

/* ============================================================
   TOAST
============================================================ */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ============================================================
   KEYBOARD
============================================================ */
document.addEventListener("keydown", (e) => {
  if (e.target === textEl) return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
    if (e.key === "y") {
      e.preventDefault();
      redo();
    }
    if (e.key === "s") {
      e.preventDefault();
      exportPNG();
    }
    return;
  }
  const map = {
    p: "pencil",
    b: "brush",
    e: "eraser",
    q: "spray",
    g: "fill",
    i: "eyedropper",
    l: "line",
    a: "arrow",
    r: "rect",
    c: "circle",
    t: "triangle",
    y: "polygon",
    "*": "star",
    x: "text",
  };
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  if (e.key === "Escape") {
    finishTextInput();
    finishPolygon();
  }
  if (e.key === "=" || e.key === "+") setZoom(zoom + 0.1);
  if (e.key === "-") setZoom(zoom - 0.1);
});

/* ============================================================
   INIT
============================================================ */
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);
saveSnap();
setTool("pencil");
setZoom(1);
document.getElementById("stat-size").textContent =
  `${canvas.width} × ${canvas.height}`;
