/**
 * Primary sources for the Reference tab.
 * Entries are static. The app does not fetch them.
 * Re-check the URLs when the verified-on date changes.
 * See docs/reference.md.
 */

export const REFERENCE_VERIFIED_ON = '2026-11-07';

export const REFERENCE_REGION =
  'United States, ITU Region 2 (50 states and the District of Columbia, as drawn)';

export interface ReferenceSource {
  id: string;
  title: string;
  url: string;
  usedFor: string;
}

export const REFERENCE_SOURCES: readonly ReferenceSource[] = [
  {
    id: 'itu-rr-2024',
    title: 'ITU Radio Regulations, Edition of 2024',
    url: 'https://www.itu.int/hub/publication/r-reg-rr-2024/',
    usedFor: 'Appendix 14 phonetic alphabet and figure code',
  },
  {
    id: 'itu-rr-2020-vol2',
    title: 'ITU Radio Regulations, Edition of 2020, Volume 2 (Appendix 14 text)',
    url: 'https://www.itu.int/en/ITU-R/seminars/ntfa/ntfa-r3-ws-24/Documents/3.%20Documents%20NTFA%20WS/ITU-R%20Regulatory%20Documents/1.Radio%20Regulations%20and%20Rules%20of%20Procedure/Radio%20Regulations%20Ed%202020-E/RR-2020-Vol%202_E.pdf',
    usedFor: 'Letter and figure spellings. WRC-23 revised the appendix cross-reference; the spelling table was not replaced in the Final Acts.',
  },
  {
    id: 'wrc-23',
    title: 'WRC-23 Final Acts (ITU English PDF)',
    url: 'https://www.itu.int/en/ITU-R/seminars/ntfa/ntfa-r1-ws-24/Documents/ITU-R%20Regulatory%20Documents/1.Radio%20Regulations%20and%20Rules%20of%20Procedure/WRC-23%20Final%20Acts-E.pdf',
    usedFor: 'Appendix 14 (Rev. WRC-23) title and article cross-reference',
  },
  {
    id: 'itu-morse',
    title: 'Recommendation ITU-R M.1677-1 (10/2009), International Morse code',
    url: 'https://www.itu.int/rec/R-REC-M.1677-1-200910-I/',
    usedFor: 'Morse characters and dot timing',
  },
  {
    id: 'itu-q',
    title: 'Recommendation ITU-R M.1172 (10/1995), Q code',
    url: 'https://www.itu.int/rec/R-REC-M.1172-0-199510-I/en',
    usedFor: 'Question and answer meanings of the listed Q groups',
  },
  {
    id: 'cfr-97-301',
    title: '47 CFR § 97.301 Authorized frequency bands',
    url: 'https://www.ecfr.gov/current/title-47/section-97.301',
    usedFor: 'Which license classes may transmit in each band',
  },
  {
    id: 'cfr-97-303',
    title: '47 CFR § 97.303 Frequency sharing requirements',
    url: 'https://www.ecfr.gov/current/title-47/section-97.303',
    usedFor: '60 m channels, 2200 m / 630 m, 30 m, and geographic limits',
  },
  {
    id: 'cfr-97-305',
    title: '47 CFR § 97.305 Authorized emission types',
    url: 'https://www.ecfr.gov/current/title-47/section-97.305',
    usedFor: 'CW, data, phone, and image segments',
  },
  {
    id: 'cfr-97-307',
    title: '47 CFR § 97.307 Emission standards',
    url: 'https://www.ecfr.gov/current/title-47/section-97.307',
    usedFor: 'Novice/Technician CW limits, 10 m phone, 40 m geography, 60 m bandwidth',
  },
  {
    id: 'cfr-97-313',
    title: '47 CFR § 97.313 Transmitter power standards',
    url: 'https://www.ecfr.gov/current/title-47/section-97.313',
    usedFor: 'Power limits, including 60 m ERP',
  },
  {
    id: 'cfr-97-501',
    title: '47 CFR § 97.501 Qualifying for an amateur operator license',
    url: 'https://www.ecfr.gov/current/title-47/section-97.501',
    usedFor: 'No examination path remains for new Novice or Advanced grants',
  },
  {
    id: 'cfr-2-106',
    title: '47 CFR § 2.106 Table of Frequency Allocations',
    url: 'https://www.ecfr.gov/current/title-47/section-2.106',
    usedFor: 'NTIA/FCC allocation table. § 97.303 says this table is the binding sharing text.',
  },
  {
    id: 'fcc-wrc15',
    title: 'Federal Register, 91 FR 1430 (January 14, 2026), effective February 13, 2026',
    url: 'https://www.federalregister.gov/documents/2026/01/14/2026-00587/implementation-of-the-final-acts-of-the-world-radiocommunication-conference-geneva-2015-wrc-15-other',
    usedFor: '60 m: 5351.5–5366.5 kHz plus four remaining channels',
  },
  {
    id: 'arrl-band-plan',
    title: 'ARRL band plans (voluntary)',
    url: 'https://www.arrl.org/band-plan',
    usedFor: 'Cross-check only. Not drawn as privileges.',
  },
  {
    id: 'arrl-graphical',
    title: 'ARRL graphical frequency allocations (cross-check)',
    url: 'https://www.arrl.org/graphical-frequency-allocations',
    usedFor: 'Cross-check only. This chart is not their artwork or layout.',
  },
];

export function referenceSource(id: string): ReferenceSource | undefined {
  return REFERENCE_SOURCES.find((source) => source.id === id);
}
