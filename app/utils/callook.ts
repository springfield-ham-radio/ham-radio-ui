export type CallookStatus = 'VALID' | 'INVALID' | 'UPDATING';

export type CallookLicenseType = 'CLUB' | 'MILITARY' | 'RACES' | 'RECREATION' | 'PERSON';

export interface CallookResponse {
  status: CallookStatus;
  type?: CallookLicenseType | string;
  current?: {
    callsign: string;
    operClass: string;
  };
  previous?: {
    callsign: string;
    operClass: string;
  };
  trustee?: {
    callsign: string;
    name: string;
  };
  name?: string;
  location?: {
    latitude?: string;
    longitude?: string;
    gridsquare?: string;
  };
  otherInfo?: {
    grantDate?: string;
    expiryDate?: string;
    lastActionDate?: string;
    frn?: string;
    ulsUrl?: string;
  };
}

const UPDATING_RETRY_DELAY_MS = 2_000;
const UPDATING_MAX_ATTEMPTS = 3;

/**
 * Fetches US amateur license data from Callook.info for a call sign.
 *
 * Retries briefly when Callook reports UPDATING during its daily refresh.
 */
export async function fetchCallookLicense(callSign: string): Promise<CallookResponse> {
  const normalized = callSign.trim().toUpperCase();

  if (!normalized) {
    throw new Error('Call sign is required');
  }

  let attempt = 0;

  while (attempt < UPDATING_MAX_ATTEMPTS) {
    attempt += 1;

    const response = await fetch(`https://callook.info/${encodeURIComponent(normalized)}/json`);

    if (!response.ok) {
      throw new Error(`Callook lookup failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as CallookResponse;

    if (payload.status !== 'UPDATING') {
      return payload;
    }

    if (attempt < UPDATING_MAX_ATTEMPTS) {
      await delay(UPDATING_RETRY_DELAY_MS);
    } else {
      return payload;
    }
  }

  throw new Error('Callook lookup failed');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
