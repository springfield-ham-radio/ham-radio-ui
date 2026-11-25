import { snifferPacketsFromSerialLog, type SnifferPacket } from '~/utils/sniffer-capture';

/**
 * Build Debug-tab traffic packets only while that tab is active so we do not
 * walk thousands of driver log frames on every reactive flush.
 */
export function serialDebugPacketsWhenActive(active: boolean, log: unknown): SnifferPacket[] {
  if (!active) {
    return [];
  }

  return snifferPacketsFromSerialLog(log);
}