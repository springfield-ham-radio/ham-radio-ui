import {
  parseDistanceUnit,
  readDistanceUnit,
  writeDistanceUnit,
  type DistanceUnit,
} from '~/utils/distance-unit';

/**
 * Miles or kilometers for the channel library distance column.
 *
 * Stored in localStorage. There is no separate locale-based unit.
 */
export function useDistanceUnit() {
  const unit = useState<DistanceUnit>('distance-unit', () => readDistanceUnit());

  function setUnit(value: unknown): void {
    const next = parseDistanceUnit(value);
    unit.value = next;
    writeDistanceUnit(next);
  }

  return {
    unit,
    setUnit,
  };
}
