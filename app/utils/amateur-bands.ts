/**
 * U.S. amateur transmitting privileges for the Reference band chart.
 *
 * Legal source is 47 CFR Part 97, especially §§ 97.301, 97.303, 97.305,
 * 97.307, and 97.313, checked against the eCFR text on the verified-on date
 * in reference-sources.ts. The Table of Allocations, 47 CFR § 2.106, is the
 * binding sharing text; § 97.303 is the summary this chart cites.
 *
 * Ranges are half-open [startHz, endHz): the FCC upper edge is `endHz`.
 * Adjacent segments abut and do not overlap.
 *
 * This is not an ARRL band plan. Voluntary mode splits are not drawn.
 * The 7.075–7.100 MHz phone/image exception is data, not a default bar.
 *
 * The verified-on date lives in reference-sources.ts.
 * Maintenance: docs/reference.md.
 */

export type LicenseClassId = 'extra' | 'advanced' | 'general' | 'technician' | 'novice';

export type BandGroupId = 'lf-mf' | 'hf' | 'vhf-uhf' | 'microwave';

export type FrequencyUnit = 'kHz' | 'MHz' | 'GHz';

export type EmissionId = 'cw' | 'data' | 'phone' | 'image';

export type SegmentKind = 'span' | 'channel';

export type SegmentCategory = 'cw' | 'data' | 'phone' | 'mixed' | 'channel';

export type ClassFilter = LicenseClassId | 'all';

export interface LicenseClassInfo {
  id: LicenseClassId;
  label: string;
  short: string;
  grandfathered: boolean;
}

export const LICENSE_CLASSES: readonly LicenseClassInfo[] = [
  { id: 'extra', label: 'Amateur Extra', short: 'Extra', grandfathered: false },
  { id: 'advanced', label: 'Advanced', short: 'Advanced', grandfathered: true },
  { id: 'general', label: 'General', short: 'General', grandfathered: false },
  { id: 'technician', label: 'Technician', short: 'Technician', grandfathered: false },
  { id: 'novice', label: 'Novice', short: 'Novice', grandfathered: true },
];

export const LICENSE_CLASS_IDS: readonly LicenseClassId[] = LICENSE_CLASSES.map((entry) => entry.id);

export const BAND_GROUPS: readonly { id: BandGroupId; label: string }[] = [
  { id: 'lf-mf', label: 'LF and MF' },
  { id: 'hf', label: 'HF' },
  { id: 'vhf-uhf', label: 'VHF and UHF' },
  { id: 'microwave', label: 'Microwave and above' },
];

const GAE = ['general', 'advanced', 'extra'] as const satisfies readonly LicenseClassId[];
const T_UP = ['technician', 'general', 'advanced', 'extra'] as const satisfies readonly LicenseClassId[];
const NT = ['novice', 'technician'] as const satisfies readonly LicenseClassId[];

const CW = ['cw'] as const satisfies readonly EmissionId[];
const CW_DATA = ['cw', 'data'] as const satisfies readonly EmissionId[];
const CW_PHONE = ['cw', 'phone'] as const satisfies readonly EmissionId[];
const CW_PHONE_IMAGE = ['cw', 'phone', 'image'] as const satisfies readonly EmissionId[];
const ALL_MODES = ['cw', 'data', 'phone', 'image'] as const satisfies readonly EmissionId[];
const DATA_ONLY = ['data'] as const satisfies readonly EmissionId[];
const VHF_MIX = ['cw', 'phone', 'image', 'data'] as const satisfies readonly EmissionId[];

export interface BandSegment {
  kind: SegmentKind;
  startHz: number;
  /** Null only for the open-ended allocation above 275 GHz. */
  endHz: number | null;
  centerHz?: number;
  classes: readonly LicenseClassId[];
  emissions: readonly EmissionId[];
  /** Set when the limit is tighter than the default 1.5 kW PEP. */
  power?: string;
  footnotes: readonly string[];
  spreadSpectrum?: boolean;
}

export interface AmateurBand {
  id: string;
  name: string;
  group: BandGroupId;
  unit: FrequencyUnit;
  axisStartHz: number;
  /** Null when the allocation has no upper edge. */
  axisEndHz: number | null;
  /** Always-visible constraint. The bar alone is not the whole rule. */
  blurb?: string;
  segments: readonly BandSegment[];
}

export interface GeographicException {
  id: string;
  bandId: string;
  startHz: number;
  endHz: number;
  classes: readonly LicenseClassId[];
  emissions: readonly EmissionId[];
  summary: string;
}

export const BAND_FOOTNOTES: Record<string, string> = {
  'novice-hf-power':
    'Novice and Technician control operators: 200 W PEP on these HF segments (§97.313(c)(2)).',
  '10m-tech-phone':
    'On 28.3–28.5 MHz, Novice and Technician phone is J3E or R3E only. Image and data are not authorized there (§97.307(f)(10)).',
  '10m-fm': 'RTTY and data are not authorized from 29.0–29.7 MHz (§97.305). FM repeaters in this segment are phone.',
  '30m':
    '30 m is secondary to the fixed service. Stop if you cause harmful interference. 200 W PEP. No phone or image (§97.303(j), §97.305, §97.313(c)(1)).',
  '40m-broadcast':
    'On 7.2–7.3 MHz, do not cause harmful interference to international broadcasts intended for Region 1 or 3, and accept their interference (§97.303(i)).',
  '40m-geography':
    'Phone and image on 7.075–7.100 MHz are only for ITU Regions 1 and 3, and for Region 2 stations west of 130° west or south of 20° north (§97.305 and §97.307(f)(11)). That slice is not drawn. Novice and Technician stay CW-only there (§97.307(f)(9)).',
  '60m-segment':
    '5351.5–5366.5 kHz is secondary, General and above. Phone, RTTY, data, or CW, at most 2.8 kHz, 9.15 W ERP. It is not channelized (§97.303(h), §97.307(f)(14), §97.313(i)).',
  '60m-channel':
    'Centers 5332, 5348, 5373, and 5405 kHz are secondary and 100 W ERP. Phone 2K80J3E, data 2K80J2D, RTTY 60H0J2B, and CW 150HA1A on the center. The USB dial frequency is 1.5 kHz below the center. The drawn width is the 2.8 kHz emission mask, not a tuning range (§97.303(h), §2.106 footnote US23, §97.313(i)).',
  'lf-mf':
    '2200 m and 630 m: fixed stations only, not within 1 km of a power-line carrier on that band, and notify the Utilities Telecom Council at least 30 days before transmitting (§97.303(g)).',
  '2200-power':
    '2200 m: 1 W EIRP, transmitter power at most 1.5 kW PEP. Secondary to the services in §97.303(g)(3) (§97.313(k)).',
  '630-power':
    '630 m: 5 W EIRP, or 1 W EIRP in Alaska within 800 km of the Russian Federation. Transmitter power at most 500 W PEP. Secondary to the services in §97.303(g)(4) (§97.313(l)).',
  '219':
    '219–220 MHz is data only, for fixed point-to-point digital message forwarding, 50 W PEP. Not for other uses. Notify the ARRL at least 30 days ahead. Extra limits apply near AMTS coast stations. CW is not authorized (§97.303(l), §97.305, §97.313(h)).',
  'novice-222': 'Novice control operators: 25 W PEP on 222–225 MHz (§97.313(d)).',
  'novice-23': 'Novice: only 1270–1295 MHz, 5 W PEP (§97.301(e), §97.313(e)).',
  '70cm':
    'No transmission north of Line A on 420–430 MHz. Other geographic and 50 W PEP limits apply where §97.303(m) and §97.313(f) say so. The bar is the 420–450 MHz allocation, not a map of those limits.',
  '33cm':
    'No transmission from the Texas and New Mexico area in §97.303(n), or from outside the United States and its Region 2 insular areas. Four notches in parts of Colorado and Wyoming. 50 W PEP within 241 km of the White Sands boundary in §97.313(g). Accept ISM interference.',
  '23cm':
    'Do not cause harmful interference to the radionavigation and satellite services in §97.303(o), and accept their interference.',
  '13cm': '2310–2390 MHz is not an amateur allocation in §97.301. Sharing on the two segments: §97.303(p).',
  '5cm':
    'The Region 2 allocation is 5.650–5.925 GHz. Regions 1 and 3 stop at 5.850 GHz. On 5.850–5.925 GHz, protect fixed-satellite and Intelligent Transportation System operations (§97.303(r)).',
  ss: 'Where spread spectrum is authorized, those emissions are limited to 10 W PEP (§97.313(j)).',
  '4mm-power': 'On 76–81 GHz, peak EIRP is at most 316 W (§97.313(m)).',
  'above-275':
    'There is no upper edge above 275 GHz. §97.303(f) names radio-astronomy and passive-service segments that must not receive harmful interference. Those notches are not drawn.',
  '6m-cw': '50.0–50.1 MHz is CW only. Other §97.305 emissions start at 50.1 MHz. Test emissions start at 51 MHz.',
  '2m-cw': '144.0–144.1 MHz is CW only. Other §97.305 emissions start at 144.1 MHz.',
  'vhf-share':
    'Sharing is the §97.303 paragraph cited from §97.301. A secondary station must not cause harmful interference to a primary service and must accept interference from it.',
};

export const GEOGRAPHIC_EXCEPTIONS: readonly GeographicException[] = [
  {
    id: '40m-phone-7075',
    bandId: '40m',
    startHz: 7_075_000,
    endHz: 7_100_000,
    classes: GAE,
    emissions: ['phone', 'image'],
    summary:
      'Additional phone and image on 7.075–7.100 MHz, only in the places named in §97.307(f)(11). Not drawn on the default chart. Novice and Technician remain CW only.',
  },
];

interface SegmentExtras {
  power?: string;
  footnotes?: readonly string[];
  spreadSpectrum?: boolean;
}

function span(
  startHz: number,
  endHz: number | null,
  classes: readonly LicenseClassId[],
  emissions: readonly EmissionId[],
  extras: SegmentExtras = {},
): BandSegment {
  return {
    kind: 'span',
    startHz,
    endHz,
    classes,
    emissions,
    power: extras.power,
    footnotes: extras.footnotes ?? [],
    spreadSpectrum: extras.spreadSpectrum,
  };
}

/** 2.8 kHz mask centered on the assigned frequency. Not a tuning range. */
function channel(centerHz: number, classes: readonly LicenseClassId[]): BandSegment {
  return {
    kind: 'channel',
    startHz: centerHz - 1_400,
    endHz: centerHz + 1_400,
    centerHz,
    classes,
    emissions: ['cw', 'data', 'phone'],
    power: '100 W ERP',
    footnotes: ['60m-channel'],
  };
}

const NOV_HF: SegmentExtras = { power: '200 W PEP', footnotes: ['novice-hf-power'] };
const SS: SegmentExtras = { spreadSpectrum: true, footnotes: ['ss', 'vhf-share'] };

export const AMATEUR_BANDS: readonly AmateurBand[] = [
  {
    id: '2200m',
    name: '2200 m',
    group: 'lf-mf',
    unit: 'kHz',
    axisStartHz: 135_700,
    axisEndHz: 137_800,
    blurb: 'Fixed stations only, UTC notice, 1 W EIRP. General and above.',
    segments: [
      span(135_700, 137_800, GAE, ALL_MODES, {
        power: '1 W EIRP',
        footnotes: ['lf-mf', '2200-power'],
      }),
    ],
  },
  {
    id: '630m',
    name: '630 m',
    group: 'lf-mf',
    unit: 'kHz',
    axisStartHz: 472_000,
    axisEndHz: 479_000,
    blurb: 'Fixed stations only, UTC notice, 5 W EIRP (1 W EIRP in part of Alaska). General and above.',
    segments: [
      span(472_000, 479_000, GAE, ALL_MODES, {
        power: '5 W EIRP',
        footnotes: ['lf-mf', '630-power'],
      }),
    ],
  },
  {
    id: '160m',
    name: '160 m',
    group: 'lf-mf',
    unit: 'MHz',
    axisStartHz: 1_800_000,
    axisEndHz: 2_000_000,
    blurb: 'The whole band is CW, data, phone, and image for General and above. A CW-versus-phone split on 160 m is a voluntary band plan, not §97.305.',
    segments: [span(1_800_000, 2_000_000, GAE, ALL_MODES)],
  },
  {
    id: '80m',
    name: '80 m and 75 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 3_500_000,
    axisEndHz: 4_000_000,
    blurb: 'RTTY and data are the 80 m segment, 3.500–3.600 MHz. Phone and image are the 75 m segment where the class has the frequencies. CW is allowed on every frequency that class may use.',
    segments: [
      span(3_500_000, 3_600_000, ['extra'], CW_DATA),
      span(3_525_000, 3_600_000, ['advanced', 'general'], CW_DATA),
      span(3_525_000, 3_600_000, NT, CW, NOV_HF),
      span(3_600_000, 4_000_000, ['extra'], CW_PHONE_IMAGE),
      span(3_700_000, 4_000_000, ['advanced'], CW_PHONE_IMAGE),
      span(3_800_000, 4_000_000, ['general'], CW_PHONE_IMAGE),
    ],
  },
  {
    id: '60m',
    name: '60 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 5_330_500,
    axisEndHz: 5_406_400,
    blurb:
      'Not a continuous band. General and above may use 5351.5–5366.5 kHz at 9.15 W ERP, and only the centers 5332, 5348, 5373, and 5405 kHz at 100 W ERP. 5358.5 kHz is inside the 15 kHz segment; it is not a separate 100 W channel. Gaps on this axis are not authorized.',
    segments: [
      channel(5_332_000, GAE),
      channel(5_348_000, GAE),
      span(5_351_500, 5_366_500, GAE, ['cw', 'data', 'phone'], {
        power: '9.15 W ERP',
        footnotes: ['60m-segment'],
      }),
      channel(5_373_000, GAE),
      channel(5_405_000, GAE),
    ],
  },
  {
    id: '40m',
    name: '40 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 7_000_000,
    axisEndHz: 7_300_000,
    blurb: 'Drawn phone starts at 7.125 MHz. Phone and image on 7.075–7.100 MHz are a geographic exception and are not drawn.',
    segments: [
      span(7_000_000, 7_125_000, ['extra'], CW_DATA, { footnotes: ['40m-geography'] }),
      span(7_025_000, 7_125_000, ['advanced', 'general'], CW_DATA, { footnotes: ['40m-geography'] }),
      span(7_025_000, 7_125_000, NT, CW, { ...NOV_HF, footnotes: ['novice-hf-power', '40m-geography'] }),
      span(7_125_000, 7_300_000, ['extra', 'advanced'], CW_PHONE_IMAGE, { footnotes: ['40m-broadcast'] }),
      span(7_175_000, 7_300_000, ['general'], CW_PHONE_IMAGE, { footnotes: ['40m-broadcast'] }),
    ],
  },
  {
    id: '30m',
    name: '30 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 10_100_000,
    axisEndHz: 10_150_000,
    blurb: 'CW and data only. 200 W PEP. Secondary. General and above.',
    segments: [
      span(10_100_000, 10_150_000, GAE, CW_DATA, {
        power: '200 W PEP',
        footnotes: ['30m'],
      }),
    ],
  },
  {
    id: '20m',
    name: '20 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 14_000_000,
    axisEndHz: 14_350_000,
    segments: [
      span(14_000_000, 14_150_000, ['extra'], CW_DATA),
      span(14_025_000, 14_150_000, ['advanced', 'general'], CW_DATA),
      span(14_150_000, 14_350_000, ['extra'], CW_PHONE_IMAGE),
      span(14_175_000, 14_350_000, ['advanced'], CW_PHONE_IMAGE),
      span(14_225_000, 14_350_000, ['general'], CW_PHONE_IMAGE),
    ],
  },
  {
    id: '17m',
    name: '17 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 18_068_000,
    axisEndHz: 18_168_000,
    segments: [
      span(18_068_000, 18_110_000, GAE, CW_DATA),
      span(18_110_000, 18_168_000, GAE, CW_PHONE_IMAGE),
    ],
  },
  {
    id: '15m',
    name: '15 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 21_000_000,
    axisEndHz: 21_450_000,
    segments: [
      span(21_000_000, 21_200_000, ['extra'], CW_DATA),
      span(21_025_000, 21_200_000, ['advanced', 'general'], CW_DATA),
      span(21_025_000, 21_200_000, NT, CW, NOV_HF),
      span(21_200_000, 21_450_000, ['extra'], CW_PHONE_IMAGE),
      span(21_225_000, 21_450_000, ['advanced'], CW_PHONE_IMAGE),
      span(21_275_000, 21_450_000, ['general'], CW_PHONE_IMAGE),
    ],
  },
  {
    id: '12m',
    name: '12 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 24_890_000,
    axisEndHz: 24_990_000,
    segments: [
      span(24_890_000, 24_930_000, GAE, CW_DATA),
      span(24_930_000, 24_990_000, GAE, CW_PHONE_IMAGE),
    ],
  },
  {
    id: '10m',
    name: '10 m',
    group: 'hf',
    unit: 'MHz',
    axisStartHz: 28_000_000,
    axisEndHz: 29_700_000,
    segments: [
      span(28_000_000, 28_300_000, GAE, CW_DATA),
      span(28_000_000, 28_300_000, NT, CW_DATA, NOV_HF),
      span(28_300_000, 28_500_000, GAE, CW_PHONE_IMAGE),
      span(28_300_000, 28_500_000, NT, CW_PHONE, {
        power: '200 W PEP',
        footnotes: ['novice-hf-power', '10m-tech-phone'],
      }),
      span(28_500_000, 29_000_000, GAE, CW_PHONE_IMAGE),
      span(29_000_000, 29_700_000, GAE, CW_PHONE_IMAGE, { footnotes: ['10m-fm'] }),
    ],
  },
  {
    id: '6m',
    name: '6 m',
    group: 'vhf-uhf',
    unit: 'MHz',
    axisStartHz: 50_000_000,
    axisEndHz: 54_000_000,
    segments: [
      span(50_000_000, 50_100_000, T_UP, CW, { footnotes: ['6m-cw', 'vhf-share'] }),
      span(50_100_000, 54_000_000, T_UP, VHF_MIX, { footnotes: ['6m-cw', 'vhf-share'] }),
    ],
  },
  {
    id: '2m',
    name: '2 m',
    group: 'vhf-uhf',
    unit: 'MHz',
    axisStartHz: 144_000_000,
    axisEndHz: 148_000_000,
    segments: [
      span(144_000_000, 144_100_000, T_UP, CW, { footnotes: ['2m-cw', 'vhf-share'] }),
      span(144_100_000, 148_000_000, T_UP, VHF_MIX, { footnotes: ['2m-cw', 'vhf-share'] }),
    ],
  },
  {
    id: '1.25m',
    name: '1.25 m',
    group: 'vhf-uhf',
    unit: 'MHz',
    axisStartHz: 219_000_000,
    axisEndHz: 225_000_000,
    blurb: '220–222 MHz is not an amateur allocation. 219–220 MHz is data-only message forwarding, not general use.',
    segments: [
      span(219_000_000, 220_000_000, T_UP, DATA_ONLY, {
        power: '50 W PEP',
        footnotes: ['219'],
      }),
      span(222_000_000, 225_000_000, T_UP, VHF_MIX, SS),
      span(222_000_000, 225_000_000, ['novice'], VHF_MIX, {
        power: '25 W PEP',
        footnotes: ['novice-222', 'ss', 'vhf-share'],
        spreadSpectrum: true,
      }),
    ],
  },
  {
    id: '70cm',
    name: '70 cm',
    group: 'vhf-uhf',
    unit: 'MHz',
    axisStartHz: 420_000_000,
    axisEndHz: 450_000_000,
    blurb: 'The bar is 420–450 MHz. Line A and other geographic limits still apply.',
    segments: [
      span(420_000_000, 450_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['70cm', 'ss', 'vhf-share'],
      }),
    ],
  },
  {
    id: '33cm',
    name: '33 cm',
    group: 'vhf-uhf',
    unit: 'MHz',
    axisStartHz: 902_000_000,
    axisEndHz: 928_000_000,
    blurb: 'Secondary, with places and notches where transmission is forbidden or power-limited.',
    segments: [
      span(902_000_000, 928_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['33cm', 'ss', 'vhf-share'],
      }),
    ],
  },
  {
    id: '23cm',
    name: '23 cm',
    group: 'vhf-uhf',
    unit: 'MHz',
    axisStartHz: 1_240_000_000,
    axisEndHz: 1_300_000_000,
    segments: [
      span(1_240_000_000, 1_300_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['23cm', 'ss', 'vhf-share'],
      }),
      span(1_270_000_000, 1_295_000_000, ['novice'], VHF_MIX, {
        power: '5 W PEP',
        footnotes: ['novice-23', '23cm', 'ss'],
        spreadSpectrum: true,
      }),
    ],
  },
  {
    id: '13cm',
    name: '13 cm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 2_300_000_000,
    axisEndHz: 2_450_000_000,
    blurb: 'Two segments. 2310–2390 MHz is not allocated to the amateur service in §97.301.',
    segments: [
      span(2_300_000_000, 2_310_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['13cm', 'ss'],
      }),
      span(2_390_000_000, 2_450_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['13cm', 'ss'],
      }),
    ],
  },
  {
    id: '5cm',
    name: '5 cm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 5_650_000_000,
    axisEndHz: 5_925_000_000,
    segments: [
      span(5_650_000_000, 5_925_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['5cm', 'ss'],
      }),
    ],
  },
  {
    id: '3cm',
    name: '3 cm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 10_000_000_000,
    axisEndHz: 10_500_000_000,
    segments: [
      span(10_000_000_000, 10_500_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['ss', 'vhf-share'],
      }),
    ],
  },
  {
    id: '1.2cm',
    name: '1.2 cm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 24_000_000_000,
    axisEndHz: 24_250_000_000,
    segments: [
      span(24_000_000_000, 24_250_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['ss', 'vhf-share'],
      }),
    ],
  },
  {
    id: '6mm',
    name: '6 mm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 47_000_000_000,
    axisEndHz: 47_200_000_000,
    segments: [
      span(47_000_000_000, 47_200_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['ss'],
      }),
    ],
  },
  {
    id: '4mm',
    name: '4 mm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 76_000_000_000,
    axisEndHz: 81_000_000_000,
    segments: [
      span(76_000_000_000, 81_000_000_000, T_UP, VHF_MIX, {
        power: '316 W EIRP',
        spreadSpectrum: true,
        footnotes: ['4mm-power', 'ss'],
      }),
    ],
  },
  {
    id: '2.5mm',
    name: '2.5 mm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 122_250_000_000,
    axisEndHz: 123_000_000_000,
    segments: [
      span(122_250_000_000, 123_000_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['ss', 'vhf-share'],
      }),
    ],
  },
  {
    id: '2mm',
    name: '2 mm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 134_000_000_000,
    axisEndHz: 141_000_000_000,
    segments: [
      span(134_000_000_000, 141_000_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['ss'],
      }),
    ],
  },
  {
    id: '1mm',
    name: '1 mm',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 241_000_000_000,
    axisEndHz: 250_000_000_000,
    segments: [
      span(241_000_000_000, 250_000_000_000, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['ss'],
      }),
    ],
  },
  {
    id: 'above-275',
    name: 'Above 275 GHz',
    group: 'microwave',
    unit: 'GHz',
    axisStartHz: 275_000_000_000,
    axisEndHz: null,
    blurb: 'No upper edge. Passive-service and radio-astronomy limits in §97.303(f) are not drawn.',
    segments: [
      span(275_000_000_000, null, T_UP, VHF_MIX, {
        spreadSpectrum: true,
        footnotes: ['above-275', 'ss'],
      }),
    ],
  },
];

export function licenseClassInfo(id: LicenseClassId): LicenseClassInfo {
  const found = LICENSE_CLASSES.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`Unknown license class ${id}`);
  }

  return found;
}

export function bandById(id: string): AmateurBand {
  const found = AMATEUR_BANDS.find((band) => band.id === id);

  if (!found) {
    throw new Error(`Unknown band ${id}`);
  }

  return found;
}

export function formatHz(hz: number, unit: FrequencyUnit): string {
  const scale = unit === 'kHz' ? 1_000 : unit === 'MHz' ? 1_000_000 : 1_000_000_000;
  const rounded = Math.round((hz / scale) * 10_000) / 10_000;
  const text = rounded.toFixed(4).replace(/\.?0+$/, '');

  return `${text} ${unit}`;
}

export function emissionSummary(emissions: readonly EmissionId[]): string {
  const cw = emissions.includes('cw');
  const data = emissions.includes('data');
  const phone = emissions.includes('phone');
  const image = emissions.includes('image');
  const parts: string[] = [];

  if (cw) {
    parts.push('CW');
  }

  if (data) {
    parts.push('RTTY/data');
  }

  if (phone) {
    parts.push('phone');
  }

  if (image) {
    parts.push('image');
  }

  if (cw && parts.length === 1) {
    return 'CW only';
  }

  if (data && parts.length === 1) {
    return 'Data only';
  }

  return parts.join(', ');
}

export function segmentEmissionText(segment: BandSegment): string {
  const base = emissionSummary(segment.emissions);

  return segment.spreadSpectrum ? `${base}, SS` : base;
}

export function segmentCategory(segment: BandSegment): SegmentCategory {
  if (segment.kind === 'channel') {
    return 'channel';
  }

  const phone = segment.emissions.includes('phone');
  const data = segment.emissions.includes('data');

  if (phone && data) {
    return 'mixed';
  }

  if (phone) {
    return 'phone';
  }

  if (data) {
    return 'data';
  }

  return 'cw';
}

export function classSpans(band: AmateurBand, classId: LicenseClassId): BandSegment[] {
  return band.segments
    .filter((segment) => segment.kind === 'span' && segment.classes.includes(classId))
    .slice()
    .sort((left, right) => left.startHz - right.startHz);
}

export function channelCenters(band: AmateurBand, classId: LicenseClassId): number[] {
  return band.segments
    .filter((segment) => segment.kind === 'channel' && segment.classes.includes(classId) && segment.centerHz !== undefined)
    .map((segment) => segment.centerHz as number)
    .sort((left, right) => left - right);
}

/** Abutting spans merge. Channels are not included. */
export function frequencySpans(
  band: AmateurBand,
  classId: LicenseClassId,
): Array<{ startHz: number; endHz: number }> {
  const merged: Array<{ startHz: number; endHz: number }> = [];

  for (const segment of classSpans(band, classId)) {
    if (segment.endHz === null) {
      continue;
    }

    const last = merged[merged.length - 1];

    if (last && segment.startHz <= last.endHz) {
      last.endHz = Math.max(last.endHz, segment.endHz);
    } else {
      merged.push({ startHz: segment.startHz, endHz: segment.endHz });
    }
  }

  return merged;
}

export interface PrivilegeTextRow {
  bandId: string;
  band: string;
  range: string;
  classes: string;
  emissions: string;
  limits: string;
  notes: string;
  drawn: boolean;
}

function classList(ids: readonly LicenseClassId[]): string {
  return ids.map((id) => licenseClassInfo(id).short).join(', ');
}

function rangeLabel(band: AmateurBand, segment: BandSegment): string {
  if (segment.kind === 'channel' && segment.centerHz !== undefined) {
    const center = formatHz(segment.centerHz, band.unit);
    const dial = formatHz(segment.centerHz - 1_500, band.unit);

    return `Center ${center} (USB dial ${dial})`;
  }

  if (segment.endHz === null) {
    return `Above ${formatHz(segment.startHz, band.unit)}`;
  }

  return `${formatHz(segment.startHz, band.unit)} – ${formatHz(segment.endHz, band.unit)}`;
}

function noteMarks(ids: readonly string[], order: readonly string[]): string {
  return ids
    .map((id) => order.indexOf(id) + 1)
    .filter((number) => number > 0)
    .join(', ');
}

export function privilegeTextRows(filter: ClassFilter): PrivilegeTextRow[] {
  const order = usedFootnoteIds(filter);
  const rows: PrivilegeTextRow[] = [];

  for (const band of AMATEUR_BANDS) {
    for (const segment of band.segments) {
      const classes = segment.classes.filter((classId) => filter === 'all' || classId === filter);

      if (classes.length === 0) {
        continue;
      }

      rows.push({
        bandId: band.id,
        band: band.name,
        range: rangeLabel(band, segment),
        classes: classList(classes),
        emissions: segmentEmissionText(segment),
        limits: segment.power ?? '1.5 kW PEP',
        notes: noteMarks(segment.footnotes, order),
        drawn: true,
      });
    }
  }

  for (const exception of GEOGRAPHIC_EXCEPTIONS) {
    const classes = exception.classes.filter((classId) => filter === 'all' || classId === filter);

    if (classes.length === 0) {
      continue;
    }

    const band = bandById(exception.bandId);

    rows.push({
      bandId: exception.bandId,
      band: band.name,
      range: `${formatHz(exception.startHz, band.unit)} – ${formatHz(exception.endHz, band.unit)}`,
      classes: classList(classes),
      emissions: emissionSummary(exception.emissions),
      limits: exception.summary,
      notes: noteMarks(['40m-geography'], order),
      drawn: false,
    });
  }

  return rows;
}

export interface LaidSegment {
  startRatio: number;
  endRatio: number;
  category: SegmentCategory;
  label: string;
  title: string;
}

export interface LaidTrack {
  id: string;
  label: string;
  segments: LaidSegment[];
}

export interface LaidBand {
  tracks: LaidTrack[];
  omitted: string;
  ticks: Array<{ ratio: number; label: string }>;
}

function segmentSignature(segment: LaidSegment): string {
  return [
    segment.startRatio.toFixed(6),
    segment.endRatio.toFixed(6),
    segment.category,
    segment.label,
    segment.title,
  ].join('|');
}

function laySegment(band: AmateurBand, segment: BandSegment): LaidSegment {
  const open = band.axisEndHz === null || segment.endHz === null;
  const spanHz = open || band.axisEndHz === null ? 1 : band.axisEndHz - band.axisStartHz;
  const startRatio = open || band.axisEndHz === null ? 0 : (segment.startHz - band.axisStartHz) / spanHz;
  const endRatio = open || band.axisEndHz === null ? 1 : ((segment.endHz as number) - band.axisStartHz) / spanHz;
  const emission = segmentEmissionText(segment);
  const label = segment.kind === 'channel' && segment.centerHz !== undefined
    ? formatHz(segment.centerHz, band.unit)
    : segment.power
      ? `${emission} · ${segment.power}`
      : emission;
  const title = [rangeLabel(band, segment), emission, segment.power].filter(Boolean).join(' — ');

  return {
    startRatio,
    endRatio,
    category: segmentCategory(segment),
    label,
    title,
  };
}

function ticksFor(band: AmateurBand): Array<{ ratio: number; label: string }> {
  if (band.axisEndHz === null) {
    return [{ ratio: 0, label: `${formatHz(band.axisStartHz, band.unit)} and above` }];
  }

  const points = new Set<number>([band.axisStartHz, band.axisEndHz]);

  if (band.id === '60m') {
    points.add(5_351_500);
    points.add(5_366_500);
  }

  const spanHz = band.axisEndHz - band.axisStartHz;

  return [...points]
    .sort((left, right) => left - right)
    .map((hz) => ({
      ratio: (hz - band.axisStartHz) / spanHz,
      label: formatHz(hz, band.unit),
    }));
}

function omittedText(ids: readonly LicenseClassId[], filter: ClassFilter): string {
  if (filter !== 'all' && ids.length === 1) {
    return `No privileges for ${licenseClassInfo(ids[0]).label} on this band.`;
  }

  if (ids.length === 0) {
    return '';
  }

  const names = ids.map((id) => licenseClassInfo(id).short);

  return `No privileges on this band for ${names.join(', ')}.`;
}

export function layoutBand(band: AmateurBand, filter: ClassFilter): LaidBand {
  const classes = filter === 'all' ? LICENSE_CLASS_IDS : [filter];
  const tracks: LaidTrack[] = [];
  const omitted: LicenseClassId[] = [];

  for (const classId of classes) {
    const segments = band.segments.filter((segment) => segment.classes.includes(classId));

    if (segments.length === 0) {
      omitted.push(classId);
      continue;
    }

    tracks.push({
      id: classId,
      label: licenseClassInfo(classId).short,
      segments: segments.map((segment) => laySegment(band, segment)),
    });
  }

  const collapsed = collapseIdenticalTracks(tracks);

  return {
    tracks: collapsed,
    omitted: omittedText(omitted, filter),
    ticks: ticksFor(band),
  };
}

function collapseIdenticalTracks(tracks: LaidTrack[]): LaidTrack[] {
  const groups: LaidTrack[][] = [];

  for (const track of tracks) {
    const signature = track.segments.map(segmentSignature).join('~');
    const existing = groups.find((group) => group[0].segments.map(segmentSignature).join('~') === signature);

    if (existing) {
      existing.push(track);
    } else {
      groups.push([track]);
    }
  }

  return groups.map((group) => {
    if (group.length === 1) {
      return group[0];
    }

    return {
      id: group.map((track) => track.id).join('-'),
      label: group.map((track) => track.label).join(', '),
      segments: group[0].segments,
    };
  });
}

export function usedFootnoteIds(filter: ClassFilter): string[] {
  const seen = new Set<string>();

  for (const band of AMATEUR_BANDS) {
    for (const segment of band.segments) {
      if (!segment.classes.some((classId) => filter === 'all' || classId === filter)) {
        continue;
      }

      for (const id of segment.footnotes) {
        seen.add(id);
      }
    }
  }

  if (filter === 'all' || GEOGRAPHIC_EXCEPTIONS.some((exception) => exception.classes.includes(filter))) {
    seen.add('40m-geography');
  }

  return Object.keys(BAND_FOOTNOTES).filter((id) => seen.has(id));
}
