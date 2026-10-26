import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("./media/", import.meta.resolve("blockly"));
// Shared media URL for the development server and deployed build.
const destination = new URL("../static/media/", import.meta.url);

// Rebuild from scratch so excluded files do not linger from earlier copies.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
// Workspace sounds are disabled (`sounds: false`), so the audio files are never loaded.
await cp(source, destination, { recursive: true, filter: (path) => !String(path).endsWith(".mp3") });
