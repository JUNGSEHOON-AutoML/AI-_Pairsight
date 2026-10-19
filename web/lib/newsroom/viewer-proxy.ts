/** Fixed localhost destination; no arbitrary proxy, runtime endpoints or write operations. */
export function viewerTarget(path: string[], portValue = process.env.PAIRSIGHT_CLAW3D_PORT ?? "3460") {
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) return null;
  if (!path.length || path.some(p => !/^[a-zA-Z0-9_.~-]+$/.test(p) || p === "." || p === "..")) return null;
  const route = path.join("/");
  if (route !== "newsroom" && !(path[0] === "_next" && path[1] === "static" && path.length > 2)) return null;
  return `http://127.0.0.1:${port}/controlroom/${route}`;
}
