import type { AprsWeather } from '~/utils/aprs-decode';

/** Local clock label for a received line. Pass `timeZone` in tests. */
export function formatAprsHeardAt(iso: string, timeZone?: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date);
}

/** One labeled line per weather field that was present in the packet. */
export function aprsWeatherLines(weather: AprsWeather): string[] {
  const lines: string[] = [];

  if (weather.windDirectionDegrees !== undefined) {
    lines.push(`Wind ${weather.windDirectionDegrees}°`);
  }

  if (weather.windSpeedMph !== undefined) {
    lines.push(`Wind speed ${weather.windSpeedMph} mph`);
  }

  if (weather.gustMph !== undefined) {
    lines.push(`Gust ${weather.gustMph} mph`);
  }

  if (weather.temperatureFahrenheit !== undefined) {
    lines.push(`Temperature ${weather.temperatureFahrenheit} °F`);
  }

  if (weather.rainLastHourInches !== undefined) {
    lines.push(`Rain last hour ${weather.rainLastHourInches.toFixed(2)} in`);
  }

  if (weather.rainLast24HoursInches !== undefined) {
    lines.push(`Rain 24 h ${weather.rainLast24HoursInches.toFixed(2)} in`);
  }

  if (weather.rainSinceMidnightInches !== undefined) {
    lines.push(`Rain since midnight ${weather.rainSinceMidnightInches.toFixed(2)} in`);
  }

  if (weather.humidityPercent !== undefined) {
    lines.push(`Humidity ${weather.humidityPercent}%`);
  }

  if (weather.pressureHpa !== undefined) {
    lines.push(`Pressure ${weather.pressureHpa.toFixed(1)} hPa`);
  }

  return lines;
}
