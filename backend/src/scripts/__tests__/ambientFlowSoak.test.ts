import fs from "fs";
import os from "os";
import path from "path";
import { resolveExistingPath } from "../ambientFlowSoak";

describe("resolveExistingPath", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ambient-flow-soak-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("returns an absolute path unchanged (normalized)", () => {
    const dir = makeTempDir();
    const absolutePath = path.join(dir, "audio.wav");
    fs.writeFileSync(absolutePath, "wav");

    expect(resolveExistingPath(absolutePath, [dir])).toBe(path.normalize(absolutePath));
  });

  it("resolves relative path from the first root when it exists", () => {
    const firstRoot = makeTempDir();
    const relativePath = path.join("fixtures", "audio.wav");
    const resolved = path.join(firstRoot, relativePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, "wav");

    expect(resolveExistingPath(relativePath, [firstRoot, makeTempDir()])).toBe(resolved);
  });

  it("falls back to a later root when the first root does not contain the file", () => {
    const firstRoot = makeTempDir();
    const secondRoot = makeTempDir();
    const relativePath = path.join("backend", "compliance", "evidence", "ambient-sample.wav");
    const resolved = path.join(secondRoot, relativePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, "wav");

    expect(resolveExistingPath(relativePath, [firstRoot, secondRoot])).toBe(resolved);
  });

  it("uses the first root when the path does not exist in any root", () => {
    const firstRoot = makeTempDir();
    const secondRoot = makeTempDir();
    const relativePath = path.join("missing", "audio.wav");

    expect(resolveExistingPath(relativePath, [firstRoot, secondRoot])).toBe(path.resolve(firstRoot, relativePath));
  });
});
