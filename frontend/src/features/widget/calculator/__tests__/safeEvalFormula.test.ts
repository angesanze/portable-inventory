import { safeEvalFormula } from '../utils';

describe('safeEvalFormula', () => {
    it('evaluates basic arithmetic', () => {
        expect(safeEvalFormula('2 + 3')).toBe(5);
        expect(safeEvalFormula('10 - 4')).toBe(6);
        expect(safeEvalFormula('3 * 7')).toBe(21);
        expect(safeEvalFormula('20 / 4')).toBe(5);
    });

    it('respects operator precedence', () => {
        expect(safeEvalFormula('2 + 3 * 4')).toBe(14);
        expect(safeEvalFormula('10 - 2 * 3')).toBe(4);
    });

    it('handles parentheses', () => {
        expect(safeEvalFormula('(2 + 3) * 4')).toBe(20);
        expect(safeEvalFormula('((1 + 2) * (3 + 4))')).toBe(21);
    });

    it('handles decimals', () => {
        expect(safeEvalFormula('1.5 * 2')).toBe(3);
        expect(safeEvalFormula('3.14 + 0.86')).toBe(4);
    });

    it('handles unary minus', () => {
        expect(safeEvalFormula('-5 + 3')).toBe(-2);
        expect(safeEvalFormula('-(2 + 3)')).toBe(-5);
    });

    it('handles division by zero', () => {
        expect(safeEvalFormula('1 / 0')).toBe(Infinity);
    });

    it('returns NaN for invalid expressions', () => {
        expect(safeEvalFormula('abc')).toBeNaN();
        expect(safeEvalFormula('2 + alert(1)')).toBeNaN();
        expect(safeEvalFormula('require("fs")')).toBeNaN();
        expect(safeEvalFormula('')).toBeNaN();
    });

    it('rejects code injection attempts', () => {
        expect(safeEvalFormula('constructor.constructor("return this")()')).toBeNaN();
        expect(safeEvalFormula('1; process.exit()')).toBeNaN();
        expect(safeEvalFormula('1 + eval("2")')).toBeNaN();
    });

    it('handles whitespace', () => {
        expect(safeEvalFormula('  2  +  3  ')).toBe(5);
    });

    it('handles complex real-world formulas', () => {
        // length * width * height type formulas
        expect(safeEvalFormula('10 * 20 * 5')).toBe(1000);
        expect(safeEvalFormula('3.5 * 2.0 + 1.5')).toBe(8.5);
    });

    it('returns NaN for malformed expressions', () => {
        expect(safeEvalFormula('2 +')).toBeNaN();
        expect(safeEvalFormula('* 3')).toBeNaN();
        expect(safeEvalFormula('(2 + 3')).toBeNaN();
        expect(safeEvalFormula('2 3 +')).toBeNaN();
    });
});
