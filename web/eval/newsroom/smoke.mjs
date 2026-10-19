// Backwards-compatible entry point for the unified, isolated browser check.
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const result=spawnSync(process.execPath,["--import","tsx",fileURLToPath(new URL("./unified-smoke.mjs",import.meta.url))],{stdio:"inherit"});
process.exitCode=result.status??1;
