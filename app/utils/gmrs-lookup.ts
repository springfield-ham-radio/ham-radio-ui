export interface GmrsLookupStatusEvent {
  value: string;
  created_at: string;
}

export interface GmrsLookupResponse {
  id: number;
  type: string;
  callsign: string;
  name?: string;
  full_name?: string;
  status: string;
  service: string;
  city?: string | null;
  state?: string | null;
  frn?: number | string | null;
  is_active: boolean;
  statuses?: GmrsLookupStatusEvent[];
}

export type GmrsLookupResult =
  | {
      found: true;
      license: GmrsLookupResponse;
    }
  | {
      found: false;
    };

/**
 * Fetches a US GMRS license from the Skywave ULS mirror.
 *
 * GMRS is FCC radio service ZA. A 404 means the call sign is not in the
 * database. Active grants have is_active true and status A.
 */
export async function fetchGmrsLicense(callSign: string): Promise<GmrsLookupResult> {
  const normalized = callSign.trim().toUpperCase();

  if (!normalized) {
    throw new Error('Call sign is required');
  }

  const response = await fetch(`https://gmrslookup.skywave.org/${encodeURIComponent(normalized)}`);

  if (response.status === 404) {
    return { found: false };
  }

  if (!response.ok) {
    throw new Error(`GMRS lookup failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GmrsLookupResponse;

  return {
    found: true,
    license: payload,
  };
}
