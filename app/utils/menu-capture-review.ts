import type { MenuCaptureFieldAnnotation, MenuCaptureStepDiff } from '~/utils/menu-capture';

/** One line of mapped-field context for the review panel. */
export function menuCaptureFieldReviewLines(
  fields: readonly MenuCaptureFieldAnnotation[],
  menuNumber?: number,
): string[] {
  return fields.map((field) => formatMenuCaptureReviewFieldLine(field, menuNumber));
}

export function formatMenuCaptureReviewFieldLine(
  field: MenuCaptureFieldAnnotation,
  operatorMenuNumber?: number,
): string {
  const menuNum = field.menu?.number ?? operatorMenuNumber;
  const segments: string[] = [];

  if (menuNum !== undefined) {
    segments.push(`Menu ${menuNum}`);
  }

  if (field.label?.trim()) {
    segments.push(field.label.trim());
  }

  if (field.menu?.code?.trim()) {
    segments.push(field.menu.code.trim());
  }

  if (field.bitOffset !== undefined && field.bitWidth !== undefined) {
    segments.push(`bit ${field.bitOffset}${field.bitWidth > 1 ? `–${field.bitOffset + field.bitWidth - 1}` : ''}`);
  }

  if (field.reserved) {
    segments.push('(reserved)');
  }

  return segments.length > 0 ? segments.join(' · ') : 'Unlabeled field';
}

export function menuCaptureReviewHasVisibleDiff(diff: MenuCaptureStepDiff | undefined): boolean {
  return Boolean(diff && diff.runCount > 0 && diff.runs.some((run) => run.context.length > 0));
}