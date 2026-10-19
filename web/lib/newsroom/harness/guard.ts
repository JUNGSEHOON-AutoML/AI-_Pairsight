import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { CaseError } from "../model";

export const projectRoot = () => resolve(process.env.PAIRSIGHT_PROJECT_ROOT ?? join(process.cwd(), ".."));
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function protectionGuard(root = projectRoot()) {
  const path = join(root, "newsroom", "protected.json");
  const initial = readFileSync(path, "utf8");
  const manifest = JSON.parse(initial) as Record<string, string>;
  const check = () => {
    try {
      if (readFileSync(path, "utf8") !== initial || !Object.keys(manifest).length) throw Error();
      for (const [file, expected] of Object.entries(manifest)) {
        if (file.includes("..") || file.startsWith("/") || digest(readFileSync(join(root, file))) !== expected) throw Error();
      }
    } catch { throw new CaseError("protected_changed", "보호 파일 해시가 바뀌어 중단했어요. 사람이 변경 내용을 검토해야 해요."); }
  };
  check(); return check;
}
