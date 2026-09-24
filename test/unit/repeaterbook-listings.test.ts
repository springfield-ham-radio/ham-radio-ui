import { describe, expect, it } from 'vitest';
import { Frequency, RadioToneType } from '@springfield/ham-radio-api';
import {
  applyRepeaterBookListings,
  parseRepeaterBookSearchHtml,
  repeaterBookSearches,
} from '../../app/utils/repeaterbook-listings.ts';
import type { ParsedRepeater } from '../../app/utils/repeater-import.ts';

const html = `
<tr>
  <td></td>
  <!-- Frequency + Offset -->
  <td class="freq"><a>146.9400</a> <span>-</span></td>
  <!-- Call -->
  <td>W5KA</td>
  <!-- Use -->
  <td><span class="badge">OPEN</span></td>
  <!-- Operational Status Icon -->
  <td><span title="Operational">🟢</span></td>
</tr>
<tr>
  <td></td>
  <!-- Frequency + Offset -->
  <td class="freq"><a>443.9500</a></td>
  <!-- Call -->
  <td>AI5TX</td>
  <!-- Use -->
  <td><span class="badge">CLOSED</span></td>
  <!-- Operational Status Icon -->
  <td><span title="Not Operational">🔴</span></td>
</tr>
`;

function repeater(callsign: string, receiveHz: number): ParsedRepeater {
  return {
    sourceKey: callsign,
    sourceFormat: 'repeaterbook',
    callsign,
    city: 'Austin - Buckman Mtn',
    state: 'Texas',
    receiveFrequency: Frequency(receiveHz),
    transmitFrequency: Frequency(receiveHz),
    transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    receiveTone: { tone: 0, type: RadioToneType.CTCSS },
  };
}

describe('repeaterbook-listings', () => {
  it('reads Use and operational status from a RepeaterBook results page', () => {
    const listings = parseRepeaterBookSearchHtml(html);

    expect(listings).toEqual([
      { callsign: 'W5KA', receiveHz: 146_940_000, use: 'open', onAir: true },
      { callsign: 'AI5TX', receiveHz: 443_950_000, use: 'closed', onAir: false },
    ]);
  });

  it('fills missing Use and On-air by call sign and output frequency', () => {
    const [filled] = applyRepeaterBookListings([repeater('W5KA', 146_940_000)], parseRepeaterBookSearchHtml(html));

    expect(filled?.use).toBe('open');
    expect(filled?.onAir).toBe(true);
  });

  it('looks up each city once', () => {
    const searches = repeaterBookSearches([
      repeater('W5KA', 146_940_000),
      { ...repeater('KE5RS', 441_600_000), city: 'Leander' },
    ]);

    expect(searches.map((search) => search.city)).toEqual(['Austin', 'Leander']);
    expect(searches[0]?.url).toContain('state_id=48');
    expect(searches[0]?.url).toContain('loc=Austin');
  });
});
