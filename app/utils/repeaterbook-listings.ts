import { parseFrequencyMHz } from '~/utils/channel-edit';
import { repeaterOnAirFromStatus, repeaterUseFromLabel, type ParsedRepeater } from '~/utils/repeater-import';
import type { RepeaterUse } from '~/utils/saved-channels-db';

const US_STATE_IDS: Record<string, string> = {
  alabama: '01',
  alaska: '02',
  arizona: '04',
  arkansas: '05',
  california: '06',
  colorado: '08',
  connecticut: '09',
  delaware: '10',
  'district of columbia': '11',
  florida: '12',
  georgia: '13',
  hawaii: '15',
  idaho: '16',
  illinois: '17',
  indiana: '18',
  iowa: '19',
  kansas: '20',
  kentucky: '21',
  louisiana: '22',
  maine: '23',
  maryland: '24',
  massachusetts: '25',
  michigan: '26',
  minnesota: '27',
  mississippi: '28',
  missouri: '29',
  montana: '30',
  nebraska: '31',
  nevada: '32',
  'new hampshire': '33',
  'new jersey': '34',
  'new mexico': '35',
  'new york': '36',
  'north carolina': '37',
  'north dakota': '38',
  ohio: '39',
  oklahoma: '40',
  oregon: '41',
  pennsylvania: '42',
  'rhode island': '44',
  'south carolina': '45',
  'south dakota': '46',
  tennessee: '47',
  texas: '48',
  utah: '49',
  vermont: '50',
  virginia: '51',
  washington: '53',
  'west virginia': '54',
  wisconsin: '55',
  wyoming: '56',
};

export interface RepeaterBookListing {
  callsign: string;
  receiveHz: number;
  use?: RepeaterUse;
  onAir?: boolean;
}

export interface RepeaterBookSearch {
  city: string;
  stateId: string;
  url: string;
}

/**
 * City name RepeaterBook uses for a location search. Landmark text after " - " is dropped.
 */
export function repeaterBookSearchCity(location: string | undefined): string | undefined {
  const city = location?.split(' - ')[0]?.trim();
  return city ? city : undefined;
}

export function repeaterBookStateId(state: string | undefined): string | undefined {
  const key = state?.trim().toLowerCase();
  return key ? US_STATE_IDS[key] : undefined;
}

/**
 * One public city search covers every repeater in that city, including Use and operational status.
 */
export function repeaterBookSearches(repeaters: readonly ParsedRepeater[]): RepeaterBookSearch[] {
  const searches = new Map<string, RepeaterBookSearch>();

  for (const repeater of repeaters) {
    if (repeater.use !== undefined && repeater.onAir !== undefined) {
      continue;
    }

    const city = repeaterBookSearchCity(repeater.city);
    const stateId = repeaterBookStateId(repeater.state);

    if (!city || !stateId) {
      continue;
    }

    const key = `${stateId}:${city.toLowerCase()}`;

    if (!searches.has(key)) {
      const url = new URL('https://www.repeaterbook.com/repeaters/location_search.php');
      url.searchParams.set('loc', city);
      url.searchParams.set('state_id', stateId);
      url.searchParams.set('type', 'city');
      searches.set(key, { city, stateId, url: url.toString() });
    }
  }

  return [...searches.values()];
}

/**
 * Read call sign, output frequency, Use, and operational status from a RepeaterBook results page.
 */
export function parseRepeaterBookSearchHtml(html: string): RepeaterBookListing[] {
  const listings: RepeaterBookListing[] = [];

  for (const row of html.split(/<tr\b/i).slice(1)) {
    const frequency = sectionText(row, 'Frequency + Offset').match(/(\d+\.\d+)/);
    const callsign = sectionText(row, 'Call');
    const receiveHz = frequency ? parseFrequencyMHz(frequency[1]!) : undefined;

    if (!callsign || receiveHz === undefined) {
      continue;
    }

    const statusTitle = row.match(/title="(Operational|Not Operational|Testing|Unknown)"/i)?.[1];
    listings.push({
      callsign,
      receiveHz,
      use: repeaterUseFromLabel(sectionText(row, 'Use')),
      onAir: repeaterOnAirFromStatus(statusTitle === 'Operational' ? 'On-air' : statusTitle === 'Not Operational' ? 'Off-air' : undefined),
    });
  }

  return listings;
}

/**
 * Fill missing Use and On-air values from RepeaterBook listings. Existing values stay put.
 */
export function applyRepeaterBookListings(
  repeaters: readonly ParsedRepeater[],
  listings: readonly RepeaterBookListing[],
): ParsedRepeater[] {
  const byKey = new Map<string, RepeaterBookListing>();

  for (const listing of listings) {
    byKey.set(listingKey(listing.callsign, listing.receiveHz), listing);
  }

  return repeaters.map((repeater) => {
    const listing = byKey.get(listingKey(repeater.callsign, repeater.receiveFrequency));

    if (!listing) {
      return repeater;
    }

    return {
      ...repeater,
      use: repeater.use ?? listing.use,
      onAir: repeater.onAir ?? listing.onAir,
    };
  });
}

export async function fillRepeaterBookUseAndOnAir(
  repeaters: readonly ParsedRepeater[],
  fetchHtml: (url: string) => Promise<string>,
): Promise<ParsedRepeater[]> {
  const listings: RepeaterBookListing[] = [];

  for (const search of repeaterBookSearches(repeaters)) {
    try {
      listings.push(...parseRepeaterBookSearchHtml(await fetchHtml(search.url)));
    } catch {
      // A failed lookup leaves Use and On-air unset for that city.
    }
  }

  return applyRepeaterBookListings(repeaters, listings);
}

function listingKey(callsign: string, receiveHz: number): string {
  return `${callsign.trim().toLowerCase()}|${receiveHz}`;
}

function sectionText(row: string, comment: string): string {
  const pattern = new RegExp(`<!--\\s*${comment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->([\\s\\S]*?)(?=<!--|$)`, 'i');
  const section = row.match(pattern)?.[1] ?? '';
  return section
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
