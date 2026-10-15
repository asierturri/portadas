const MM = 0.012;
const EDITION_MM = {
  alianza: { w: 120, h: 180 },
  debolsillo: { w: 125, h: 190 },
  penguin: { w: 129, h: 198 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function paperMaps(THREE, { laid }) {
  const n = 256;
  const height = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const grain = Math.random();
      const fiber = 0.5 + 0.5 * Math.sin(x * 1.7 + y * 0.35);
      const ribs = laid ? 0.5 + 0.5 * Math.sin(y * 3.1 + grain * 0.6) : 0.5;
      height[y * n + x] = grain * 0.62 + fiber * 0.22 + ribs * (laid ? 0.16 : 0.05);
    }
  }

  const blur = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sum = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const xx = (x + ox + n) % n;
          const yy = (y + oy + n) % n;
          sum += height[yy * n + xx];
          count += 1;
        }
      }
      blur[y * n + x] = sum / count;
    }
  }

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = n;
  normalCanvas.height = n;
  const normalCtx = normalCanvas.getContext("2d");
  const normalImage = normalCtx.createImageData(n, n);
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = n;
  roughCanvas.height = n;
  const roughCtx = roughCanvas.getContext("2d");
  const roughImage = roughCtx.createImageData(n, n);
  const slope = laid ? 1.45 : 0.4;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const left = blur[y * n + ((x - 1 + n) % n)];
      const right = blur[y * n + ((x + 1) % n)];
      const up = blur[((y - 1 + n) % n) * n + x];
      const down = blur[((y + 1) % n) * n + x];
      let nx = (left - right) * slope;
      let ny = (up - down) * slope;
      let nz = 0.55;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const pixel = (y * n + x) * 4;
      normalImage.data[pixel] = (nx * 0.5 + 0.5) * 255;
      normalImage.data[pixel + 1] = (ny * 0.5 + 0.5) * 255;
      normalImage.data[pixel + 2] = (nz * 0.5 + 0.5) * 255;
      normalImage.data[pixel + 3] = 255;
      const rough = laid
        ? Math.round(188 + blur[y * n + x] * 67)
        : Math.round(168 + blur[y * n + x] * 40);
      roughImage.data[pixel] = rough;
      roughImage.data[pixel + 1] = rough;
      roughImage.data[pixel + 2] = rough;
      roughImage.data[pixel + 3] = 255;
    }
  }

  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const roughMap = new THREE.CanvasTexture(roughCanvas);
  for (const texture of [normalMap, roughMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.repeat.set(laid ? 4.2 : 7, laid ? 6 : 9);
  }
  return { normalMap, roughMap };
}

function pageTextures(THREE, pageImage) {
  const linesPerTile = 48;
  const foreCanvas = document.createElement("canvas");
  foreCanvas.width = pageImage.height;
  foreCanvas.height = pageImage.width;
  const foreContext = foreCanvas.getContext("2d");
  foreContext.translate(foreCanvas.width / 2, foreCanvas.height / 2);
  foreContext.rotate(Math.PI / 2);
  foreContext.drawImage(pageImage, -pageImage.width / 2, -pageImage.height / 2);

  const foreMap = new THREE.CanvasTexture(foreCanvas);
  const topMap = new THREE.Texture(pageImage);
  topMap.needsUpdate = true;
  for (const texture of [foreMap, topMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  return { foreMap, topMap, linesPerTile };
}

function createWearTexture(THREE, { mode = "edges", seed = 1 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };

  if (mode === "edges") {
    const image = context.createImageData(canvas.width, canvas.height);
    const hash = (x, y) => {
      let value = Math.imul(x + seed, 374761393) + Math.imul(y - seed, 668265263);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
    };
    const palette = [
      [229, 220, 198], // worn paper fibers
      [196, 174, 137], // old exposed board
      [128, 105, 79], // ingrained dirt
      [91, 79, 67], // isolated dark grime
    ];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const distanceX = Math.min(x, canvas.width - 1 - x);
        const distanceY = Math.min(y, canvas.height - 1 - y);
        const distance = Math.min(distanceX, distanceY);
        const horizontal = distanceY < distanceX;
        const along = horizontal ? x : y;
        const coarse = 0.5 + 0.22 * Math.sin(along * 0.047 + seed) + 0.18 * Math.sin(along * 0.137 + seed * 0.37);
        const corner = Math.max(0, 1 - distanceX / 42) * Math.max(0, 1 - distanceY / 42);
        const edgeDepth = 2 + coarse * 10 + corner * (7 + 8 * hash(Math.floor(x / 8), Math.floor(y / 8)));
        const grain = hash(Math.floor(x / 3), Math.floor(y / 3));
        const scuff = Math.max(0, (edgeDepth - distance) / edgeDepth);
        const patina = distance < 84 ? Math.exp(-distance / 23) * Math.max(0, grain - 0.42) * 0.4 : 0;
        if (scuff <= 0 && patina <= 0) continue;

        const paletteIndex = grain > 0.88 ? 3 : grain > 0.68 ? 2 : grain > 0.35 ? 1 : 0;
        const [red, green, blue] = palette[paletteIndex];
        const pixel = (y * canvas.width + x) * 4;
        image.data[pixel] = red;
        image.data[pixel + 1] = green;
        image.data[pixel + 2] = blue;
        image.data[pixel + 3] = Math.min(210, Math.round(scuff * (65 + grain * 110) + patina * 120));
      }
    }
    context.putImageData(image, 0, 0);
    // Small, irregular chips concentrated at the corners, rather than a clean border.
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [512, 0, -1, 1], [0, 768, 1, -1], [512, 768, -1, -1]]) {
      for (let i = 0; i < 10; i++) {
        const x = cx + sx * random() * (12 + random() * 34);
        const y = cy + sy * random() * (12 + random() * 42);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + sx * (3 + random() * 14), y + sy * (random() * 8));
        context.lineTo(x + sx * (random() * 7), y + sy * (3 + random() * 18));
        context.closePath();
        context.fillStyle = random() > 0.45 ? "rgba(226, 215, 192, 0.72)" : "rgba(103, 84, 64, 0.56)";
        context.fill();
      }
    }
  } else {
    context.lineCap = "round";
      const crackCount = mode === "spine" ? 11 : 5;
    for (let i = 0; i < crackCount; i++) {
      const spine = mode === "spine";
      let vertical = spine || random() > 0.35;
      let x = spine ? 24 + random() * 464 : 40 + random() * 432;
      let y = random() * canvas.height;
      let direction = random() > 0.5 ? 1 : -1;
      if (!spine && random() < 0.78) {
        const edge = Math.floor(random() * 4);
        if (edge === 0) {
          x = random() * 18;
          vertical = false;
          direction = 1;
        } else if (edge === 1) {
          x = canvas.width - random() * 18;
          vertical = false;
          direction = -1;
        } else if (edge === 2) {
          y = random() * 18;
          vertical = true;
          direction = 1;
        } else {
          y = canvas.height - random() * 18;
          vertical = true;
          direction = -1;
        }
      }
      const length = spine ? 80 + random() * 420 : 100 + random() * 380;
      const points = [];
      const steps = spine ? 9 : 11;
      points.push([x, y]);
      for (let step = 1; step <= steps; step++) {
        if (vertical) {
          x += (random() - 0.5) * (spine ? 13 : 18);
          y += direction * length / steps;
        } else {
          x += direction * length / steps;
          y += (random() - 0.5) * 16;
        }
        points.push([x, y]);
      }
      const drawPath = (offsetX, offsetY) => {
        context.beginPath();
        context.moveTo(points[0][0] + offsetX, points[0][1] + offsetY);
        for (const [pointX, pointY] of points.slice(1)) context.lineTo(pointX + offsetX, pointY + offsetY);
        context.stroke();
      };
      context.strokeStyle = spine ? "rgba(31, 27, 24, 0.56)" : "rgba(47, 39, 33, 0.42)";
      context.lineWidth = spine ? 3 + random() * 3 : 2 + random() * 2;
      drawPath(0, 0);
      context.strokeStyle = "rgba(232, 220, 196, 0.72)";
      context.lineWidth = spine ? 1.2 + random() * 1.2 : 1 + random();
      drawPath(vertical ? 2 : 0, vertical ? 0 : 2);

      // A few short branches make the fractures look torn instead of printed.
      if (i % 2 === 0) {
        const [branchX, branchY] = points[Math.floor(points.length * (0.35 + random() * 0.4))];
        context.beginPath();
        context.moveTo(branchX, branchY);
        context.lineTo(branchX + (random() - 0.5) * 34, branchY + (random() - 0.5) * 62);
        context.strokeStyle = "rgba(216, 204, 182, 0.58)";
        context.lineWidth = 1.2 + random();
        context.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function setCurvedGeometry(deformation, age) {
  const { geometry, basePositions, depth, maxBulge, hingeEdgeX, hingeWidth } = deformation;
  const positions = geometry.attributes.position;
  const bulge = maxBulge * age;
  for (let i = 0; i < positions.count; i++) {
    const offset = i * 3;
    const x = basePositions[offset];
    const z = basePositions[offset + 2];
    const t = clamp((z + depth / 2) / depth, 0, 1);
    const curve = Math.sin(Math.PI * t);
    let hingeWeight = 1;
    if (hingeWidth > 0) {
      const acrossHinge = clamp((x - hingeEdgeX) / hingeWidth, 0, 1);
      hingeWeight = 1 - acrossHinge * acrossHinge * (3 - 2 * acrossHinge);
    }
    positions.setXYZ(i, x + bulge * curve * hingeWeight, basePositions[offset + 1], z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

async function loadWearTextures(THREE, anisotropy) {
  const loader = new THREE.TextureLoader();
  const load = (name) => loader.loadAsync(new URL(`./textures/${name}`, import.meta.url).href);
  const [back, front, spine] = await Promise.all([
    load("wear_back.png"),
    load("wear_front.png"),
    load("wear_spine.png"),
  ]);
  for (const texture of [back, front, spine]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  return { back, front, spine };
}

function createSpineWearMap(THREE, source, targetAspect, anisotropy) {
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const targetWidth = Math.max(1, Math.round(sourceHeight * targetAspect));
  const fixedCenterStart = Math.round(sourceWidth * 0.2);
  const fixedCenterEnd = Math.round(sourceWidth * 0.8);
  const fixedCenterWidth = fixedCenterEnd - fixedCenterStart;
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");

  if (targetWidth < fixedCenterWidth) {
    const crop = (sourceWidth - targetWidth) / 2;
    context.drawImage(source, crop, 0, targetWidth, sourceHeight, 0, 0, targetWidth, sourceHeight);
  } else {
    const sideWidth = (targetWidth - fixedCenterWidth) / 2;
    context.drawImage(source, 0, 0, fixedCenterStart, sourceHeight, 0, 0, sideWidth, sourceHeight);
    context.drawImage(
      source,
      fixedCenterStart, 0, fixedCenterWidth, sourceHeight,
      sideWidth, 0, fixedCenterWidth, sourceHeight
    );
    context.drawImage(
      source,
      fixedCenterEnd, 0, sourceWidth - fixedCenterEnd, sourceHeight,
      sideWidth + fixedCenterWidth, 0, sideWidth, sourceHeight
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function makeFinishMaps(THREE, maskImage, normalImage, finish) {
  const width = maskImage.naturalWidth || maskImage.width;
  const height = maskImage.naturalHeight || maskImage.height;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskContext.drawImage(maskImage, 0, 0, width, height);
  const mask = maskContext.getImageData(0, 0, width, height).data;
  const normalContext = normalImage.getContext("2d", { willReadFrequently: true });
  const normal = normalContext.getImageData(0, 0, normalImage.width, normalImage.height).data;
  const roughnessCanvas = document.createElement("canvas");
  const clearcoatCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  for (const canvas of [roughnessCanvas, clearcoatCanvas, normalCanvas]) {
    canvas.width = width;
    canvas.height = height;
  }
  const roughness = roughnessCanvas.getContext("2d").createImageData(width, height);
  const clearcoat = clearcoatCanvas.getContext("2d").createImageData(width, height);
  const normals = normalCanvas.getContext("2d").createImageData(width, height);
  const matteRoughness = Math.round((finish.matte?.roughness ?? 1) * 255);
  const glossRoughness = Math.round((finish.gloss?.roughness ?? 0.62) * 255);
  const normalWidth = normalImage.width;
  const normalHeight = normalImage.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourcePixel = (y * width + x) * 4;
      const isGloss = mask[sourcePixel + 2] > mask[sourcePixel];
      const roughValue = isGloss ? glossRoughness : matteRoughness;
      roughness.data[sourcePixel] = roughValue;
      roughness.data[sourcePixel + 1] = roughValue;
      roughness.data[sourcePixel + 2] = roughValue;
      roughness.data[sourcePixel + 3] = 255;
      clearcoat.data[sourcePixel] = isGloss ? 255 : 0;
      clearcoat.data[sourcePixel + 1] = 255;
      clearcoat.data[sourcePixel + 2] = 255;
      clearcoat.data[sourcePixel + 3] = 255;
      if (isGloss) {
        normals.data[sourcePixel] = 128;
        normals.data[sourcePixel + 1] = 128;
        normals.data[sourcePixel + 2] = 255;
      } else {
        const normalPixel = ((y % normalHeight) * normalWidth + (x % normalWidth)) * 4;
        normals.data[sourcePixel] = normal[normalPixel];
        normals.data[sourcePixel + 1] = normal[normalPixel + 1];
        normals.data[sourcePixel + 2] = normal[normalPixel + 2];
      }
      normals.data[sourcePixel + 3] = 255;
    }
  }

  roughnessCanvas.getContext("2d").putImageData(roughness, 0, 0);
  clearcoatCanvas.getContext("2d").putImageData(clearcoat, 0, 0);
  normalCanvas.getContext("2d").putImageData(normals, 0, 0);
  const makeTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  };
  return {
    roughnessMap: makeTexture(roughnessCanvas),
    clearcoatMap: makeTexture(clearcoatCanvas),
    normalMap: makeTexture(normalCanvas),
  };
}

export async function mountBook({
  view,
  skybox = "old-concrete",
  woodTable = false,
  posture = "standing",
  coverCanvas,
  roughCanvas,
  coatCanvas,
  backCanvas,
  spineCanvas,
}) {
  const THREE = await import("three");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;
  view.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Libro en 3D");

  const scene = new THREE.Scene();
  const skyboxScene = new THREE.Scene();
  const skyboxBaseFov = 42;
  const skyboxCamera = new THREE.PerspectiveCamera(skyboxBaseFov, 1, 0.05, 50);
  const panoramaLoader = new THREE.TextureLoader();
  const skyboxUrls = {
    "old-concrete": new URL("./images/old-concrete-4096x2048.jpg", import.meta.url).href,
    "wine-shop": new URL("./images/wine-shop-4096x2048.jpg", import.meta.url).href,
  };
  const skyboxTextures = new Map();
  const skyboxLoads = new Map();
  let activeSkybox = skyboxUrls[skybox] ? skybox : "old-concrete";
  function loadSkybox(id) {
    if (skyboxTextures.has(id)) return Promise.resolve(skyboxTextures.get(id));
    if (skyboxLoads.has(id)) return skyboxLoads.get(id);
    const request = panoramaLoader.loadAsync(skyboxUrls[id]).then((panorama) => {
      panorama.mapping = THREE.EquirectangularReflectionMapping;
      panorama.colorSpace = THREE.SRGBColorSpace;
      panorama.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      skyboxTextures.set(id, panorama);
      return panorama;
    }).finally(() => skyboxLoads.delete(id));
    skyboxLoads.set(id, request);
    return request;
  }
  function setSkybox(id) {
    if (!skyboxUrls[id]) return Promise.resolve(false);
    activeSkybox = id;
    applySkyboxLighting(id);
    return loadSkybox(id).then((panorama) => {
      if (activeSkybox === id) {
        skyboxScene.background = panorama;
        skyboxScene.backgroundBlurriness = 0;
        skyboxScene.backgroundIntensity = 1;
        scene.environment = panorama;
      }
      return true;
    }).catch((error) => {
      console.warn(`Could not load the 3D skybox: ${id}.`, error);
      return false;
    });
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = new THREE.Scene();
  const softbox = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  softbox.position.set(1.6, 2.4, 1.2);
  softbox.lookAt(0, 0, 0);
  studio.add(softbox);
  const fillPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 4),
    new THREE.MeshBasicMaterial({ color: 0xc5d0dc })
  );
  fillPanel.position.set(-2.4, 0.4, 1.5);
  fillPanel.lookAt(0, 0, 0);
  studio.add(fillPanel);
  scene.environment = pmrem.fromScene(studio, 0).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.rotateSpeed = 0.75;
  controls.minDistance = 1.2;
  controls.maxDistance = 9;
  controls.target.set(0, 0, 0);

  const key = new THREE.DirectionalLight(0xfff4e5, 2.6);
  key.position.set(2.4, 4.2, 3.2);
  scene.add(key);
  const backKey = new THREE.DirectionalLight(0xfff2df, 2.2);
  backKey.position.set(-1.2, 2.2, -3.4);
  scene.add(backKey);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x70675e, 0.72);
  scene.add(ambient);
  const skim = new THREE.DirectionalLight(0xfff8ef, 1.55);
  skim.position.set(-1.6, -0.15, 4.2);
  scene.add(skim);
  const fill = new THREE.DirectionalLight(0xe7eef6, 1.25);
  fill.position.set(-3.2, 1.6, 2.2);
  scene.add(fill);

  const skyboxLightingProfiles = {
    "old-concrete": {
      key: 0xffefda, keyIntensity: 2.0, back: 0xd5e4cb, backIntensity: 1.05,
      sky: 0xd9e7d2, ground: 0x58564b, ambientIntensity: 0.87,
      skim: 0xfff4e5, skimIntensity: 0.95, fill: 0xc9ddc4, fillIntensity: 0.78, environment: 0.36,
    },
    "wine-shop": {
      key: 0xffd8a6, keyIntensity: 1.45, back: 0xc6d5a7, backIntensity: 0.85,
      sky: 0xb9c69b, ground: 0x343026, ambientIntensity: 0.78,
      skim: 0xffdfb4, skimIntensity: 0.7, fill: 0xc6d6aa, fillIntensity: 0.78, environment: 0.3,
    },
  };
  function applySkyboxLighting(id) {
    const profile = skyboxLightingProfiles[id] || skyboxLightingProfiles["old-concrete"];
    key.color.setHex(profile.key);
    key.intensity = profile.keyIntensity;
    backKey.color.setHex(profile.back);
    backKey.intensity = profile.backIntensity;
    ambient.color.setHex(profile.sky);
    ambient.groundColor.setHex(profile.ground);
    ambient.intensity = profile.ambientIntensity;
    skim.color.setHex(profile.skim);
    skim.intensity = profile.skimIntensity;
    fill.color.setHex(profile.fill);
    fill.intensity = profile.fillIntensity;
    scene.environmentIntensity = profile.environment;
  }
  setSkybox(activeSkybox);

  const surfaceAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const makeSurfaceTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = surfaceAnisotropy;
    return texture;
  };
  const makeSpineEdgeTexture = (source) => {
    const texture = source.clone();
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = surfaceAnisotropy;
    return texture;
  };

  let coverMap = makeSurfaceTexture(coverCanvas);
  let backMap = makeSurfaceTexture(backCanvas);
  let spineMap = makeSurfaceTexture(spineCanvas);
  let spineMapSize = { width: spineCanvas.width, height: spineCanvas.height };
  let frontSpineEdgeMap = makeSpineEdgeTexture(coverMap);
  let backSpineEdgeMap = makeSpineEdgeTexture(backMap);
  let surfaceTextureEdition = null;

  const roughMap = new THREE.CanvasTexture(roughCanvas);
  const coatMap = new THREE.CanvasTexture(coatCanvas);
  for (const texture of [roughMap, coatMap]) {
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = surfaceAnisotropy;
  }

  const laid = paperMaps(THREE, { laid: true });
  const soft = paperMaps(THREE, { laid: false });
  const pageTexture = await new THREE.TextureLoader().loadAsync(
    new URL("./images/book_pages.png", import.meta.url).href,
  );
  pageTexture.colorSpace = THREE.SRGBColorSpace;
  const pagesTex = pageTextures(THREE, pageTexture.image);
  pageTexture.dispose();
  const wearMaps = await loadWearTextures(THREE, surfaceAnisotropy);
  const spineWearSource = wearMaps.spine.image;
  wearMaps.spine.dispose();
  const createWearMaterial = (map) => new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    opacity: 0,
    metalness: 0,
    roughness: 0.98,
    envMapIntensity: 0.28,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  });
  const frontWearMaterial = createWearMaterial(wearMaps.front);
  const backWearMaterial = createWearMaterial(wearMaps.back);
  const spineWearMaterial = createWearMaterial(null);

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: coverMap,
    metalness: 0,
    roughness: 1,
  });
  const backMat = new THREE.MeshPhysicalMaterial({
    map: backMap,
    metalness: 0,
    roughness: 1,
  });
  const templateBackMat = new THREE.MeshBasicMaterial({
    map: backMap,
    color: 0xffffff,
  });
  const spineMat = new THREE.MeshPhysicalMaterial({
    map: spineMap,
    metalness: 0,
    roughness: 1,
  });
  const wearFadeUniform = { value: 0 };
  function addWearFade(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.wearFadeAmount = wearFadeUniform;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nuniform float wearFadeAmount;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float wearLuminance = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 fadedInk = mix(diffuseColor.rgb, vec3(wearLuminance), 0.78);
        fadedInk = mix(fadedInk, vec3(0.68, 0.65, 0.58), 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, fadedInk, wearFadeAmount);`,
      );
    };
    material.customProgramCacheKey = () => "cover-wear-fade-v1";
    material.needsUpdate = true;
  }
  for (const material of [frontMat, backMat, templateBackMat, spineMat]) {
    addWearFade(material);
  }
  const spineCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spineJoinMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
  const frontSpineEdgeMat = new THREE.MeshStandardMaterial({ map: frontSpineEdgeMap, roughness: 1 });
  const backSpineEdgeMat = new THREE.MeshStandardMaterial({ map: backSpineEdgeMap, roughness: 1 });
  function refreshSurfaceTextures(edition) {
    if (surfaceTextureEdition === edition) {
      if (spineMapSize.width !== spineCanvas.width || spineMapSize.height !== spineCanvas.height) {
        spineMap.dispose();
        spineMap = makeSurfaceTexture(spineCanvas);
        spineMat.map = spineMap;
        spineMapSize = { width: spineCanvas.width, height: spineCanvas.height };
        spineMat.needsUpdate = true;
      }
      for (const texture of [coverMap, backMap, spineMap, frontSpineEdgeMap, backSpineEdgeMap]) {
        texture.needsUpdate = true;
      }
      return;
    }

    for (const texture of [coverMap, backMap, spineMap, frontSpineEdgeMap, backSpineEdgeMap]) {
      texture.dispose();
    }
    coverMap = makeSurfaceTexture(coverCanvas);
    backMap = makeSurfaceTexture(backCanvas);
    spineMap = makeSurfaceTexture(spineCanvas);
    spineMapSize = { width: spineCanvas.width, height: spineCanvas.height };
    frontSpineEdgeMap = makeSpineEdgeTexture(coverMap);
    backSpineEdgeMap = makeSpineEdgeTexture(backMap);

    frontMat.map = coverMap;
    backMat.map = backMap;
    templateBackMat.map = backMap;
    spineMat.map = spineMap;
    frontSpineEdgeMat.map = frontSpineEdgeMap;
    backSpineEdgeMat.map = backSpineEdgeMap;
    for (const target of [frontMat, backMat, templateBackMat, spineMat, frontSpineEdgeMat, backSpineEdgeMat]) {
      target.needsUpdate = true;
    }
    surfaceTextureEdition = edition;
  }
  const stockMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3efe6,
    metalness: 0,
    roughness: 1,
  });
  const pageHidden = new THREE.MeshStandardMaterial({ color: 0xf3eee4, roughness: 1 });
  const foreMat = new THREE.MeshStandardMaterial({
    map: pagesTex.foreMap,
    color: 0xf4efe4,
    roughness: 0.95,
  });
  const topMat = new THREE.MeshStandardMaterial({
    map: pagesTex.topMap,
    color: 0xf4efe4,
    roughness: 0.95,
  });

  const book = new THREE.Group();
  scene.add(book);

  let built = null;
  let currentPosture = posture === "lying" ? "lying" : "standing";
  let tableVisible = Boolean(woodTable);
  book.rotation.x = currentPosture === "lying" ? -Math.PI / 2 : 0;
  let appliedEdition = null;
  let appliedFinishDefinition = null;
  let mappedFinishMaps = null;
  let frameReady = false;
  let backMesh = null;
  let currentWear = 0;
  let spineDeformations = [];
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pickMesh = null;

  const TABLE_WIDTH = 3.6;
  const TABLE_DEPTH = 4;
  const TABLE_THICKNESS = 0.12;
  const TABLE_LEG_HEIGHT = 0.86;
  const TABLE_LEG_SIZE = 0.15;
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 1024;
  woodCanvas.height = 512;
  const woodContext = woodCanvas.getContext("2d");
  woodContext.fillStyle = "#9b6b42";
  woodContext.fillRect(0, 0, woodCanvas.width, woodCanvas.height);
  for (let line = 0; line < 300; line++) {
    const y = (line / 300) * woodCanvas.height;
    const shade = Math.random() > 0.52 ? 1 : -1;
    woodContext.beginPath();
    woodContext.moveTo(0, y);
    for (let x = 0; x <= woodCanvas.width; x += 64) {
      const wave = Math.sin(x * 0.012 + line * 0.23) * (1.5 + (line % 5));
      woodContext.lineTo(x, y + wave);
    }
    woodContext.strokeStyle = shade > 0
      ? `rgba(229, 181, 126, ${0.035 + Math.random() * 0.07})`
      : `rgba(50, 27, 13, ${0.035 + Math.random() * 0.08})`;
    woodContext.lineWidth = 0.5 + Math.random() * 2.2;
    woodContext.stroke();
  }
  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = THREE.RepeatWrapping;
  woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.repeat.set(1.4, 1.4);
  woodTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tableMaterial = new THREE.MeshStandardMaterial({ map: woodTexture, roughness: 0.78 });
  const tableGroup = new THREE.Group();
  tableGroup.visible = tableVisible;
  tableGroup.add(new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_WIDTH, TABLE_THICKNESS, TABLE_DEPTH),
    tableMaterial,
  ));
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(TABLE_LEG_SIZE, TABLE_LEG_HEIGHT, TABLE_LEG_SIZE),
        tableMaterial,
      );
      leg.position.set(
        x * (TABLE_WIDTH / 2 - TABLE_LEG_SIZE),
        -(TABLE_THICKNESS / 2 + TABLE_LEG_HEIGHT / 2),
        z * (TABLE_DEPTH / 2 - TABLE_LEG_SIZE),
      );
      tableGroup.add(leg);
    }
  }
  scene.add(tableGroup);

  function updateTablePose() {
    if (!built) return;
    const supportExtent = currentPosture === "lying" ? built.depth : built.height;
    tableGroup.position.set(0, -supportExtent / 2 - TABLE_THICKNESS / 2, 0);
  }

  function defaultCameraDirection() {
    return currentPosture === "lying"
      ? new THREE.Vector3(0.2, 1.7, 1).normalize()
      : new THREE.Vector3(0.28, tableVisible ? 0.18 : 0.05, 1).normalize();
  }

  function disposeGroup() {
    for (const child of [...book.children]) {
      child.geometry?.dispose();
      book.remove(child);
    }
    pickMesh = null;
    backMesh = null;
    spineDeformations = [];
  }

  function setWear(value) {
    currentWear = clamp(Number(value) || 0, 0, 100) / 100;
    const edgeWear = Math.pow(currentWear, 0.76);
    wearFadeUniform.value = Math.pow(currentWear, 2.2) * 0.86;
    const yellowing = Math.pow(currentWear, 0.85) * 0.76;
    const pageColor = new THREE.Color(0xf4efe4).lerp(new THREE.Color(0xc49b50), yellowing);
    foreMat.color.copy(pageColor);
    topMat.color.copy(pageColor);
    pageHidden.color.copy(pageColor);
    frontWearMaterial.opacity = edgeWear * 0.92;
    backWearMaterial.opacity = edgeWear * 0.92;
    spineWearMaterial.opacity = Math.pow(clamp((currentWear - 0.16) / 0.84, 0, 1), 1.12) * 0.88;
    const curveAge = Math.pow(clamp((currentWear - 0.05) / 0.95, 0, 1), 1.35);
    for (const deformation of spineDeformations) setCurvedGeometry(deformation, curveAge);
  }

  function applyMappedFinish(materialTarget, finishMap, finishConfig) {
    if (!finishMap) return;
    materialTarget.roughness = 1;
    materialTarget.roughnessMap = finishMap.roughnessMap;
    materialTarget.clearcoat = finishConfig.gloss?.clearcoat ?? 0.42;
    materialTarget.clearcoatMap = finishMap.clearcoatMap;
    materialTarget.clearcoatRoughness = finishConfig.gloss?.clearcoatRoughness ?? 0.48;
    materialTarget.normalMap = finishMap.normalMap;
    materialTarget.normalScale.set(finishConfig.matte?.normalScale ?? 0.12, finishConfig.matte?.normalScale ?? 0.12);
    materialTarget.envMapIntensity = finishConfig.gloss?.envMapIntensity ?? 0.85;
    materialTarget.needsUpdate = true;
  }

  function applyLook(edition, isTemplate = false, materialConfig = null) {
    if (edition === appliedEdition) return;
    appliedEdition = edition;
    for (const target of [frontMat, backMat, spineMat]) {
      target.roughnessMap = null;
      target.clearcoat = 0;
      target.clearcoatMap = null;
      target.clearcoatRoughnessMap = null;
      target.clearcoatRoughness = 1;
      target.normalMap = null;
    }
    if (materialConfig?.type === "mapped-finish" && materialConfig !== appliedFinishDefinition) {
      appliedFinishDefinition = materialConfig;
      const normalSource = laid.normalMap.image;
      mappedFinishMaps = Object.fromEntries(["front", "back", "spine"].map((surface) => {
        const mask = materialConfig.maps?.[surface];
        return [surface, mask ? makeFinishMaps(THREE, mask, normalSource, materialConfig) : null];
      }));
    }
    frontMat.map = coverMap;
    backMat.map = isTemplate || edition === "penguin" ? backMap : null;
    spineMat.map = isTemplate || edition === "penguin" ? spineMap : null;
    frontMat.metalness = 0;
    stockMat.metalness = 0;
    stockMat.map = null;

    if (edition === "penguin") {
      frontMat.roughness = 1;
      frontMat.roughnessMap = roughMap;
      frontMat.clearcoat = 1;
      frontMat.clearcoatMap = coatMap;
      frontMat.clearcoatRoughness = 0.24;
      frontMat.normalMap = null;
      frontMat.envMapIntensity = 1.4;
      stockMat.color.set("#f5f4f1");
      stockMat.roughness = 0.92;
      stockMat.roughnessMap = null;
      stockMat.clearcoat = 0;
      stockMat.clearcoatMap = null;
      stockMat.normalMap = null;
      stockMat.envMapIntensity = 0.35;
    } else if (edition === "debolsillo") {
      frontMat.roughness = 0.48;
      frontMat.roughnessMap = soft.roughMap;
      frontMat.clearcoat = 0.62;
      frontMat.clearcoatMap = null;
      frontMat.clearcoatRoughness = 0.22;
      frontMat.normalMap = soft.normalMap;
      frontMat.normalScale.set(0.06, 0.06);
      frontMat.envMapIntensity = 1;
      stockMat.color.set("#f7f4ee");
      stockMat.roughness = 0.5;
      stockMat.roughnessMap = soft.roughMap;
      stockMat.clearcoat = 0.4;
      stockMat.clearcoatMap = null;
      stockMat.clearcoatRoughness = 0.28;
      stockMat.normalMap = soft.normalMap;
      stockMat.normalScale.set(0.06, 0.06);
      stockMat.envMapIntensity = 0.9;
    } else {
      frontMat.roughness = 1;
      frontMat.roughnessMap = laid.roughMap;
      frontMat.clearcoat = 0;
      frontMat.clearcoatMap = null;
      frontMat.normalMap = laid.normalMap;
      frontMat.normalScale.set(0.72, 0.72);
      frontMat.envMapIntensity = 0.32;
      stockMat.color.set("#f1ece3");
      stockMat.roughness = 1;
      stockMat.roughnessMap = laid.roughMap;
      stockMat.clearcoat = 0;
      stockMat.clearcoatMap = null;
      stockMat.normalMap = laid.normalMap;
      stockMat.normalScale.set(0.9, 0.9);
      stockMat.envMapIntensity = 0.28;
    }
    backMat.color.set(isTemplate ? "#ffffff" : stockMat.color);
    spineMat.color.set(isTemplate ? "#ffffff" : stockMat.color);
    backMat.roughness = stockMat.roughness;
    spineMat.roughness = stockMat.roughness;
    if (edition === "penguin" && materialConfig?.type === "mapped-finish" && mappedFinishMaps) {
      applyMappedFinish(frontMat, mappedFinishMaps.front, materialConfig);
      applyMappedFinish(backMat, mappedFinishMaps.back, materialConfig);
      applyMappedFinish(spineMat, mappedFinishMaps.spine, materialConfig);
    }
    frontSpineEdgeMat.copy(frontMat);
    frontSpineEdgeMat.map = frontSpineEdgeMap;
    backSpineEdgeMat.copy(backMat);
    backSpineEdgeMat.map = backSpineEdgeMap;
    if (edition === "penguin" && materialConfig?.type === "mapped-finish") {
      for (const edgeMaterial of [frontSpineEdgeMat, backSpineEdgeMat]) {
        edgeMaterial.roughness = 1;
        edgeMaterial.roughnessMap = null;
        edgeMaterial.normalMap = laid.normalMap;
        edgeMaterial.normalScale.set(materialConfig.matte?.normalScale ?? 0.12, materialConfig.matte?.normalScale ?? 0.12);
      }
    }
    frontMat.needsUpdate = true;
    backMat.needsUpdate = true;
    spineMat.needsUpdate = true;
    frontSpineEdgeMat.needsUpdate = true;
    backSpineEdgeMat.needsUpdate = true;
    stockMat.needsUpdate = true;
  }

  function rebuild(edition, pages, dimensions = null, preserveCamera = false) {
    disposeGroup();
    const size = dimensions || EDITION_MM[edition] || EDITION_MM.alianza;
    const pageMm = Math.max(dimensions?.minSpineMm || 10, pages * (dimensions?.mmPerPage || 0.09));
    const width = size.w * MM;
    const height = size.h * MM;
    const depth = pageMm * MM;
    const board = 0.35 * MM;
    // Keep only a hairline of the printed spine artwork at the outside edge.
    // The remaining original spine width is a plain white core behind it.
    const spineLip = 0.01 * MM;
    const gap = 0.02 * MM;
    const spineCoreWidth = Math.max(0, board - spineLip);
    // Extend the cover faces over the inner spine core so no gap is exposed
    // at the hinge. Keep the extension on the spine-facing edge.
    const coverWidth = width + spineCoreWidth;
    const coverShiftX = -spineCoreWidth / 2;

    const edgeFraction = board / width;
    frontSpineEdgeMap.repeat.set(edgeFraction, 1);
    frontSpineEdgeMap.offset.set(0, 0);
    backSpineEdgeMap.repeat.set(edgeFraction, 1);
    backSpineEdgeMap.offset.set(1 - edgeFraction, 0);

    const lineCount = Math.max(1, Math.min(pages, 160) / pagesTex.linesPerTile);
    pagesTex.foreMap.repeat.set(lineCount, 1);
    pagesTex.topMap.repeat.set(1, lineCount);

    const pageW = width;
    const pageH = height;
    const pagesMesh = new THREE.Mesh(
      new THREE.BoxGeometry(pageW, pageH, depth, 40, 1, 40),
      [foreMat, pageHidden, topMat, topMat, pageHidden, pageHidden]
    );
    book.add(pagesMesh);

    const front = new THREE.Mesh(
      new THREE.BoxGeometry(coverWidth, height, board),
      [spineCoreMat, frontSpineEdgeMat, spineCoreMat, spineCoreMat, frontMat, spineCoreMat]
    );
    front.position.x = coverShiftX;
    front.position.z = depth / 2 + board / 2 + gap;
    book.add(front);
    const frontWear = new THREE.Mesh(new THREE.PlaneGeometry(coverWidth, height), frontWearMaterial);
    frontWear.position.set(coverShiftX, 0, front.position.z + board / 2 + 0.00002);
    book.add(frontWear);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(coverWidth, height, board),
      [spineCoreMat, backSpineEdgeMat, spineCoreMat, spineCoreMat, spineCoreMat, backMat]
    );
    back.position.x = coverShiftX;
    back.position.z = -(depth / 2 + board / 2 + gap);
    book.add(back);
    backMesh = back;
    const backWear = new THREE.Mesh(new THREE.PlaneGeometry(coverWidth, height), backWearMaterial);
    backWear.position.set(coverShiftX, 0, back.position.z - board / 2 - 0.00002);
    backWear.rotation.y = Math.PI;
    book.add(backWear);

    const spineDepth = depth + board * 2 + gap * 2;
    const spineCoreDepth = Math.max(0, spineDepth - board * 2);
    const spineOuterX = -width / 2 - board;
    const previousSpineWearMap = spineWearMaterial.map;
    spineWearMaterial.map = createSpineWearMap(THREE, spineWearSource, spineDepth / height, surfaceAnisotropy);
    spineWearMaterial.needsUpdate = true;
    previousSpineWearMap?.dispose();
    spineDeformations.push({
      geometry: pagesMesh.geometry,
      basePositions: pagesMesh.geometry.attributes.position.array.slice(),
      depth: spineDepth,
      maxBulge: spineDepth * 0.09,
      hingeEdgeX: -width / 2,
      hingeWidth: Math.max(board * 12, width * 0.045),
    });
    const spineCore = new THREE.Mesh(
      new THREE.BoxGeometry(spineCoreWidth, height, spineCoreDepth, 1, 12, 48),
      [spineCoreMat, spineJoinMat, spineCoreMat, spineCoreMat, spineCoreMat, spineCoreMat]
    );
    spineCore.position.x = spineOuterX + spineLip + spineCoreWidth / 2;
    book.add(spineCore);
    spineDeformations.push({
      geometry: spineCore.geometry,
      basePositions: spineCore.geometry.attributes.position.array.slice(),
      depth: spineDepth,
      maxBulge: spineDepth * 0.09,
    });

    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(spineLip, height, spineDepth, 1, 12, 48),
      [spineJoinMat, spineMat, stockMat, stockMat, frontSpineEdgeMat, backSpineEdgeMat]
    );
    spine.position.x = spineOuterX + spineLip / 2;
    book.add(spine);
    spineDeformations.push({
      geometry: spine.geometry,
      basePositions: spine.geometry.attributes.position.array.slice(),
      depth: spineDepth,
      maxBulge: spineDepth * 0.09,
    });

    const spineWearGeometry = new THREE.PlaneGeometry(spineDepth, height, 64, 12);
    spineWearGeometry.rotateY(-Math.PI / 2);
    const spineWear = new THREE.Mesh(spineWearGeometry, spineWearMaterial);
    spineWear.position.x = spineOuterX - 0.00002;
    book.add(spineWear);
    spineDeformations.push({
      geometry: spineWearGeometry,
      basePositions: spineWearGeometry.attributes.position.array.slice(),
      depth: spineDepth,
      maxBulge: spineDepth * 0.09,
    });

    pickMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    pickMesh.position.z = front.position.z + board / 2 + 0.001;
    book.add(pickMesh);

    built = { edition, pages, width, height, depth: depth + board * 2 };
    book.rotation.x = currentPosture === "lying" ? -Math.PI / 2 : 0;
    tableGroup.visible = tableVisible;
    updateTablePose();
    setWear(currentWear * 100);

    placeCamera(preserveCamera, preserveCamera);
  }

  function getCameraFitDistance() {
    if (!built) return 0;
    // Keep framing and background zoom tied to the book. Showing the table
    // should never make the book smaller or change the skybox field of view.
    const radius = 0.5 * Math.hypot(built.width, built.height, built.depth);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(camera.aspect || 1, 0.6);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    return Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * 1.72;
  }

  function placeCamera(keepDirection, preserveDistance = false) {
    if (!built) return;
    const radius = 0.5 * Math.hypot(built.width, built.height, built.depth);
    const distance = getCameraFitDistance();
    if (preserveDistance && frameReady) {
      // A page-count change rebuilds the mesh, but must not move the camera or
      // call controls.update(), which can consume pending wheel/damping input.
      controls.minDistance = Math.min(controls.minDistance, radius * 1.15);
      controls.maxDistance = Math.max(controls.maxDistance, distance * 3.2);
      camera.near = Math.max(0.05, radius * 0.025);
      camera.far = controls.maxDistance + radius * 1.5;
      camera.updateProjectionMatrix();
      return;
    }
    controls.minDistance = radius * 1.15;
    controls.maxDistance = distance * 3.2;
    // Keep the depth buffer focused on the book's actual zoom range. A tiny
    // near plane combined with a distant far plane loses precision and causes
    // the cover and page surfaces to flicker against each other when zoomed out.
    camera.near = Math.max(0.05, radius * 0.025);
    camera.far = controls.maxDistance + radius * 1.5;
    camera.updateProjectionMatrix();
    controls.target.set(0, currentPosture === "lying" ? 0 : built.height * 0.02, 0);
    const offset = camera.position.clone().sub(controls.target);
    const direction = keepDirection && frameReady && offset.lengthSq() > 1e-6
      ? offset.normalize()
      : defaultCameraDirection();
    const next = keepDirection && frameReady ? Math.max(offset.length(), distance) : distance;
    camera.position.copy(controls.target).add(direction.multiplyScalar(next));
    controls.update();
    frameReady = true;
  }

  function setTable(enabled) {
    tableVisible = Boolean(enabled);
    tableGroup.visible = tableVisible;
    updateTablePose();
  }

  function setPosture(value) {
    currentPosture = value === "lying" ? "lying" : "standing";
    book.rotation.x = currentPosture === "lying" ? -Math.PI / 2 : 0;
    updateTablePose();
  }

  function resize() {
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(width * dpr), Math.floor(height * dpr), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    skyboxCamera.aspect = width / height;
    skyboxCamera.updateProjectionMatrix();
    placeCamera(true);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(view);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    const fitDistance = getCameraFitDistance();
    if (fitDistance > 0) {
      const zoomRatio = fitDistance / Math.max(camera.position.distanceTo(controls.target), 0.001);
      const backgroundFov = clamp(skyboxBaseFov / Math.pow(zoomRatio, 0.35), 26, 58);
      if (Math.abs(backgroundFov - skyboxCamera.fov) > 0.01) {
        skyboxCamera.fov = backgroundFov;
        skyboxCamera.updateProjectionMatrix();
      }
    }
    skyboxCamera.quaternion.copy(camera.quaternion);
    renderer.clear();
    renderer.render(skyboxScene, skyboxCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
  });

  function pick(event) {
    if (!pickMesh) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(pickMesh, false)[0];
    if (!hit?.uv) return null;
    return {
      x: hit.uv.x * coverCanvas.width,
      y: (1 - hit.uv.y) * coverCanvas.height,
    };
  }

  return {
    dom: renderer.domElement,
    resize,
    setSkybox,
    setTable,
    setPosture,
    fit() {
      resize();
      placeCamera(false);
    },
    resetRotation() {
      if (!built) return;
      controls.target.set(0, currentPosture === "lying" ? 0 : built.height * 0.02, 0);
      const distance = Math.max(camera.position.distanceTo(controls.target), controls.minDistance);
      const direction = defaultCameraDirection();
      camera.position.copy(controls.target).add(direction.multiplyScalar(distance));
      camera.lookAt(controls.target);
      controls.update();
    },
    setWear,
    sync({ edition, pages, template = false, dimensions = null, material = null, wear = currentWear * 100 }) {
      const nextPages = Math.round(pages);
      const preserveCamera = Boolean(built && built.edition === edition);
      const size = dimensions ? {
        w: dimensions.widthMm,
        h: dimensions.heightMm,
        minSpineMm: dimensions.minSpineMm,
        mmPerPage: dimensions.mmPerPage,
      } : null;
      refreshSurfaceTextures(edition);
      if (!built || built.edition !== edition || built.pages !== nextPages) {
        rebuild(edition, nextPages, size, preserveCamera);
      }
      applyLook(edition, template, material);
      if (backMesh) {
        backMesh.material[5] = template && material?.type !== "mapped-finish" ? templateBackMat : backMat;
      }
      if (edition === "penguin") {
        roughMap.needsUpdate = true;
        coatMap.needsUpdate = true;
      }
      setWear(wear);
    },
  };
}
