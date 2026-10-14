const MM = 0.012;
const EDITION_MM = {
  alianza: { w: 120, h: 180 },
  debolsillo: { w: 125, h: 190 },
  penguin: { w: 129, h: 198 },
};

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

function pageTextures(THREE) {
  const linesPerTile = 48;

  function paintEdge(alongX) {
    const canvas = document.createElement("canvas");
    const length = linesPerTile * 4;
    canvas.width = alongX ? length : 8;
    canvas.height = alongX ? 8 : length;
    const g = canvas.getContext("2d");
    g.fillStyle = "#f4efe6";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "#ddd4c6";
    for (let i = 0; i < length; i += 4) {
      if (alongX) g.fillRect(i, 0, 1, 8);
      else g.fillRect(0, i, 8, 1);
    }
    return canvas;
  }

  const foreMap = new THREE.CanvasTexture(paintEdge(true));
  const topMap = new THREE.CanvasTexture(paintEdge(false));
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

export async function mountBook({ view, coverCanvas, roughCanvas, coatCanvas }) {
  const THREE = await import("three");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  view.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Libro en 3D");

  const scene = new THREE.Scene();
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
  scene.environmentIntensity = 1;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.rotateSpeed = 0.75;
  controls.minDistance = 1.2;
  controls.maxDistance = 9;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI / 2 + 0.2;
  controls.target.set(0, 0, 0);

  const key = new THREE.DirectionalLight(0xfff4e5, 2.6);
  key.position.set(2.4, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 16;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const skim = new THREE.DirectionalLight(0xfff8ef, 1.55);
  skim.position.set(-1.6, -0.15, 4.2);
  scene.add(skim);
  const fill = new THREE.DirectionalLight(0xe7eef6, 1.25);
  fill.position.set(-3.2, 1.6, 2.2);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.2 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const coverMap = new THREE.CanvasTexture(coverCanvas);
  coverMap.colorSpace = THREE.SRGBColorSpace;
  coverMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const roughMap = new THREE.CanvasTexture(roughCanvas);
  const coatMap = new THREE.CanvasTexture(coatCanvas);
  for (const texture of [roughMap, coatMap]) {
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = coverMap.anisotropy;
  }

  const laid = paperMaps(THREE, { laid: true });
  const soft = paperMaps(THREE, { laid: false });
  const pagesTex = pageTextures(THREE);

  const frontMat = new THREE.MeshPhysicalMaterial({
    map: coverMap,
    metalness: 0,
    roughness: 1,
  });
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
  let appliedEdition = null;
  let frameReady = false;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let pickMesh = null;

  function disposeGroup() {
    for (const child of [...book.children]) {
      child.geometry?.dispose();
      book.remove(child);
    }
    pickMesh = null;
  }

  function applyLook(edition) {
    if (edition === appliedEdition) return;
    appliedEdition = edition;
    frontMat.map = coverMap;
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
    frontMat.needsUpdate = true;
    stockMat.needsUpdate = true;
  }

  function rebuild(edition, pages) {
    disposeGroup();
    const size = EDITION_MM[edition] || EDITION_MM.alianza;
    const pageMm = Math.max(10, pages * 0.09);
    const width = size.w * MM;
    const height = size.h * MM;
    const depth = pageMm * MM;
    const board = 0.35 * MM;
    const gap = 0.02 * MM;

    const lineCount = Math.max(1, Math.min(pages, 96) / pagesTex.linesPerTile);
    pagesTex.foreMap.repeat.set(lineCount, 1);
    pagesTex.topMap.repeat.set(1, lineCount);

    const pageW = width;
    const pageH = height;
    const pagesMesh = new THREE.Mesh(
      new THREE.BoxGeometry(pageW, pageH, depth),
      [foreMat, pageHidden, topMat, topMat, pageHidden, pageHidden]
    );
    pagesMesh.castShadow = true;
    pagesMesh.receiveShadow = true;
    book.add(pagesMesh);

    const front = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, board),
      [stockMat, stockMat, stockMat, stockMat, frontMat, stockMat]
    );
    front.position.z = depth / 2 + board / 2 + gap;
    front.castShadow = true;
    front.receiveShadow = true;
    book.add(front);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, board),
      stockMat
    );
    back.position.z = -(depth / 2 + board / 2 + gap);
    back.castShadow = true;
    back.receiveShadow = true;
    book.add(back);

    const spineDepth = depth + board * 2 + gap * 2;
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(board, height, spineDepth),
      stockMat
    );
    spine.position.x = -width / 2 - board / 2;
    spine.castShadow = true;
    spine.receiveShadow = true;
    book.add(spine);

    pickMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    pickMesh.position.z = front.position.z + board / 2 + 0.001;
    book.add(pickMesh);

    ground.position.y = -height / 2 - 0.001;
    built = { edition, pages, width, height, depth: depth + board * 2 };

    placeCamera(false);
  }

  function placeCamera(keepDirection) {
    if (!built) return;
    const radius = 0.5 * Math.hypot(built.width, built.height, built.depth);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(camera.aspect || 1, 0.6);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distance = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * 1.72;
    controls.minDistance = radius * 1.15;
    controls.maxDistance = distance * 3.2;
    controls.target.set(0, built.height * 0.02, 0);
    const offset = camera.position.clone().sub(controls.target);
    const direction = keepDirection && frameReady && offset.lengthSq() > 1e-6
      ? offset.normalize()
      : new THREE.Vector3(0.28, 0.05, 1).normalize();
    const next = keepDirection && frameReady
      ? Math.max(offset.length(), distance)
      : distance;
    camera.position.copy(controls.target).add(direction.multiplyScalar(next));
    controls.update();
    frameReady = true;
  }

  function resize() {
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(Math.floor(width * dpr), Math.floor(height * dpr), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    placeCamera(true);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(view);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
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
    fit() {
      resize();
      placeCamera(false);
    },
    sync({ edition, pages }) {
      const nextPages = Math.round(pages);
      if (!built || built.edition !== edition || built.pages !== nextPages) {
        rebuild(edition, nextPages);
      }
      applyLook(edition);
      coverMap.needsUpdate = true;
      if (edition === "penguin") {
        roughMap.needsUpdate = true;
        coatMap.needsUpdate = true;
      }
    },
  };
}
