// tests/chart.test.js
// TDD RED phase — failing tests for computeWaterfallData (Wave 0, Plan 06-01).
// ALL tests FAIL until Plan 06-02 creates web/src/components/WaterfallChart.jsx.
//
// Covers: CHART-01 (normal 5-step sequence), CHART-03 (COGS unknown omit),
//         CHART-04 (loss order / negative netProfit), all-zero guard.

const { computeWaterfallData } = require('../web/src/components/WaterfallChart.jsx');

describe('computeWaterfallData', () => {
  // CHART-01: normal 5-step sequence
  test('normal 5-step sequence: Revenue → COGS → Fees → Shipping → NetProfit', () => {
    const steps = [
      { label: 'Revenue',    value: 1000, type: 'start'    },
      { label: 'COGS',       value: 300,  type: 'subtract' },
      { label: 'Fees',       value: 50,   type: 'subtract' },
      { label: 'Shipping',   value: 20,   type: 'subtract' },
      { label: 'Net Profit', value: 630,  type: 'total'    },
    ];

    const result = computeWaterfallData(steps);

    expect(result).toHaveLength(5);

    // Revenue: anchor bar from 0 to 1000
    expect(result[0].label).toBe('Revenue');
    expect(result[0].barBottom).toBe(0);
    expect(result[0].barTop).toBe(1000);

    // COGS: hangs down from 1000 to 700
    expect(result[1].label).toBe('COGS');
    expect(result[1].barBottom).toBe(700);
    expect(result[1].barTop).toBe(1000);

    // Fees: hangs down from 700 to 650
    expect(result[2].label).toBe('Fees');
    expect(result[2].barBottom).toBe(650);
    expect(result[2].barTop).toBe(700);

    // Shipping: hangs down from 650 to 630
    expect(result[3].label).toBe('Shipping');
    expect(result[3].barBottom).toBe(630);
    expect(result[3].barTop).toBe(650);

    // Net Profit: closing bar anchored to 0, top at 630
    expect(result[4].label).toBe('Net Profit');
    expect(result[4].barBottom).toBe(0);
    expect(result[4].barTop).toBe(630);
  });

  // CHART-04: loss order — negative netProfit
  test('loss order (negative netProfit): total bar extends below zero', () => {
    // Revenue=500, COGS=300, Fees=150, Shipping=100 → running = 500-300-150-100 = -50
    const steps = [
      { label: 'Revenue',    value: 500, type: 'start'    },
      { label: 'COGS',       value: 300, type: 'subtract' },
      { label: 'Fees',       value: 150, type: 'subtract' },
      { label: 'Shipping',   value: 100, type: 'subtract' },
      { label: 'Net Profit', value: -50, type: 'total'    },
    ];

    const result = computeWaterfallData(steps);

    expect(result).toHaveLength(5);

    // Revenue bar
    expect(result[0].barBottom).toBe(0);
    expect(result[0].barTop).toBe(500);

    // Net Profit (loss): barBottom = -50, barTop = 0
    const totalBar = result[4];
    expect(totalBar.label).toBe('Net Profit');
    expect(totalBar.barBottom).toBe(-50);
    expect(totalBar.barTop).toBe(0);
  });

  // CHART-03: COGS unknown — omit COGS step, no null values
  test('COGS unknown — omit COGS step, function does not throw and has no null values', () => {
    // Caller omits COGS entirely when cogsKnown=false
    const steps = [
      { label: 'Revenue',  value: 800, type: 'start'    },
      { label: 'Fees',     value: 40,  type: 'subtract' },
      { label: 'Shipping', value: 20,  type: 'subtract' },
      { label: 'Net Profit', value: 740, type: 'total'  },
    ];

    let result;
    expect(() => {
      result = computeWaterfallData(steps);
    }).not.toThrow();

    expect(result).toHaveLength(4);

    // No step should have null or undefined barBottom/barTop
    for (const step of result) {
      expect(step.barBottom).not.toBeNull();
      expect(step.barBottom).not.toBeUndefined();
      expect(step.barTop).not.toBeNull();
      expect(step.barTop).not.toBeUndefined();
    }
  });

  // All-zero guard: caller responsibility, function returns well-formed output
  test('all-zero values: returns well-formed array with no NaN or undefined', () => {
    const steps = [
      { label: 'Revenue',    value: 0, type: 'start'    },
      { label: 'COGS',       value: 0, type: 'subtract' },
      { label: 'Fees',       value: 0, type: 'subtract' },
      { label: 'Shipping',   value: 0, type: 'subtract' },
      { label: 'Net Profit', value: 0, type: 'total'    },
    ];

    const result = computeWaterfallData(steps);

    expect(result).toHaveLength(5);
    for (const step of result) {
      expect(step.barBottom).not.toBeNaN();
      expect(step.barTop).not.toBeNaN();
      expect(step.barBottom).not.toBeUndefined();
      expect(step.barTop).not.toBeUndefined();
    }
  });
});
