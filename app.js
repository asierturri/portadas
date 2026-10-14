import { mountBook } from "./book.js?v=pages11";
import {
  drawTemplateBack,
  drawTemplateFront,
  drawTemplateSpine,
  loadEditionDefinitions,
} from "./edition-templates.js";

const DRAFT_DB = "portadas-editor";
const DRAFT_STORE = "drafts";
const DRAFT_KEY = "current";

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = window.indexedDB.open(DRAFT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DRAFT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPersistedDraft() {
  try {
    const db = await openDraftDb();
    const draft = await new Promise((resolve, reject) => {
      const request = db.transaction(DRAFT_STORE, "readonly").objectStore(DRAFT_STORE).get(DRAFT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return draft;
  } catch (error) {
    console.warn("Could not load the saved cover draft.", error);
    return null;
  }
}

const editionDefinitions = await loadEditionDefinitions();
const editionById = new Map(editionDefinitions.map((definition) => [definition.id, definition]));
const persistedDraft = await readPersistedDraft();
const defaultTemplateOptions = Object.fromEntries(editionDefinitions
  .filter((definition) => definition.kind === "template")
  .map((definition) => [definition.id, Object.fromEntries(
    (definition.front.controls || []).map((control) => [control.id, control.default])
  )]));

const canvas = document.querySelector("#cover");
const ctx = canvas.getContext("2d");
const surfacePreview = document.querySelector("#surface-preview");
const previewSwitcher = document.querySelector("#preview-switcher");
const authorInput = document.querySelector("#author");
const titleInput = document.querySelector("#title");
const photoInput = document.querySelector("#photo");
const zoomInput = document.querySelector("#zoom");
const panXInput = document.querySelector("#pan-x");
const panYInput = document.querySelector("#pan-y");
const pagesInput = document.querySelector("#pages");
const pagesSlider = document.querySelector("#pages-slider");
const backQuoteInput = document.querySelector("#back-quote");
const backCopyInput = document.querySelector("#back-copy");
const templateBackCopyInput = document.querySelector("#template-back-copy");
const view = document.querySelector("#book-view");

const W = 1600;
const H = 2400;

const state = {
  author: authorInput.value,
  title: titleInput.value,
  image: null,
  authorImage: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  position: "top",
  scheme: "white",
  edition: editionDefinitions[0]?.id || "alianza",
  series: "contemporanea",
  authorColor: "#111111",
  titleColor: "#e23b4a",
  pages: Number(pagesInput.value) || 320,
  backQuote: backQuoteInput.value,
  backCopy: backCopyInput.value,
  templateOptions: { ...(defaultTemplateOptions[editionDefinitions[0]?.id] || {}) },
  ...(persistedDraft?.settings || {}),
  image: null,
  authorImage: null,
  imageUrl: null,
  authorImageUrl: null,
  imageBlob: persistedDraft?.coverImage || null,
  authorImageBlob: persistedDraft?.authorImage || null,
  imageName: persistedDraft?.coverImageName || "",
  authorImageName: persistedDraft?.authorImageName || "",
};
if (!editionById.has(state.edition)) state.edition = editionDefinitions[0]?.id || "alianza";
state.pages = clamp(Math.round(Number(state.pages) || 320), 32, 1200);

function makeMapCanvas() {
  const map = document.createElement("canvas");
  map.width = W;
  map.height = H;
  return map;
}

const roughCanvas = makeMapCanvas();
const coatCanvas = makeMapCanvas();
const backCanvas = document.querySelector("#back-preview");
backCanvas.width = W;
backCanvas.height = H;
const spineCanvas = document.querySelector("#spine-preview");
spineCanvas.width = 512;
spineCanvas.height = H;
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
if (Number.isFinite(persistedDraft?.textPlace?.x)) textPlace.x = persistedDraft.textPlace.x;
if (Number.isFinite(persistedDraft?.textPlace?.y)) textPlace.y = persistedDraft.textPlace.y;
let textPlacedByUser = Boolean(persistedDraft?.textPlacedByUser);
let persistenceReady = false;
let persistTimer = null;

async function persistDraftNow() {
  const db = await openDraftDb().catch((error) => {
    console.warn("Could not save the cover draft.", error);
    return null;
  });
  if (!db) return;
  const draft = {
    settings: {
      author: state.author,
      title: state.title,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      position: state.position,
      scheme: state.scheme,
      edition: state.edition,
      series: state.series,
      authorColor: state.authorColor,
      titleColor: state.titleColor,
      pages: state.pages,
      backQuote: state.backQuote,
      backCopy: state.backCopy,
    },
    templateOptions: Object.fromEntries([...templateOptionStates].map(([id, values]) => [id, { ...values }])),
    textPlace: { x: textPlace.x, y: textPlace.y },
    textPlacedByUser,
    selectedSurface,
    coverImage: state.imageBlob || null,
    coverImageName: state.imageName || "",
    authorImage: state.authorImageBlob || null,
    authorImageName: state.authorImageName || "",
  };
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE, "readwrite");
      transaction.objectStore(DRAFT_STORE).put(draft, DRAFT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn("Could not save the cover draft.", error);
  } finally {
    db.close();
  }
}

function scheduleDraftSave() {
  if (!persistenceReady) return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistDraftNow, 250);
}

window.addEventListener("pagehide", () => {
  if (!persistenceReady) return;
  window.clearTimeout(persistTimer);
  persistDraftNow();
});

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

function drawPenguinBack() {
  const backCtx = backCanvas.getContext("2d");
  backCtx.clearRect(0, 0, W, H);
  backCtx.fillStyle = "#111211";
  backCtx.fillRect(0, 0, W, H);
  const pad = 118;
  const quote = state.backQuote.trim();
  const quoteSize = 48;
  backCtx.fillStyle = "#f15a22";
  backCtx.font = `italic ${quoteSize}px 'Libre Baskerville', Georgia, serif`;
  backCtx.textAlign = "center";
  backCtx.textBaseline = "top";
  let y = 140;
  for (const line of wrapText(backCtx, quote, W - pad * 2).slice(0, 5)) {
    backCtx.fillText(line, W / 2, y);
    y += quoteSize * 1.45;
  }

  y += 62;
  const copyParagraphs = state.backCopy.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  let fontSize = 40;
  const bottomLimit = H - 520;
  const lineHeight = () => fontSize * 1.32;
  function layoutCopy() {
    backCtx.font = `400 ${fontSize}px Arial, sans-serif`;
    return copyParagraphs.map((paragraph) => wrapText(backCtx, paragraph, W - pad * 2));
  }
  let blocks = layoutCopy();
  while (fontSize > 28) {
    const lineCount = blocks.reduce((sum, lines) => sum + lines.length, 0);
    if (y + lineCount * lineHeight() + copyParagraphs.length * 24 <= bottomLimit) break;
    fontSize -= 1;
    blocks = layoutCopy();
  }
  backCtx.fillStyle = "#f0efec";
  backCtx.font = `400 ${fontSize}px Arial, sans-serif`;
  backCtx.textAlign = "left";
  for (const lines of blocks) {
    for (const line of lines) {
      if (y + lineHeight() > bottomLimit) break;
      backCtx.fillText(line, pad, y);
      y += lineHeight();
    }
    y += 26;
  }

  const bandY = H - 398;
  backCtx.fillStyle = "#f1eee5";
  backCtx.fillRect(0, bandY, W, 120);
  backCtx.fillStyle = "#111";
  backCtx.textBaseline = "middle";
  backCtx.textAlign = "center";
  backCtx.font = "500 30px Arial, sans-serif";
  backCtx.letterSpacing = "0.55em";
  backCtx.fillText("P E N G U I N", W * 0.32, bandY + 60);
  backCtx.fillText("C L A S S I C S", W * 0.72, bandY + 60);
  if (penguinLogo.complete && penguinLogo.naturalWidth) {
    const logoH = 78;
    const logoW = logoH * penguinLogo.naturalWidth / penguinLogo.naturalHeight;
    backCtx.drawImage(penguinLogo, W / 2 - logoW / 2, bandY + 60 - logoH / 2, logoW, logoH);
  }
  backCtx.letterSpacing = "0px";
  backCtx.fillStyle = "#e9e6df";
  backCtx.font = "italic 44px 'Libre Baskerville', Georgia, serif";
  backCtx.fillText("www.penguinclassics.com", W / 2, H - 182);
}

function drawPenguinSpine() {
  const spineDepthMm = Math.max(10, state.pages * 0.09) + 0.35 * 2 + 0.02 * 2;
  spineCanvas.width = Math.round(H * spineDepthMm / 198);
  const spineCtx = spineCanvas.getContext("2d");
  spineCtx.fillStyle = "#111211";
  spineCtx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);
  spineCtx.save();
  spineCtx.translate(spineCanvas.width / 2, 0);
  spineCtx.rotate(-Math.PI / 2);
  spineCtx.textAlign = "center";
  spineCtx.textBaseline = "middle";
  spineCtx.fillStyle = "#f15a22";
  let authorSize = 72;
  const author = (state.author.trim() || "AUTOR").toLocaleUpperCase("es");
  while (authorSize > 36) {
    spineCtx.font = `700 ${authorSize}px Arial, sans-serif`;
    if (spineCtx.measureText(author).width <= H * 0.22) break;
    authorSize -= 2;
  }
  spineCtx.font = `700 ${authorSize}px Arial, sans-serif`;
  spineCtx.letterSpacing = "0.12em";
  spineCtx.fillText(author, -H * 0.14, 0);
  spineCtx.fillStyle = "#eee8db";
  let titleSize = 58;
  const title = state.title.trim() || "Título del libro";
  const titleWidth = H * 0.38;
  while (titleSize > 34) {
    spineCtx.font = `italic ${titleSize}px 'Libre Baskerville', Georgia, serif`;
    if (spineCtx.measureText(title).width <= titleWidth) break;
    titleSize -= 2;
  }
  spineCtx.font = `italic ${titleSize}px 'Libre Baskerville', Georgia, serif`;
  spineCtx.letterSpacing = "0px";
  const titleLines = wrapText(spineCtx, title, titleWidth).slice(0, 3);
  titleLines.forEach((line, index) => spineCtx.fillText(line, -(H * 0.35 + index * 160), 0));
  spineCtx.restore();

  const whiteH = 118;
  const blackH = Math.round(H * 0.24);
  const bandY = H - whiteH - blackH;
  spineCtx.fillStyle = "#f1eee5";
  spineCtx.fillRect(0, bandY, spineCanvas.width, whiteH);
  if (penguinLogo.complete && penguinLogo.naturalWidth) {
    spineCtx.save();
    spineCtx.translate(spineCanvas.width / 2, bandY + whiteH / 2);
    const h = whiteH * 0.82;
    const w = h * penguinLogo.naturalWidth / penguinLogo.naturalHeight;
    spineCtx.drawImage(penguinLogo, -w / 2, -h / 2, w, h);
    spineCtx.restore();
  }
  spineCtx.save();
  spineCtx.translate(spineCanvas.width / 2, bandY + whiteH + (H - bandY - whiteH) / 2);
  spineCtx.rotate(-Math.PI / 2);
  spineCtx.fillStyle = "#f4f0e7";
  spineCtx.textAlign = "center";
  spineCtx.textBaseline = "middle";
  spineCtx.font = "600 40px Arial, sans-serif";
  spineCtx.letterSpacing = "0.18em";
  spineCtx.fillText("PENGUIN CLASSICS", 0, 0);
  spineCtx.restore();
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
  const definition = editionById.get(state.edition);
  const template = definition?.kind === "template" ? definition : null;
  const dimensions = template
    ? {
        widthMm: template.heightMm * template.assets.front.width / template.assets.front.height,
        heightMm: template.heightMm,
        mmPerPage: template.pages.mmPerPage,
        minSpineMm: template.pages.minSpineMm,
      }
    : null;
  viewer.sync({ edition: state.edition, pages: state.pages, template: Boolean(template), dimensions });
}

function redraw() {
  const definition = editionById.get(state.edition);
  if (definition?.kind === "template") {
    const width = canvas.width;
    const height = canvas.height;
    const layout = drawTemplateFront(ctx, {
      template: definition,
      image: state.image,
      state,
      options: state.templateOptions,
      width,
      height,
      wrapText,
    });
    drawTemplateBack(backCanvas.getContext("2d"), definition, width, height, {
      layout,
      image: state.image,
      state,
      copy: state.backCopy,
      authorImage: state.authorImage,
      wrapText,
    });
    const spineDepthMm = Math.max(definition.pages.minSpineMm, state.pages * definition.pages.mmPerPage) + 0.74;
    drawTemplateSpine(spineCanvas.getContext("2d"), {
      template: definition,
      state,
      width,
      height,
      spineWidth: height * spineDepthMm / definition.heightMm,
      wrapText,
    });
  } else {
    drawCover();
    if (state.edition === "penguin") {
      drawPenguinBack();
      drawPenguinSpine();
    } else {
      const backCtx = backCanvas.getContext("2d");
      backCtx.fillStyle = "#f7f4ee";
      backCtx.fillRect(0, 0, backCanvas.width, backCanvas.height);
      spineCanvas.width = Math.round(H * (Math.max(10, state.pages * 0.09) + 0.74) / 190);
      const spineCtx = spineCanvas.getContext("2d");
      spineCtx.fillStyle = "#f7f4ee";
      spineCtx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);
    }
  }
  syncBook();
  scheduleDraftSave();
}

authorInput.addEventListener("input", () => {
  state.author = authorInput.value;
  redraw();
});

titleInput.addEventListener("input", () => {
  state.title = titleInput.value;
  redraw();
});

backQuoteInput.addEventListener("input", () => {
  state.backQuote = backQuoteInput.value;
  redraw();
});

backCopyInput.addEventListener("input", () => {
  state.backCopy = backCopyInput.value;
  templateBackCopyInput.value = state.backCopy;
  redraw();
});

templateBackCopyInput.addEventListener("input", () => {
  state.backCopy = templateBackCopyInput.value;
  backCopyInput.value = state.backCopy;
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

bindChoice("series", "series");
document.querySelectorAll("#series button").forEach((button) => {
  const active = button.dataset.value === state.series;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
});

const caption = document.querySelector(".caption");
const debolsilloOptions = document.querySelector("#debolsillo-options");
const templateOptions = document.querySelector("#template-options");
const templateBackOptions = document.querySelector("#template-back-options");
const authorPhotoField = document.querySelector("#author-photo-field");
const authorPhotoInput = document.querySelector("#author-photo");
const authorPhotoName = document.querySelector("#author-photo-name");
const templateOptionStates = new Map(Object.entries(defaultTemplateOptions));
for (const [id, savedOptions] of Object.entries(persistedDraft?.templateOptions || {})) {
  if (templateOptionStates.has(id) && savedOptions && typeof savedOptions === "object") {
    templateOptionStates.set(id, { ...templateOptionStates.get(id), ...savedOptions });
  }
}
state.templateOptions = templateOptionStates.get(state.edition) || state.templateOptions;

authorInput.value = state.author;
titleInput.value = state.title;
pagesInput.value = String(state.pages);
pagesSlider.value = String(state.pages);
backQuoteInput.value = state.backQuote;
backCopyInput.value = state.backCopy;
templateBackCopyInput.value = state.backCopy;
zoomInput.value = String(state.zoom);
panXInput.value = String(state.panX * 100);
panYInput.value = String(state.panY * 100);
zoomInput.disabled = !state.imageBlob;
panXInput.disabled = !state.imageBlob;
panYInput.disabled = !state.imageBlob;

function setCanvasForEdition(definition) {
  const isTemplate = definition?.kind === "template";
  const width = W;
  const height = isTemplate
    ? Math.round(width * definition.assets.front.height / definition.assets.front.width)
    : H;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  if (backCanvas.width !== width) backCanvas.width = width;
  if (backCanvas.height !== height) backCanvas.height = height;
  if (spineCanvas.height !== height) spineCanvas.height = height;
}

function renderTemplateOptions(definition) {
  templateOptions.replaceChildren();
  const controls = definition?.kind === "template" ? (definition.front.controls || []) : [];
  templateOptions.hidden = controls.length === 0;
  if (!controls.length) return;
  const values = templateOptionStates.get(definition.id);

  for (const control of controls) {
    if (control.type === "choice") {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "choice";
      const legend = document.createElement("legend");
      legend.textContent = control.label;
      const row = document.createElement("div");
      row.className = "choice-row";
      row.dataset.control = control.id;
      for (const option of control.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.value = option.value;
        button.textContent = option.label;
        button.classList.toggle("is-active", values[control.id] === option.value);
        button.setAttribute("aria-pressed", String(values[control.id] === option.value));
        row.append(button);
      }
      fieldset.append(legend, row);
      templateOptions.append(fieldset);
      continue;
    }

    if (control.type === "range") {
      const label = document.createElement("label");
      label.append(document.createTextNode(control.label));
      const input = document.createElement("input");
      input.type = "range";
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.value = values[control.id];
      input.dataset.control = control.id;
      const output = document.createElement("output");
      output.className = "range-output";
      output.dataset.output = control.id;
      output.textContent = control.format === "percent"
        ? `${Math.round(Number(input.value) * 100)}%`
        : input.value;
      label.append(input, output);
      templateOptions.append(label);
    }
  }
}

function syncTemplateOption(controlId, value) {
  const definition = editionById.get(state.edition);
  if (definition?.kind !== "template") return;
  const values = templateOptionStates.get(definition.id);
  values[controlId] = value;
  state.templateOptions = values;
  const control = definition.front.controls.find((item) => item.id === controlId);
  if (control?.type === "range") {
    const output = templateOptions.querySelector(`[data-output="${controlId}"]`);
    if (output) output.textContent = control.format === "percent"
      ? `${Math.round(Number(value) * 100)}%`
      : value;
  }
  templateOptions.querySelectorAll(`[data-control="${controlId}"] button`).forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  redraw();
}

templateOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-value]");
  if (button) {
    const controlId = button.closest(".choice-row").dataset.control;
    if (controlId === "bandPosition") {
      const values = templateOptionStates.get(state.edition);
      values.bandY = button.dataset.value === "top" ? 0.052 : 0.95;
      renderTemplateOptions(editionById.get(state.edition));
    }
    syncTemplateOption(controlId, button.dataset.value);
  }
});
templateOptions.addEventListener("input", (event) => {
  const input = event.target.closest("input[type=range][data-control]");
  if (input) syncTemplateOption(input.dataset.control, Number(input.value));
});

function editionCaption() {
  const pages = `${state.pages} páginas`;
  const definition = editionById.get(state.edition);
  if (definition?.kind === "template") {
    const height = definition.heightMm;
    const width = height * definition.assets.front.width / definition.assets.front.height;
    return `${definition.name.replace(/ \[[^\]]+\]$/, "")} · ${width.toFixed(0)} × ${height} mm · ${pages}`;
  }
  if (state.edition === "debolsillo") return `Debolsillo · 125 × 190 mm · ${pages}`;
  if (state.edition === "penguin") return `Penguin Clásicos · 129 × 198 mm · ${pages}`;
  return `Alianza Editorial · 120 × 180 mm · ${pages}`;
}

function editionHint() {
  if (previewing) return "Drag the book to turn it.";
  if (state.edition === "debolsillo") {
    return "Use the position sliders to frame the photo. Drag the author and title to reposition them.";
  }
  return "Use the position sliders to frame the cover image.";
}

const editionButtons = document.querySelector(".editions");
for (const definition of editionDefinitions) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edition";
  button.classList.toggle("is-active", definition.id === state.edition);
  button.dataset.edition = definition.id;
  button.textContent = definition.name;
  button.setAttribute("aria-pressed", String(definition.id === state.edition));
  editionButtons.append(button);
}

document.querySelectorAll(".edition[data-edition]").forEach((button) => {
  button.addEventListener("click", () => {
    state.edition = button.dataset.edition;
    const definition = editionById.get(state.edition);
    setCanvasForEdition(definition);
    if (definition?.kind === "template") {
      state.templateOptions = templateOptionStates.get(definition.id);
    }
    document.querySelectorAll(".edition[data-edition]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderTemplateOptions(definition);
    const hasBackCopy = definition?.kind === "template" && Boolean(definition.back?.copy);
    templateBackOptions.hidden = !hasBackCopy;
    authorPhotoField.hidden = !definition?.back?.authorPhoto;
    templateBackCopyInput.value = state.backCopy;
    debolsilloOptions.hidden = state.edition !== "debolsillo";
    document.querySelector("#penguin-options").hidden = state.edition !== "penguin";
    document.querySelector(".hint").textContent = editionHint();
    caption.textContent = editionCaption();
    fontNote.hidden = state.edition !== "alianza" || coverFontReady();
    redraw();
  });
});

renderTemplateOptions(editionById.get(state.edition));
setCanvasForEdition(editionById.get(state.edition));
templateBackOptions.hidden = !editionById.get(state.edition)?.back?.copy;
authorPhotoField.hidden = !editionById.get(state.edition)?.back?.authorPhoto;
debolsilloOptions.hidden = state.edition !== "debolsillo";
document.querySelector("#penguin-options").hidden = state.edition !== "penguin";
templateBackCopyInput.value = state.backCopy;

document.querySelectorAll(".swatch-dots button").forEach((button) => {
  button.style.setProperty("--swatch", button.dataset.color);
  const row = button.closest(".swatch-row");
  button.classList.toggle("is-on", button.dataset.color === state[row.dataset.target]);
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

function rememberImage(img, url, blob, name) {
  if (state.imageUrl && state.imageUrl.startsWith("blob:")) URL.revokeObjectURL(state.imageUrl);
  state.image = img;
  state.imageUrl = url;
  state.imageBlob = blob;
  state.imageName = name || "";
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  zoomInput.value = "1";
  zoomInput.disabled = false;
  panXInput.value = "0";
  panYInput.value = "0";
  panXInput.disabled = false;
  panYInput.disabled = false;
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
    rememberImage(img, url, file, file.name);
    photoName.textContent = file.name;
    photoName.title = file.name;
  }).catch(() => URL.revokeObjectURL(url));
});

authorPhotoInput.addEventListener("change", () => {
  const file = authorPhotoInput.files && authorPhotoInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadCoverImage(url, false).then((img) => {
    if (state.authorImageUrl?.startsWith("blob:")) URL.revokeObjectURL(state.authorImageUrl);
    state.authorImage = img;
    state.authorImageUrl = url;
    state.authorImageBlob = file;
    state.authorImageName = file.name;
    authorPhotoName.textContent = file.name;
    authorPhotoName.title = file.name;
    redraw();
  }).catch(() => URL.revokeObjectURL(url));
});

async function restoreSavedImages() {
  if (state.imageBlob) {
    const url = URL.createObjectURL(state.imageBlob);
    try {
      state.image = await loadCoverImage(url, false);
      state.imageUrl = url;
      canvas.classList.add("has-photo");
      photoName.textContent = state.imageName;
      photoName.title = state.imageName;
    } catch {
      URL.revokeObjectURL(url);
      state.imageBlob = null;
      state.imageName = "";
    }
  }
  if (state.authorImageBlob) {
    const url = URL.createObjectURL(state.authorImageBlob);
    try {
      state.authorImage = await loadCoverImage(url, false);
      state.authorImageUrl = url;
      authorPhotoName.textContent = state.authorImageName;
      authorPhotoName.title = state.authorImageName;
    } catch {
      URL.revokeObjectURL(url);
      state.authorImageBlob = null;
      state.authorImageName = "";
    }
  }
}


zoomInput.addEventListener("input", () => {
  state.zoom = Number(zoomInput.value);
  redraw();
});

panXInput.addEventListener("input", () => {
  state.panX = Number(panXInput.value) / 100;
  redraw();
});

panYInput.addEventListener("input", () => {
  state.panY = Number(panYInput.value) / 100;
  redraw();
});

document.querySelector("#reset").addEventListener("click", () => {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  zoomInput.value = "1";
  panXInput.value = "0";
  panYInput.value = "0";
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
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
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
  canvas.classList.remove("is-moving");
}

canvas.addEventListener("pointerdown", (event) => {
  if (previewing) return;
  const point = canvasPoint(event);
  dragText = hitsText(point);
  if (!dragText) return;
  dragging = true;
  canvas.classList.add("is-moving");
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
    const dx = (event.clientX - lastPoint.x) * (canvas.width / rect.width);
    const dy = (event.clientY - lastPoint.y) * (canvas.height / rect.height);
    textPlacedByUser = true;
    textPlace.x = clamp(lastPoint.textX + dx, TEXT_MARGIN, Math.max(TEXT_MARGIN, W - TEXT_MARGIN - textBounds.w));
    textPlace.y = clamp(lastPoint.textY + dy, TEXT_MARGIN, Math.max(TEXT_MARGIN, H - TEXT_MARGIN - textBounds.h));
  }
  redraw();
});

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

const editCoverButton = document.querySelector("#edit-cover");
let selectedSurface = ["front", "spine", "back"].includes(persistedDraft?.selectedSurface)
  ? persistedDraft.selectedSurface
  : "front";

function selectSurface(surface) {
  selectedSurface = surface;
  for (const item of [canvas, spineCanvas, backCanvas]) {
    item.hidden = item.id !== ({ front: "cover", spine: "spine-preview", back: "back-preview" }[surface]);
  }
  previewSwitcher.querySelectorAll("button[data-surface]").forEach((button) => {
    const active = button.dataset.surface === surface;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  scheduleDraftSave();
}

previewSwitcher.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-surface]");
  if (button) selectSurface(button.dataset.surface);
});

function setPreview(on) {
  previewing = on;
  document.body.classList.toggle("is-preview", on);
  surfacePreview.hidden = on;
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
  pagesInput.value = String(state.pages);
  pagesSlider.value = String(state.pages);
  caption.textContent = editionCaption();
  redraw();
}

pagesInput.addEventListener("input", () => commitPages(false));
pagesInput.addEventListener("change", () => commitPages(true));
pagesSlider.addEventListener("input", () => {
  pagesInput.value = pagesSlider.value;
  commitPages(false);
});

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
await restoreSavedImages();
selectSurface(selectedSurface);
persistenceReady = true;
redraw();

mountBook({
  view,
  coverCanvas: canvas,
  roughCanvas,
  coatCanvas,
  backCanvas,
  spineCanvas,
}).then((api) => {
  viewer = api;
  syncBook();
  if (previewing) viewer.resize();
}).catch((error) => {
  console.error(error);
  view.textContent = "No se pudo abrir la vista 3D.";
});
