import type { RadioChannel, RadioProgrammedChannel } from '@springfield/ham-radio-api';
import type { ParsedSavedChannelsCsv } from '~/utils/saved-channels-csv';
import type { SavedChannel } from '~/utils/saved-channels-db';

/**
 * Where a channel transfer comes from or goes to.
 *
 * `online` is unused by the built-in entries. Phase 5 registers a RepeaterBook
 * source in this category and reads {@link ImportExportHandlerInput.token}.
 */
export type ImportExportCategory = 'file' | 'radio' | 'online';

/** `source` brings channels in. `target` sends channels out. */
export type ImportExportKind = 'source' | 'target';

/**
 * File types a picker can offer for this entry.
 * Extensions are compared without a leading dot, case-insensitively.
 */
export interface ImportExportFileType {
  extensions: readonly string[];
  mimeTypes?: readonly string[];
  /** Dialog filter label, for example "CSV" or "Radio Memory". */
  description?: string;
}

/**
 * Facts an entry uses to decide whether it can run.
 * Phase 3 pickers pass the same object. Phase 5 sets `token`.
 */
export interface ImportExportAvailabilityContext {
  /** A radio card is open and can receive a memory image. */
  radioOpen: boolean;
  /** The radio that would receive the transfer has a memory image loaded. */
  memoryLoaded: boolean;
  /** Desktop shell. Browser file pickers still work for CSV and memory JSON. */
  tauri: boolean;
  /**
   * False when the loaded radio cannot accept a memory write.
   * Omit when the caller has not resolved a radio yet.
   */
  writeSupported?: boolean;
  /** The channel library group on screen cannot accept imports. */
  libraryLocked?: boolean;
  /**
   * Phase 5 per-user credential.
   * Online sources stay unavailable until the caller supplies one.
   * The registry does not store the token.
   */
  token?: string;
}

/**
 * What a handler receives.
 *
 * File sources read {@link file}. File targets read {@link savedChannels}.
 * Radio memory transfers pass {@link channels} or {@link programmedChannels}.
 * Phase 4 can pass CHIRP `.img` bytes on {@link file} without a new field.
 */
export interface ImportExportHandlerInput {
  /** Portable channels a target accepts. */
  channels?: readonly RadioChannel[];
  /**
   * Library rows for targets that must keep notes, kind, and repeater fields.
   * CSV export reads this.
   */
  savedChannels?: readonly SavedChannel[];
  /** Library channels already assigned to memory slots. */
  programmedChannels?: readonly RadioProgrammedChannel[];
  /**
   * Radio card that should receive the transfer.
   * Omit to follow the focused card, which is what the Radio menu does.
   */
  sessionId?: string;
  file?: ImportExportFilePayload;
  /**
   * Phase 5 per-user credential for an online source.
   * Built-in entries ignore it.
   */
  token?: string;
}

/** File contents a source parses or a caller already picked. */
export interface ImportExportFilePayload {
  name?: string;
  text?: string;
  bytes?: Uint8Array;
}

/**
 * What a handler returns.
 *
 * File sources set {@link document}. File targets set {@link text} when they
 * serialize instead of writing a path themselves.
 */
export interface ImportExportHandlerResult {
  /** Channels produced by a source, or echoed by a CSV target. */
  document?: ParsedSavedChannelsCsv;
  /** Serialized file text. CSV export returns this and the caller opens the save dialog. */
  text?: string;
  /** The user dismissed a picker or confirm, or the action did not run. */
  cancelled?: boolean;
  /** How many channels the action wrote, when it reports a count. */
  count?: number;
}

export type ImportExportHandler = (
  input: ImportExportHandlerInput,
) => ImportExportHandlerResult | Promise<ImportExportHandlerResult>;

/**
 * One import source or export target.
 *
 * Phase 3 renders a picker from these fields. Phase 4 adds a CHIRP `.img`
 * source with `fileTypes`. Phase 5 adds an `online` source. Neither needs a
 * new field on this type.
 */
export interface ImportExportDefinition {
  /** Stable id. Menu event names in `src-tauri/src/lib.rs` use the same ids. */
  id: string;
  /** Short label. Buttons use this when it is already the visible text. */
  label: string;
  icon: string;
  kind: ImportExportKind;
  category: ImportExportCategory;
  /**
   * Nuxt UI shortcut (`meta_shift_d`).
   * The native menu accelerator for the same chord lives in `src-tauri/src/lib.rs`.
   */
  shortcut?: string;
  fileTypes?: readonly ImportExportFileType[];
  /**
   * Return true when the entry can run, or a reason string when it cannot.
   * Omit to treat the entry as always available.
   * False also means unavailable.
   */
  available?: (context: ImportExportAvailabilityContext) => boolean | string;
  /**
   * Data handler. File entries convert the channel document.
   * Radio and memory entries delegate to the action bound at startup, which
   * opens the existing dialogs. Those flows decode channels inside the radio
   * session because that needs the installed driver codec.
   */
  handler: ImportExportHandler;
}

export interface ImportExportListFilter {
  kind?: ImportExportKind;
  category?: ImportExportCategory;
  /** When set, entries that fail `available` are dropped unless `availableOnly` is false. */
  context?: ImportExportAvailabilityContext;
  availableOnly?: boolean;
}

export interface ImportExportMatchQuery extends ImportExportListFilter {
  /** Keep entries whose file types include this file's extension. */
  fileName?: string;
  /** Keep entries whose file types include this MIME type. */
  mimeType?: string;
}
