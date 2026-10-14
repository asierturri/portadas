async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar la imagen de plantilla: ${url}`));
    image.src = url;
  });
}

export async function loadEditionDefinitions() {
  const manifestResponse = await fetch("editions/manifest.json");
  if (!manifestResponse.ok) throw new Error("No se pudo cargar editions/manifest.json");
  const manifest = await manifestResponse.json();
  const definitions = await Promise.all(manifest.map(async (entry) => {
    if (entry.kind !== "template") return entry;
    const response = await fetch(entry.config);
    if (!response.ok) throw new Error(`No se pudo cargar ${entry.config}`);
    const config = await response.json();
    const baseUrl = new URL(".", new URL(entry.config, window.location.href));
    const assets = Object.fromEntries(await Promise.all(
      Object.entries(config.assets || {}).map(async ([key, filename]) => [
        key,
        await loadImage(new URL(filename, baseUrl).href),
      ])
    ));
    return { ...entry, ...config, assets };
  }));
  return definitions;
}

export function drawTemplateBack(context, template, width, height, options = {}) {
  const { layout, image, state, copy = "", authorImage, wrapText } = options;
  const config = template.back || {};
  context.clearRect(0, 0, width, height);
  context.fillStyle = config.background || "#ffffff";
  context.fillRect(0, 0, width, height);
  if (template.assets.back) context.drawImage(template.assets.back, 0, 0, width, height);

  const backBands = config.bands || {};
  if (layout && backBands.width > 0) {
    for (const band of [layout.authorBand, layout.titleBand]) {
      drawCoverImageRect(context, image, state, width, height, {
        x: width * (backBands.x || 0),
        y: band.y,
        width: width * backBands.width,
        height: band.height,
      }, config.background || "#ffffff");
    }
  }

  const portrait = config.authorPhoto;
  let descriptionY = height * (config.copy?.y || 0.24);
  if (portrait && authorImage) {
    const side = Math.min(width * portrait.size, height * portrait.maxHeight);
    const x = width * portrait.x;
    const y = layout?.authorBand?.y ?? height * portrait.y;
    drawSquarePortrait(context, authorImage, x, y, side);
    descriptionY = y + side + height * (config.copy?.gapAfterPhoto || 0.018);
  }
  drawTemplateBackCopy(context, copy, width, height, config.copy, descriptionY, wrapText);
}

function imageSourceRect(image, frameW, frameH, state = {}) {
  const frameRatio = frameW / frameH;
  const imageRatio = image.width / image.height;
  let sw;
  let sh;
  if (imageRatio > frameRatio) {
    sh = image.height;
    sw = sh * frameRatio;
  } else {
    sw = image.width;
    sh = sw / frameRatio;
  }
  sw /= state.zoom || 1;
  sh /= state.zoom || 1;
  return {
    sx: (image.width - sw) / 2 + (state.panX || 0) * (image.width - sw) / 2,
    sy: (image.height - sh) / 2 + (state.panY || 0) * (image.height - sh) / 2,
    sw,
    sh,
  };
}

function drawCoverImageRect(context, image, state, frameW, frameH, rect, fallbackColor) {
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  if (image) {
    const source = imageSourceRect(image, frameW, frameH, state);
    const sx = source.sx + source.sw * rect.x / frameW;
    const sy = source.sy + source.sh * rect.y / frameH;
    const sw = source.sw * rect.width / frameW;
    const sh = source.sh * rect.height / frameH;
    context.drawImage(image, sx, sy, sw, sh, rect.x, rect.y, rect.width, rect.height);
  } else {
    context.fillStyle = fallbackColor;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  context.restore();
}

function drawSquarePortrait(context, image, x, y, side) {
  const sourceSide = Math.min(image.width, image.height);
  const sx = (image.width - sourceSide) / 2;
  const sy = (image.height - sourceSide) / 2;
  context.save();
  context.filter = "grayscale(100%)";
  context.drawImage(image, sx, sy, sourceSide, sourceSide, x, y, side, side);
  context.restore();
}

function drawTemplateBackCopy(context, copy, width, height, config = {}, startY, wrapText) {
  if (!copy || !wrapText) return;
  const x = width * (config.x ?? 0.36);
  const textWidth = width * (config.width ?? 0.58);
  const bottom = height * (config.bottom ?? 0.82);
  const gap = config.paragraphGap ?? 12;
  let size = config.fontSize ?? 40;
  let paragraphs = [];
  let lineHeight = 0;
  const makeLayout = () => {
    context.font = `${config.fontWeight || 400} ${size}px ${config.font || "Arial, sans-serif"}`;
    lineHeight = size * (config.lineHeight || 1.2);
    paragraphs = String(copy).split(/\n\s*\n/).map((paragraph) => wrapText(context, paragraph.trim(), textWidth));
    return paragraphs.reduce((total, lines) => total + lines.length * lineHeight, 0) + Math.max(0, paragraphs.length - 1) * gap;
  };
  const available = Math.max(0, bottom - startY);
  while (size > (config.minFontSize ?? 24) && makeLayout() > available) size -= 1;
  makeLayout();
  context.fillStyle = config.color || "#505050";
  context.textAlign = "left";
  context.textBaseline = "top";
  let y = startY;
  for (const lines of paragraphs) {
    for (const line of lines) {
      if (y + lineHeight > bottom) return;
      context.fillText(line, x, y, textWidth);
      y += lineHeight;
    }
    y += gap;
  }
}

function fontFor(spec, size) {
  if (spec.font.includes("{size}")) return spec.font.replaceAll("{size}", size);
  return `${spec.weight || 400} ${size}px ${spec.font}`;
}

function fitText(context, text, maxWidth, spec) {
  let size = spec.fontSize;
  while (size > spec.minFontSize) {
    context.font = fontFor(spec, size);
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  context.font = fontFor(spec, size);
  return size;
}

export function drawTemplateFront(context, { template, image, state, options, width, height, wrapText }) {
  context.clearRect(0, 0, width, height);
  context.letterSpacing = "0px";
  context.fontStretch = "normal";
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.textAlign = "left";
  context.textBaseline = "top";
  if (image) {
    const source = imageSourceRect(image, width, height, state);
    context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);
  } else {
    context.fillStyle = "#ddd9d1";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#5c5750";
    context.font = "400 36px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Añade una foto", width / 2, height * 0.72);
  }

  const config = template.front;
  const bandStyle = config.bandColors[options.bandColor] || config.bandColors.white;
  const author = state.author.trim() || "Autor";
  const title = state.title.trim() || "Título del libro";
  const brand = config.authorBand.brand;
  const authorPadding = config.authorBand.paddingX || 48;
  let brandWidth = 0;
  if (brand) {
    context.font = `700 ${brand.fontSize}px ${brand.font}`;
    brandWidth += context.measureText(brand.name).width;
    context.font = `400 ${brand.fontSize}px ${brand.font}`;
    brandWidth += context.measureText(brand.suffix).width + (brand.gap || 0);
    brandWidth += brand.rightPadding;
  }
  const authorBandWidth = Math.round(width * (config.authorBand.width || 1));
  const authorX = (width - authorBandWidth) / 2;
  const authorTextWidth = Math.max(1, authorBandWidth - authorPadding * 2 - brandWidth);
  const authorHeightControl = config.controls?.find((control) => control.id === config.authorBand.heightControl);
  const authorBandHeight = Math.round(height * clamp(
    options.authorBandHeight,
    authorHeightControl?.min ?? 0.08,
    authorHeightControl?.max ?? 0.18,
  ));
  const baseAuthorSize = config.authorBand.fontSize;
  let authorSize = baseAuthorSize;
  let authorWasShrunk = false;
  let authorLines = [];
  let authorLineHeight = 0;
  let authorBlockHeight = 0;
  while (true) {
    context.font = fontFor(config.authorBand, authorSize);
    authorLines = wrapText(context, author, authorTextWidth).slice(0, config.authorBand.maxLines || 2);
    authorLineHeight = authorSize * 1.2;
    authorBlockHeight = authorLines.length * authorLineHeight;
    if (authorSize <= config.authorBand.minFontSize || authorBlockHeight + config.authorBand.paddingY * 2 <= authorBandHeight) break;
    authorSize -= 2;
    authorWasShrunk = true;
  }

  const titleMaxWidth = width - config.titleBand.paddingX * 2;
  const titleSize = fitText(context, title, titleMaxWidth, config.titleBand);
  const titleLines = wrapText(context, title, titleMaxWidth).slice(0, config.titleBand.maxLines);
  const titleLineHeight = titleSize * config.titleBand.lineHeight;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleBandHeight = Math.ceil(titleBlockHeight + config.titleBand.paddingY * 2);
  const gap = Math.round(height * config.layout.gap);
  const top = options.bandPosition === "top";
  const requestedY = height * clamp(options.bandY, 0.03, 0.95);
  let authorY;
  let titleY;
  if (top) {
    const stackHeight = authorBandHeight + gap + titleBandHeight;
    authorY = clamp(requestedY, height * config.layout.topMargin, height * (1 - config.layout.bottomMargin) - stackHeight);
    titleY = authorY + authorBandHeight + gap;
  } else {
    const stackHeight = authorBandHeight + gap + titleBandHeight;
    const bottom = clamp(requestedY, height * config.layout.topMargin + stackHeight, height * (1 - config.layout.bottomMargin));
    titleY = bottom - titleBandHeight;
    authorY = titleY - gap - authorBandHeight;
  }

  context.fillStyle = bandStyle.fill;
  context.fillRect(authorX, authorY, authorBandWidth, authorBandHeight);
  context.fillRect(0, titleY, width, titleBandHeight);
  context.fillStyle = bandStyle.ink;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = fontFor(config.authorBand, authorSize);
  const authorTextTop = authorWasShrunk
    ? (authorBandHeight - authorBlockHeight) / 2
    : config.authorBand.paddingY;
  const authorCenterY = authorY + authorTextTop + authorBlockHeight / 2;
  authorLines.forEach((line, index) => {
    const lineCenterY = authorCenterY + (index - (authorLines.length - 1) / 2) * authorLineHeight;
    context.fillText(line, authorX + authorPadding, lineCenterY);
  });

  if (brand) {
    let brandFontSize = brand.fontSize;
    context.font = `700 ${brandFontSize}px ${brand.font}`;
    const nameWidth = context.measureText(brand.name).width;
    context.font = `400 ${brandFontSize}px ${brand.font}`;
    const suffixWidth = context.measureText(brand.suffix).width;
    const brandWidth = nameWidth + suffixWidth + (brand.gap || 0);
    const brandX = authorX + authorBandWidth - brand.rightPadding - brandWidth;
    const brandTextY = authorCenterY;
    context.textBaseline = "middle";
    context.font = `700 ${brandFontSize}px ${brand.font}`;
    context.fillText(brand.name, brandX, brandTextY);
    context.font = `400 ${brandFontSize}px ${brand.font}`;
    context.fillText(brand.suffix, brandX + nameWidth, brandTextY);
  }

  context.font = fontFor(config.titleBand, titleSize);
  context.textBaseline = "middle";
  let titleLineY = titleY + (titleBandHeight - titleBlockHeight) / 2 + titleLineHeight / 2;
  for (const line of titleLines) {
    context.fillText(line, config.titleBand.paddingX, titleLineY);
    titleLineY += titleLineHeight;
  }

  if (template.assets.front) context.drawImage(template.assets.front, 0, 0, width, height);
  return {
    authorBand: { x: authorX, y: authorY, width: authorBandWidth, height: authorBandHeight },
    titleBand: { x: 0, y: titleY, width, height: titleBandHeight },
  };
}

export function drawTemplateSpine(context, { template, state, width, height, spineWidth, wrapText }) {
  const source = template.assets.spine;
  const targetWidth = Math.max(1, Math.round(spineWidth));
  context.canvas.width = targetWidth;
  context.canvas.height = height;
  context.clearRect(0, 0, targetWidth, height);
  if (!source) return;

  const scale = height / source.height;
  const leftEnd = Math.round(source.width * template.spine.slices.leftEnd);
  const rightStart = Math.round(source.width * template.spine.slices.rightStart);
  const centerWidth = (rightStart - leftEnd) * scale;
  const sideWidth = Math.max(0, (targetWidth - centerWidth) / 2);
  context.drawImage(source, 0, 0, leftEnd, source.height, 0, 0, sideWidth, height);
  context.drawImage(source, leftEnd, 0, rightStart - leftEnd, source.height, sideWidth, 0, Math.min(centerWidth, targetWidth), height);
  context.drawImage(source, rightStart, 0, source.width - rightStart, source.height, sideWidth + centerWidth, 0, sideWidth, height);

  const portraitConfig = template.spine.authorPhoto;
  if (portraitConfig && state.authorImage) {
    const portraitSide = targetWidth;
    drawSquarePortrait(context, state.authorImage, 0, height * (portraitConfig.y || 0), portraitSide);
  }

  for (const item of template.spine.text || []) {
    const value = String(state[item.field] || "").trim();
    if (!value) continue;
    const maxLength = height * item.maxLength;
    let fontSize = Math.min(item.fontSize, targetWidth * 0.48);
    const lines = [];
    do {
      context.font = fontFor(item, fontSize);
      lines.splice(0, lines.length, ...wrapText(context, value, maxLength).slice(0, item.maxLines || 1));
      if (lines.every((line) => context.measureText(line).width <= maxLength) || fontSize <= item.minFontSize) break;
      fontSize -= 2;
    } while (fontSize > item.minFontSize);
    context.font = fontFor(item, fontSize);
    context.fillStyle = item.color;
    const growsUp = item.growDirection === "up";
    context.textAlign = growsUp ? "left" : "center";
    context.textBaseline = "middle";
    const lineGap = fontSize * 1.15;
    let centerY = height * item.centerY;
    if (item.afterPortrait) {
      const startY = portraitConfig && state.authorImage
        ? height * (portraitConfig.y || 0) + targetWidth + (item.gap || 10)
        : item.gap || 10;
      const firstLineOffset = Math.min(...lines.map((line, index) =>
        (index - (lines.length - 1) / 2) * lineGap - context.measureText(line).width / 2
      ));
      centerY = startY - firstLineOffset;
    }
    lines.forEach((line, index) => {
      context.save();
      if (growsUp) {
        const crossOffset = (index - (lines.length - 1) / 2) * lineGap;
        context.translate(targetWidth / 2 + crossOffset, centerY);
      } else {
        context.translate(targetWidth / 2, centerY + (index - (lines.length - 1) / 2) * lineGap);
      }
      context.rotate(-Math.PI / 2);
      context.fillText(line, 0, 0, maxLength);
      context.restore();
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
