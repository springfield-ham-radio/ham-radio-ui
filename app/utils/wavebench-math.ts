import katex from 'katex';

/**
 * Turns a LaTeX filter equation into KaTeX HTML.
 *
 * Display mode stacks fractions so a Butterworth S21 fits the sidebar
 * instead of sitting on one clipped line under a scrollbar.
 */
export function renderEquationHtml(expression: string): string {
  return katex.renderToString(expression, {
    displayMode: true,
    throwOnError: true,
    output: 'htmlAndMathml',
  });
}
