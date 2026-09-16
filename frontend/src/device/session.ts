export function deviceSource(dev: boolean, hostname: string, target: string): "dummy" | "sse" {
  if (dev) return target ? "sse" : "dummy";
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? "dummy" : "sse";
}
export class DeviceRevisions {
  bootId = "";
  private revisions = new Map<string, number>();
  reset(bootId: string, revision: number, ids: string[]) {
    this.bootId = bootId; this.revisions = new Map(ids.map((id) => [id, revision]));
  }
  accept(bootId: string, revision: number, id: string) {
    if (bootId !== this.bootId || !Number.isInteger(revision) || revision < (this.revisions.get(id) ?? 0)) return false;
    this.revisions.set(id, revision); return true;
  }
}
