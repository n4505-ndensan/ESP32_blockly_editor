import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const projectDir = fileURLToPath(new URL("../../", import.meta.url));
const sourceDir = resolve(projectDir, "frontend/dist");
const outputDir = resolve(projectDir, "data/web");
const compressExtensions = new Set([".html", ".js", ".css"]);
const files = [];
let originalBytes = 0;

async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix + entry.name;
    const sourcePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(sourcePath, relativePath + "/");
      continue;
    }
    if (!entry.isFile()) throw new Error(`Unsupported build entry: ${sourcePath}`);

    const original = await readFile(sourcePath);
    const compressed = compressExtensions.has(extname(entry.name))
      ? gzipSync(original, { level: 9 })
      : original;
    const useGzip = compressed.length < original.length;
    const targetPath = relativePath + (useGzip ? ".gz" : "");

    originalBytes += original.length;
    files.push({ path: targetPath, content: useGzip ? compressed : original });
  }
}

// Validate the entire build before replacing the generated deployment directory.
await readFile(join(sourceDir, "index.html"));
await collect(sourceDir);
if (outputDir !== join(projectDir, "data", "web")) {
  throw new Error("Unexpected deployment directory");
}
await rm(outputDir, { recursive: true, force: true });
for (const file of files) {
  const target = join(outputDir, file.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, file.content);
}
const packedBytes = files.reduce((sum, file) => sum + file.content.length, 0);
console.log(`Web assets: ${originalBytes} -> ${packedBytes} bytes (data/web/)`);
