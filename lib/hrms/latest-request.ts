/** Client request ordering only. Server authorization remains authoritative. */
export class LatestRequest {
  private active: AbortController | null = null;
  begin() {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    return {
      signal: controller.signal,
      current: () => this.active === controller && !controller.signal.aborted,
    };
  }
  cancel() {
    this.active?.abort();
    this.active = null;
  }
}
