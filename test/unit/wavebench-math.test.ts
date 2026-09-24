import { describe, expect, it } from 'vitest';
import { designFilter, FILTER_PRESETS } from '../../app/utils/wavebench-filters.ts';
import { renderEquationHtml } from '../../app/utils/wavebench-math.ts';

describe('wavebench-math', () => {
  describe('renderEquationHtml', () => {
    it('should typeset a display-mode fraction with KaTeX', () => {
      const html = renderEquationHtml('S_{21}(s) = \\dfrac{1}{1 + sRC}');

      expect(html).toContain('katex');
      expect(html).toContain('S');
      expect(html).toContain('21');
    });

    it('should typeset every filter equation without throwing', () => {
      const designs = [
        ...FILTER_PRESETS.map((preset) => designFilter(preset.parameters)),
        designFilter({
          kind: 'high-pass',
          topology: 'rc',
          cutoffHz: 1_800,
          centerHz: 1_800,
          bandwidthHz: 200,
          resistanceOhms: 10_000,
        }),
        designFilter({
          kind: 'high-pass',
          topology: 'lc',
          cutoffHz: 1_800_000,
          centerHz: 1_800_000,
          bandwidthHz: 200_000,
          resistanceOhms: 50,
        }),
      ];

      for (const design of designs) {
        for (const equation of design.equations) {
          expect(() => renderEquationHtml(equation.expression), `${design.kind} ${design.topology} ${equation.id}`).not.toThrow();
          expect(renderEquationHtml(equation.expression)).toContain('katex');
        }
      }
    });
  });
});
