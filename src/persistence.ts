export type SaveStatus = "saved" | "pending" | "error";
/** Serializes writes so an older, slow write cannot overwrite newer edits. */
export class Persistence<T> {
  private latest: T | undefined;
  private revision = 0;
  private written = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();
  constructor(
    private write: (value: T) => Promise<void>,
    private status: (value: SaveStatus) => void,
  ) {}
  schedule(value: T) {
    this.latest = value;
    this.revision++;
    this.status("pending");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, 350);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.latest === undefined || this.written === this.revision)
      return this.chain;
    const value = this.latest,
      revision = this.revision;
    this.chain = this.chain
      .catch(() => {})
      .then(async () => {
        if (this.written >= revision) return;
        try {
          await this.write(value);
          this.written = revision;
          if (revision === this.revision) this.status("saved");
        } catch (error) {
          this.status("error");
          throw error;
        }
      });
    return this.chain;
  }
}
