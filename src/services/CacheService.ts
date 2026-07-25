import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export class CacheService {
  public async getInfo(directory: string): Promise<{ files: number; bytes: number }> {
    let files = 0; let bytes = 0;
    const visit = async (path: string): Promise<void> => {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) await visit(child); else { files += 1; bytes += (await stat(child)).size; }
      }
    };
    await visit(directory); return { files, bytes };
  }
  public async clean(directory: string): Promise<void> {
    const entries = await readdir(directory); await Promise.all(entries.map((entry) => rm(join(directory, entry), { recursive: true, force: true })));
  }
}
