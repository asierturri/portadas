import { mountBook } from "./book.js?v=pages2";

const canvas = document.querySelector("#cover");
const ctx = canvas.getContext("2d");
const authorInput = document.querySelector("#author");
const titleInput = document.querySelector("#title");
const photoInput = document.querySelector("#photo");
const zoomInput = document.querySelector("#zoom");
const pagesInput = document.querySelector("#pages");
const view = document.querySelector("#book-view");

const W = 1600;
const H = 2400;

const state = {
  author: authorInput.value,
  title: titleInput.value,
  image: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  position: "top",
  scheme: "white",
  edition: "alianza",
  series: "contemporanea",
  authorColor: "#111111",
  titleColor: "#e23b4a",
  pages: Number(pagesInput.value) || 320,
};

function makeMapCanvas() {
  const map = document.createElement("canvas");
  map.width = W;
  map.height = H;
  return map;
}

const roughCanvas = makeMapCanvas();
const coatCanvas = makeMapCanvas();
const roughCtx = roughCanvas.getContext("2d");
const coatCtx = coatCanvas.getContext("2d");

function syncInk(target) {
  target.font = ctx.font;
  target.letterSpacing = ctx.letterSpacing;
  target.textAlign = ctx.textAlign;
  target.textBaseline = ctx.textBaseline;
  target.fontStretch = ctx.fontStretch;
  target.shadowColor = "transparent";
  target.shadowBlur = 0;
}

function markRect(x, y, w, h, rough, coat) {
  roughCtx.fillStyle = `rgb(${rough},${rough},${rough})`;
  roughCtx.fillRect(x, y, w, h);
  coatCtx.fillStyle = `rgb(${coat},0,0)`;
  coatCtx.fillRect(x, y, w, h);
}

function markText(text, x, y, rough, coat) {
  syncInk(roughCtx);
  syncInk(coatCtx);
  roughCtx.fillStyle = `rgb(${rough},${rough},${rough})`;
  roughCtx.fillText(text, x, y);
  coatCtx.fillStyle = `rgb(${coat},0,0)`;
  coatCtx.fillText(text, x, y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapText(context, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || "").split(/\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (context.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const char of word) {
        if (context.measureText(chunk + char).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }

  return lines;
}

function imageSourceRect(img, frameW, frameH, zoom, panX, panY) {
  const frameRatio = frameW / frameH;
  const imageRatio = img.width / img.height;
  let sw;
  let sh;
  if (imageRatio > frameRatio) {
    sh = img.height;
    sw = sh * frameRatio;
  } else {
    sw = img.width;
    sh = sw / frameRatio;
  }
  sw /= zoom;
  sh /= zoom;
  const spareX = img.width - sw;
  const spareY = img.height - sh;
  const sx = spareX / 2 + panX * (spareX / 2);
  const sy = spareY / 2 + panY * (spareY / 2);
  return { sx, sy, sw, sh };
}

const AUTHOR_FONT = '"Archivo Author", "Alianza Cover", Archivo, sans-serif';
const COVER_FONT = '"Alianza Cover", Archivo, sans-serif';
const DEBOLSILLO_FONT = "Arial";
const TEXT_MARGIN = 88;
const textPlace = { x: 86, y: Math.round(2400 * 0.24) };
const textBounds = { x: 86, y: 576, w: 700, h: 320 };
let textPlacedByUser = false;

function fitSingleLine(text, maxWidth, maxSize, minSize, weight, family = COVER_FONT) {
  let size = maxSize;
  ctx.letterSpacing = "0px";
  ctx.fontStretch = "normal";
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function drawBackground() {
  ctx.clearRect(0, 0, W, H);
  ctx.letterSpacing = "0px";
  ctx.fontStretch = "normal";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  if (state.image) {
    const src = imageSourceRect(state.image, W, H, state.zoom, state.panX, state.panY);
    ctx.drawImage(state.image, src.sx, src.sy, src.sw, src.sh, 0, 0, W, H);
    return;
  }

  ctx.fillStyle = state.edition === "debolsillo" ? "#c5c1b8" : "#2c2926";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = state.edition === "debolsillo" ? "#6d675e" : "#d9d3c8";
  ctx.font = `400 36px ${COVER_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Añade una foto", W / 2, H * 0.72);
}

function drawDebolsillo() {
  const author = (state.author.trim() || "Autor").toLocaleUpperCase("es");
  const title = state.title.trim() || "Título del libro";
  const authorMissing = !state.author.trim();
  const titleMissing = !state.title.trim();
  const series = state.series === "clasica" ? "Clásica" : "Contemporánea";

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#f7f7f7";
  ctx.font = `400 30px ${DEBOLSILLO_FONT}`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 10;
  ctx.fillText(series, 86, Math.round(H * 0.042));
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  const contentW = W - 86 * 2;
  const authorLines = author.split(/\s+/).filter(Boolean).slice(0, 5);
  const titleWords = title.split(/\s+/).filter(Boolean);
  let textSize = 108;
  for (const word of authorLines) {
    textSize = Math.min(textSize, fitSingleLine(word, contentW, textSize, 42, 700, DEBOLSILLO_FONT));
  }
  for (const word of titleWords) {
    textSize = Math.min(textSize, fitSingleLine(word, contentW, textSize, 42, 700, DEBOLSILLO_FONT));
  }
  ctx.font = `bold ${textSize}px ${DEBOLSILLO_FONT}`;
  const lineHeight = textSize * 1.02;
  const titleLines = wrapText(ctx, title, contentW).slice(0, 4);
  let blockWidth = 0;
  for (const line of authorLines) blockWidth = Math.max(blockWidth, ctx.measureText(line).width);
  for (const line of titleLines) blockWidth = Math.max(blockWidth, ctx.measureText(line).width);
  const blockHeight = authorLines.length * lineHeight + Math.round(textSize * 0.16) + titleLines.length * lineHeight;
  if (!textPlacedByUser) {
    textPlace.x = 86;
    textPlace.y = Math.round(H * 0.24);
  }
  textPlace.x = clamp(textPlace.x, TEXT_MARGIN, Math.max(TEXT_MARGIN, W - TEXT_MARGIN - blockWidth));
  textPlace.y = clamp(textPlace.y, TEXT_MARGIN, Math.max(TEXT_MARGIN, H - TEXT_MARGIN - blockHeight));
  let y = textPlace.y;
  ctx.fillStyle = authorMissing ? "#9a9a9a" : state.authorColor;
  for (const line of authorLines) {
    ctx.fillText(line, textPlace.x, y);
    y += lineHeight;
  }

  y += Math.round(textSize * 0.16);
  ctx.font = `bold ${textSize}px ${DEBOLSILLO_FONT}`;
  const titleLineHeight = lineHeight;
  ctx.fillStyle = titleMissing ? "#b0b0b0" : state.titleColor;
  for (const line of titleLines) {
    ctx.fillText(line, textPlace.x, y);
    y += titleLineHeight;
  }
  textBounds.x = textPlace.x;
  textBounds.y = textPlace.y;
  textBounds.w = blockWidth;
  textBounds.h = blockHeight;

  ctx.fillStyle = state.authorColor;
  ctx.font = `700 32px ${DEBOLSILLO_FONT}`;
  ctx.letterSpacing = "0.18em";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("DEBOLSILLO", 86, H - 78);
  ctx.letterSpacing = "0px";
}

const penguinLogo = new Image();
penguinLogo.src = "images/penguin.png?v=5";
penguinLogo.onload = () => redraw();

function drawPenguinMark(cx, cy, height) {
  if (!penguinLogo.complete || !penguinLogo.naturalWidth) return;
  const ratio = penguinLogo.naturalWidth / penguinLogo.naturalHeight;
  const width = height * ratio;
  ctx.drawImage(penguinLogo, cx - width / 2, cy - height / 2, width, height);
}

function drawPenguinCover() {
  const author = (state.author.trim() || "Autor").toLocaleUpperCase("es");
  const title = state.title.trim() || "Título del libro";
  const authorMissing = !state.author.trim();
  const titleMissing = !state.title.trim();
  const orange = "#f15a22";
  const whiteH = 118;
  const blackH = Math.round(H * 0.24);
  const photoH = H - whiteH - blackH;

  ctx.clearRect(0, 0, W, H);
  ctx.letterSpacing = "0px";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  roughCtx.clearRect(0, 0, W, H);
  coatCtx.clearRect(0, 0, W, H);
  roughCtx.fillStyle = "#c8c8c8";
  roughCtx.fillRect(0, 0, W, H);

  if (state.image) {
    const src = imageSourceRect(state.image, W, photoH, state.zoom, state.panX, state.panY);
    ctx.drawImage(state.image, src.sx, src.sy, src.sw, src.sh, 0, 0, W, photoH);
  } else {
    ctx.fillStyle = "#6e6a64";
    ctx.fillRect(0, 0, W, photoH);
    ctx.fillStyle = "#f3f0ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "400 36px Arial, sans-serif";
    ctx.fillText("Añade una foto", W / 2, photoH / 2);
  }
  markRect(0, 0, W, photoH, 58, 210);

  const whiteY = photoH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, whiteY, W, whiteH);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, whiteY + whiteH, W, blackH);
  markRect(0, whiteY, W, whiteH, 198, 18);
  markRect(0, whiteY + whiteH, W, blackH, 236, 0);

  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "400 30px Arial, sans-serif";
  ctx.letterSpacing = "0.42em";
  const penguinWord = "PENGUIN";
  const classicsWord = "CLASSICS";
  const penguinWordW = ctx.measureText(penguinWord).width;
  const classicsWordW = ctx.measureText(classicsWord).width;
  const logoH = Math.round(whiteH * 0.68);
  const logoW = logoH * (penguinLogo.naturalWidth && penguinLogo.naturalHeight
    ? penguinLogo.naturalWidth / penguinLogo.naturalHeight
    : 0.64);
  const gap = 34;
  const rowW = penguinWordW + classicsWordW + logoW + gap * 2;
  let x = (W - rowW) / 2;
  const bandMid = whiteY + whiteH / 2;
  ctx.fillText(penguinWord, x, bandMid);
  markText(penguinWord, x, bandMid, 18, 255);
  x += penguinWordW + gap;
  drawPenguinMark(x + logoW / 2, bandMid, logoH);
  x += logoW + gap;
  ctx.fillText(classicsWord, x, bandMid);
  markText(classicsWord, x, bandMid, 18, 255);
  ctx.letterSpacing = "0px";

  const textWidth = W - 160;
  const authorSize = fitSingleLine(author, textWidth, 48, 30, 700, "Arial, sans-serif");
  ctx.font = `700 ${authorSize}px Arial, sans-serif`;
  ctx.letterSpacing = "0.28em";
  ctx.textAlign = "center";
  const authorLines = wrapText(ctx, author, textWidth).slice(0, 2);
  ctx.letterSpacing = "0px";
  const titleSize = fitSingleLine(title, textWidth, 64, 34, 400, '"Libre Baskerville", Georgia, serif');
  ctx.font = `italic ${titleSize}px "Libre Baskerville", Georgia, serif`;
  const titleLines = wrapText(ctx, title, textWidth).slice(0, 3);
  const nameGap = 46;
  const blockH = authorLines.length * authorSize * 1.45 + nameGap + titleLines.length * titleSize * 1.3;
  const blackTop = whiteY + whiteH;
  let y = blackTop + (blackH - blockH) / 2 + authorSize * 0.35;

  ctx.font = `700 ${authorSize}px Arial, sans-serif`;
  ctx.letterSpacing = "0.28em";
  ctx.fillStyle = authorMissing ? "#8d5a3c" : orange;
  ctx.textBaseline = "middle";
  for (const line of authorLines) {
    ctx.fillText(line, W / 2, y);
    markText(line, W / 2, y, 10, 255);
    y += authorSize * 1.45;
  }
  ctx.letterSpacing = "0px";
  y += nameGap;
  ctx.font = `italic ${titleSize}px "Libre Baskerville", Georgia, serif`;
  ctx.fillStyle = titleMissing ? "#bdbdbd" : "#fff";
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    markText(line, W / 2, y, 8, 255);
    y += titleSize * 1.3;
  }
}

function drawCover() {
  const author = state.author.trim() || "Autor";
  const title = state.title.trim() || "Título del libro";
  const authorMissing = !state.author.trim();
  const titleMissing = !state.title.trim();
  if (state.edition === "penguin") {
    drawPenguinCover();
    return;
  }
  drawBackground();
  if (state.edition === "debolsillo") {
    drawDebolsillo();
    return;
  }

  const inverted = state.scheme === "black";
  const bandColor = inverted ? "#111111" : "#ffffff";
  const ink = inverted ? "#ffffff" : "#111111";
  const faint = inverted ? "#8e8e8e" : "#9a9a9a";

  const padX = 48;
  const logoSize = 50;
  const brandName = "Alianza";
  const brandSuffix = " editorial";
  ctx.font = `700 ${logoSize}px ${COVER_FONT}`;
  const brandNameWidth = ctx.measureText(brandName).width;
  ctx.font = `400 ${logoSize}px ${COVER_FONT}`;
  const brandSuffixWidth = ctx.measureText(brandSuffix).width;
  const brandWidth = brandNameWidth + brandSuffixWidth;

  const authorMaxWidth = W - padX * 2 - brandWidth - 48;
  const authorSize = fitSingleLine(author, authorMaxWidth, 168, 46, 700, AUTHOR_FONT);
  const authorBandH = Math.round(authorSize * 1.2);

  const titleMaxWidth = W - padX * 2;
  const titleSize = fitSingleLine(title, titleMaxWidth, 58, 34, 400);
  ctx.font = `400 ${titleSize}px ${COVER_FONT}`;
  const titleLines = wrapText(ctx, title, titleMaxWidth).slice(0, 3);
  const titleLineHeight = titleSize * 1.2;
  const titleBandH = Math.round(titleLines.length * titleLineHeight + titleSize * 0.62);

  const gap = 28;
  const edge = Math.round(H * 0.052);
  let authorBandY;
  let titleBandY;
  if (state.position === "bottom") {
    titleBandY = H - edge - titleBandH;
    authorBandY = titleBandY - gap - authorBandH;
  } else {
    authorBandY = edge;
    titleBandY = authorBandY + authorBandH + gap;
  }

  ctx.fillStyle = bandColor;
  ctx.fillRect(0, authorBandY, W, authorBandH);
  ctx.fillRect(0, titleBandY, W, titleBandH);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = authorMissing ? faint : ink;
  ctx.font = `700 ${authorSize}px ${AUTHOR_FONT}`;
  ctx.fillText(author, padX, authorBandY + authorBandH / 2);

  ctx.fillStyle = ink;
  let brandX = W - padX - brandWidth;
  ctx.font = `700 ${logoSize}px ${COVER_FONT}`;
  ctx.fillText(brandName, brandX, authorBandY + authorBandH / 2);
  brandX += brandNameWidth;
  ctx.font = `400 ${logoSize}px ${COVER_FONT}`;
  ctx.fillText(brandSuffix, brandX, authorBandY + authorBandH / 2);

  ctx.fillStyle = titleMissing ? faint : ink;
  ctx.font = `400 ${titleSize}px ${COVER_FONT}`;
  const titleBlockH = titleLines.length * titleLineHeight;
  let titleY = titleBandY + (titleBandH - titleBlockH) / 2 + titleLineHeight / 2;
  for (const line of titleLines) {
    ctx.fillText(line, padX, titleY);
    titleY += titleLineHeight;
  }
}

let viewer = null;

function syncBook() {
  if (!viewer) return;
  viewer.sync({ edition: state.edition, pages: state.pages });
}

function redraw() {
  drawCover();
  syncBook();
}

authorInput.addEventListener("input", () => {
  state.author = authorInput.value;
  redraw();
});

titleInput.addEventListener("input", () => {
  state.title = titleInput.value;
  redraw();
});

function bindChoice(id, key) {
  const group = document.querySelector(`#${id}`);
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state[key] = button.dataset.value;
    for (const item of group.querySelectorAll("button")) {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    }
    redraw();
  });
}

bindChoice("scheme", "scheme");

bindChoice("position", "position");
bindChoice("series", "series");

const caption = document.querySelector(".caption");
const alianzaOptions = document.querySelector("#alianza-options");
const debolsilloOptions = document.querySelector("#debolsillo-options");

function editionCaption() {
  const pages = `${state.pages} páginas`;
  if (state.edition === "debolsillo") return `Debolsillo · 125 × 190 mm · ${pages}`;
  if (state.edition === "penguin") return `Penguin Clásicos · 129 × 198 mm · ${pages}`;
  return `Alianza Editorial · 120 × 180 mm · ${pages}`;
}

function editionHint() {
  if (previewing) return "Drag the book to turn it.";
  if (state.edition === "debolsillo") {
    return "Drag the author and title together. Drag the rest of the photo to frame it.";
  }
  return "Drag the photo on the cover to frame it.";
}

document.querySelectorAll(".edition[data-edition]").forEach((button) => {
  button.addEventListener("click", () => {
    state.edition = button.dataset.edition;
    document.querySelectorAll(".edition[data-edition]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    alianzaOptions.hidden = state.edition !== "alianza";
    debolsilloOptions.hidden = state.edition !== "debolsillo";
    document.querySelector(".hint").textContent = editionHint();
    caption.textContent = editionCaption();
    fontNote.hidden = state.edition !== "alianza" || coverFontReady();
    redraw();
  });
});

document.querySelectorAll(".swatch-dots button").forEach((button) => {
  button.style.setProperty("--swatch", button.dataset.color);
});

document.querySelector(".swatches").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-color]");
  if (!button) return;
  const row = button.closest(".swatch-row");
  state[row.dataset.target] = button.dataset.color;
  row.querySelectorAll("button").forEach((item) => {
    item.classList.toggle("is-on", item === button);
  });
  redraw();
});

const photoName = document.querySelector("#photo-name");

function rememberImage(img, url) {
  if (state.imageUrl && state.imageUrl.startsWith("blob:")) URL.revokeObjectURL(state.imageUrl);
  state.image = img;
  state.imageUrl = url;
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  zoomInput.value = "1";
  zoomInput.disabled = false;
  canvas.classList.add("has-photo");
  redraw();
}

function loadCoverImage(url, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadCoverImage(url, false).then((img) => {
    rememberImage(img, url);
    photoName.textContent = file.name;
    photoName.title = file.name;
  });
});


zoomInput.addEventListener("input", () => {
  state.zoom = Number(zoomInput.value);
  redraw();
});

document.querySelector("#reset").addEventListener("click", () => {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  zoomInput.value = "1";
  redraw();
});

document.querySelector("#download").addEventListener("click", () => {
  const author = (state.author.trim() || "portada").toLocaleLowerCase("es");
  const title = (state.title.trim() || "alianza").toLocaleLowerCase("es");
  const slug = `${author}-${title}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${slug || "portada"}.png`;
  link.click();
});

let dragging = false;
let dragText = false;
let lastPoint = null;
let previewing = false;
const previewButton = document.querySelector("#preview");

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (W / rect.width),
    y: (event.clientY - rect.top) * (H / rect.height),
  };
}

function hitsText(point) {
  if (state.edition !== "debolsillo") return false;
  const pad = 24;
  return point.x >= textBounds.x - pad
    && point.x <= textBounds.x + textBounds.w + pad
    && point.y >= textBounds.y - pad
    && point.y <= textBounds.y + textBounds.h + pad;
}

function endDrag() {
  dragging = false;
  dragText = false;
  canvas.classList.remove("is-dragging", "is-moving");
}

canvas.addEventListener("pointerdown", (event) => {
  if (previewing) return;
  const point = canvasPoint(event);
  dragText = hitsText(point);
  if (!dragText && !state.image) return;
  dragging = true;
  canvas.classList.add(dragText ? "is-moving" : "is-dragging");
  canvas.setPointerCapture(event.pointerId);
  lastPoint = { x: event.clientX, y: event.clientY, textX: textPlace.x, textY: textPlace.y };
});

canvas.addEventListener("pointermove", (event) => {
  if (previewing) return;
  if (!dragging) {
    canvas.classList.toggle("is-moving", hitsText(canvasPoint(event)));
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (dragText) {
    const dx = (event.clientX - lastPoint.x) * (W / rect.width);
    const dy = (event.clientY - lastPoint.y) * (H / rect.height);
    textPlacedByUser = true;
    textPlace.x = clamp(lastPoint.textX + dx, TEXT_MARGIN, Math.max(TEXT_MARGIN, W - TEXT_MARGIN - textBounds.w));
    textPlace.y = clamp(lastPoint.textY + dy, TEXT_MARGIN, Math.max(TEXT_MARGIN, H - TEXT_MARGIN - textBounds.h));
  } else if (state.image) {
    const dx = (event.clientX - lastPoint.x) / rect.width;
    const dy = (event.clientY - lastPoint.y) / rect.height;
    const reach = 1.6 / state.zoom;
    state.panX = clamp(state.panX - dx * reach * 2, -1, 1);
    state.panY = clamp(state.panY - dy * reach * 2, -1, 1);
    lastPoint.x = event.clientX;
    lastPoint.y = event.clientY;
  }
  redraw();
});

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const editCoverButton = document.querySelector("#edit-cover");

function setPreview(on) {
  previewing = on;
  document.body.classList.toggle("is-preview", on);
  canvas.hidden = on;
  view.hidden = !on;
  editCoverButton.hidden = !on;
  previewButton.setAttribute("aria-pressed", String(on));
  document.querySelector(".hint").textContent = editionHint();
  if (!on) return;
  syncBook();
  requestAnimationFrame(() => viewer && viewer.fit());
}

previewButton.addEventListener("click", () => setPreview(true));
editCoverButton.addEventListener("click", () => setPreview(false));

function commitPages(force) {
  const value = Number(pagesInput.value);
  if (!Number.isFinite(value)) return;
  if (!force && (value < 32 || value > 1200)) return;
  state.pages = clamp(Math.round(value), 32, 1200);
  if (force) pagesInput.value = String(state.pages);
  caption.textContent = editionCaption();
  syncBook();
}

pagesInput.addEventListener("input", () => commitPages(false));
pagesInput.addEventListener("change", () => commitPages(true));

const fontNote = document.querySelector("#font-note");

function coverFontReady() {
  return document.fonts.check('400 16px "Alianza Cover"')
    && document.fonts.check('700 16px "Alianza Cover"');
}

async function loadAuthorFace() {
  const css = await (await fetch("https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@72,700&display=swap")).text();
  const style = document.createElement("style");
  style.textContent = css.replaceAll("font-family: 'Archivo'", "font-family: 'Archivo Author'");
  document.head.appendChild(style);
  await document.fonts.load('700 160px "Archivo Author"');
  await document.fonts.load('italic 72px "Libre Baskerville"');
  redraw();
}

document.fonts.ready.then(async () => {
  fontNote.hidden = state.edition !== "alianza" || coverFontReady();
  redraw();
});
loadAuthorFace();
document.querySelector(".hint").textContent = editionHint();
caption.textContent = editionCaption();
redraw();

mountBook({
  view,
  coverCanvas: canvas,
  roughCanvas,
  coatCanvas,
}).then((api) => {
  viewer = api;
  syncBook();
  if (previewing) viewer.resize();
}).catch((error) => {
  console.error(error);
  view.textContent = "No se pudo abrir la vista 3D.";
});
