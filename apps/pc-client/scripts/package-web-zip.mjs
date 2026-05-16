import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pcClientDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(pcClientDir, "../..");
const releaseRoot = path.resolve(pcClientDir, "release/web-zip");
const packageDir = path.resolve(releaseRoot, "stellar-frontier-web");
const zipPath = path.resolve(releaseRoot, "stellar-frontier-web.zip");

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crc32Table = makeCrc32Table();

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function listFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = path.join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function createZipFromDirectory(rootDir, outputPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const filePath of listFiles(rootDir)) {
    const relativeName = path.relative(rootDir, filePath).split(path.sep).join("/");
    const nameBuffer = Buffer.from(relativeName, "utf8");
    const data = readFileSync(filePath);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const { dosDate, dosTime } = dosDateTime(statSync(filePath).mtime);
    const flags = 0x0800;
    const method = 8;

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(flags),
      uint16(method),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(compressed.length),
      uint32(data.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer,
    ]);

    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(flags),
      uint16(method),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(compressed.length),
      uint32(data.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBuffer,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(centralParts.length),
    uint16(centralParts.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);

  writeFileSync(outputPath, Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]));
}

const readme = `Stellar Frontier 网页在线试玩包
================================

这个 ZIP 包只包含 PC 游戏客户端。
它不包含 Editor，也不包含手机 companion 客户端。

上传说明：

1. 请上传 stellar-frontier-web.zip。
2. ZIP 根目录中已经包含 index.html。
3. ZIP 根目录中也包含完整游戏资源 assets/。
4. 文件大小小于 1000MB。

本地检查方式：

1. 解压 ZIP。
2. 确认解压后的根目录能直接看到 index.html。
3. 如果平台支持网页在线试玩，可以直接上传这个 ZIP。
`;

run(process.execPath, [
  path.resolve(repoRoot, "common/scripts/install-run-rush-pnpm.js"),
  "run",
  "--filter",
  "@stellar-frontier/pc-client",
  "build:web",
]);

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
cpSync(path.resolve(pcClientDir, "dist"), packageDir, { recursive: true });
writeFileSync(path.resolve(packageDir, "README.txt"), readme, "utf8");
createZipFromDirectory(packageDir, zipPath);

console.log(`Web package folder written to ${packageDir}`);
console.log(`Web package ZIP written to ${zipPath}`);
