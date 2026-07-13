import {deflateSync} from "node:zlib";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SIZE = 1024;
const pixels = Buffer.alloc(SIZE * SIZE * 4);

function insideRoundRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true;
  if (x >= left && x <= right && y >= top + radius && y <= bottom - radius) return true;
  const cx = x < left + radius ? left + radius : right - radius;
  const cy = y < top + radius ? top + radius : bottom - radius;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function paint(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const index = (y * SIZE + x) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = a;
}

function fillRoundRect(left, top, width, height, radius, color) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (insideRoundRect(x, y, left, top, width, height, radius)) paint(x, y, color);
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

fillRoundRect(24, 24, 976, 976, 216, [21, 70, 57, 255]);
fillRoundRect(225, 172, 574, 680, 76, [248, 249, 244, 255]);
fillRoundRect(302, 264, 420, 44, 22, [200, 211, 204, 255]);
fillRoundRect(302, 346, 270, 44, 22, [200, 211, 204, 255]);
fillRoundRect(302, 648, 92, 112, 22, [77, 132, 111, 255]);
fillRoundRect(426, 552, 92, 208, 22, [77, 132, 111, 255]);
fillRoundRect(550, 460, 92, 300, 22, [234, 108, 83, 255]);
fillRoundRect(674, 676, 44, 84, 22, [200, 211, 204, 255]);

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0;
  pixels.copy(raw, row + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, {level: 9})),
  chunk("IEND", Buffer.alloc(0))
]);
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "icon.png");
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, png);
console.log(output);
