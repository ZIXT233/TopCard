import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const svg = await readFile(resolve(root, 'public/icons/topcard-mark.svg'));
for (const [size, paths] of [
  [192, ['public/icons/topcard-192.png', 'public/icons/icon-192.png']],
  [512, ['public/icons/topcard-512.png', 'public/icons/icon-512.png', 'desktop/app-icon.png']],
  [180, ['public/icons/topcard-apple-touch-icon.png', 'public/icons/apple-touch-icon.png']],
  [32, ['desktop/tray.png']],
]) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  for (const path of paths) await writeFile(resolve(root, path), png);
}
// ICO supports PNG frames; include small native frames and a 256px Windows icon.
const sizes = [16, 32, 48, 256];
const frames = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const start = 6 + index * 16;
  header[start] = header[start + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, start + 4);
  header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(frame.length, start + 8);
  header.writeUInt32LE(offset, start + 12);
  offset += frame.length;
});
const ico = Buffer.concat([header, ...frames]);
await writeFile(resolve(root, 'app/favicon.ico'), ico);
await writeFile(resolve(root, 'desktop/app-icon.ico'), ico);
