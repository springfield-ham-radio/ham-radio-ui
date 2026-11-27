import { canonicalAx25Call, formatAx25Call } from '~/utils/aprs-ax25';

/**
 * Stored on the saved radio. Absent follows the operator callsign. Blank string is cleared.
 */
export function aprsMyCallField(stored: string | undefined, operatorCall: string | undefined): string {
  if (stored === '') {
    return '';
  }

  const own = stored ? canonicalAx25Call(stored) : undefined;

  if (own) {
    return formatAx25Call(own);
  }

  const operator = operatorCall ? canonicalAx25Call(operatorCall) : undefined;

  return operator ? formatAx25Call(operator) : '';
}