/**
 * Payload sent to Tauri remote-sniffer commands.
 */
export interface RemoteSnifferConfig {
  sshHost: string;
  sshPort: number;
  remoteDirectory: string;
  remoteStartCommand: string;
  localPort: number;
  remotePort: number;
}

export interface RemoteSnifferCheckResult {
  ok: boolean;
  nodeVersion?: string;
  yarnAvailable: boolean;
  directoryWritable: boolean;
  messages: string[];
}

export interface RemoteSnifferStatus {
  running: boolean;
}

export interface RemoteSnifferCommandResult {
  ok: boolean;
  message: string;
}
