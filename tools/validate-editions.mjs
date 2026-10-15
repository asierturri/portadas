import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "editions", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const ids = new Set();
let failures = 0;

for (const entry of manifest) {
  if (!entry.id || ids.has(entry.id)) {
    console.error(`ID vacío o repetido: ${entry.id || "(vacío)"}`);
    failures += 1;
    continue;
  }
  ids.add(entry.id);
  if (entry.kind !== "template") continue;

  try {
    const configPath = path.join(root, entry.config);
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (config.id !== entry.id) throw new Error(`id de config (${config.id}) no coincide con el manifiesto`);
    if (!(config.heightMm > 0)) throw new Error("heightMm debe ser mayor que cero");
    const composition = config.front?.composition;
    if (!["author-title-bands", "penguin-classics"].includes(composition)) {
      throw new Error(`composición no compatible: ${config.front?.composition}`);
    }
    for (const [surface, filename] of Object.entries(config.assets || {})) {
      await access(path.resolve(path.dirname(configPath), filename));
      if (!filename.toLowerCase().endsWith(".png")) throw new Error(`${surface} debe ser PNG`);
    }
    for (const [surface, filename] of Object.entries(config.material?.maps || {})) {
      await access(path.resolve(path.dirname(configPath), filename));
      if (!filename.toLowerCase().endsWith(".png")) throw new Error(`material.maps.${surface} debe ser PNG`);
    }
    if (composition === "author-title-bands") {
      const heightControl = config.front.controls?.find((control) => control.id === "authorBandHeight");
      if (!heightControl || !(heightControl.min <= heightControl.default && heightControl.default <= heightControl.max)) {
        throw new Error("authorBandHeight necesita min, default y max coherentes");
      }
      if (config.front.authorBand.heightControl !== heightControl.id || config.front.authorBand.width !== 1) {
        throw new Error("La banda del autor debe tener ancho fijo y vincular el control de altura");
      }
      const spineAuthor = config.spine?.text?.find((item) => item.field === "author");
      const spineTitle = config.spine?.text?.find((item) => item.field === "title");
      if (spineAuthor?.font !== config.front.authorBand.font || spineTitle?.font !== config.front.titleBand.font) {
        throw new Error("La tipografía del autor y título del lomo debe coincidir con la portada");
      }
    } else if (!config.front.author?.font || !config.front.title?.font || !config.back?.quote || !config.back?.copy) {
      throw new Error("Penguin Classics necesita estilos de autor, título, cita y sinopsis");
    }
    if (config.back?.authorPhoto) {
      const { x, y, size, maxHeight } = config.back.authorPhoto;
      if (![x, y, size, maxHeight].every(Number.isFinite) || size <= 0 || maxHeight <= 0) {
        throw new Error("back.authorPhoto necesita x, y, size y maxHeight válidos");
      }
      if (!(config.back.copy?.width > 0) || !(config.back.bands?.width > 0)) {
        throw new Error("Una contraportada con retrato necesita copy y bandas configurados");
      }
    }
    const slices = config.spine?.slices;
    if (!slices || !(0 <= slices.leftEnd && slices.leftEnd < slices.rightStart && slices.rightStart <= 1)) {
      throw new Error("spine.slices debe tener 0 <= leftEnd < rightStart <= 1");
    }
    console.log(`OK ${entry.id}: ${entry.config}`);
  } catch (error) {
    failures += 1;
    console.error(`ERROR ${entry.id}: ${error.message}`);
  }
}

if (failures) process.exitCode = 1;
