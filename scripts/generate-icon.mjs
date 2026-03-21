import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pngToIco from "png-to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "src-tauri", "icons");
const svgPath = join(iconsDir, "icon.svg");

const svgBuffer = readFileSync(svgPath);

// Windows ICO needs multiple resolutions
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngPaths = [];

for (const size of sizes) {
  const pngBuf = await sharp(svgBuffer, { density: 300 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const pngPath = join(iconsDir, `icon-${size}.png`);
  writeFileSync(pngPath, pngBuf);
  pngPaths.push(pngPath);
  console.log(`Created icon-${size}.png`);
}

// Create multi-resolution ICO
const icoBuffer = await pngToIco(pngPaths);
writeFileSync(join(iconsDir, "icon.ico"), icoBuffer);
console.log("Created icon.ico (multi-resolution)");

console.log("Done!");
