import { cp, mkdir } from "node:fs/promises";

const source = new URL("./media/", import.meta.resolve("blockly"));
// Shared media URL for the development server and deployed build.
const destination = new URL("../static/media/", import.meta.url);

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
