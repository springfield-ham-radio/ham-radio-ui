import { RadioProgressIndicator } from "@springfield/ham-radio-api";
import { WebContents, ipcMain } from "electron";

export class ElectronRadioProgressIndicator implements RadioProgressIndicator {
  public isCanceled = false;
  private webContents: WebContents;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    ipcMain.handle("radioCancel", () => (this.isCanceled = true));
  }

  public setValue(value: number): void {
    this.webContents.send("radio-progress-indicator", value);
  }

  public reset(): void {
    this.isCanceled = false;
  }
}
