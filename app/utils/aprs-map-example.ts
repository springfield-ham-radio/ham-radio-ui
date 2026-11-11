/**
 * Example monitor lines for the dev map fixture.
 *
 * These are not read from a radio. The K5KTF-4 line matches a packet Bryan
 * decoded on the air, so the layout can be checked without the COM port.
 * The TM-D710 menu 604 feed does not include the radio's stored station list.
 */
export const APRS_MAP_EXAMPLE_TEXT = [
  'W1AW>APRS::K5KTF-4 :Hello{1',
  'N0CALL>T4SQZZ:`(_fn"Oj/',
  'not a packet',
  'W5XYZ>APRS:!3028.00N/09740.00W-Example station',
  'K5KTF-4>APRS,WIDE1-1:!3031.12N/09752.74W-K5KTF TX/RX-iGate',
].join('\n');
