/**
 * Safe arithmetic expression evaluator — replaces `new Function()`/`eval()`.
 * Only supports: numbers, +, -, *, /, parentheses.
 * Returns NaN for invalid or disallowed expressions.
 */
export function safeEvalFormula(expr: string): number {
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return NaN;

    const tokens: string[] = [];
    const src = expr.replace(/\s+/g, '');
    let i = 0;
    while (i < src.length) {
        if ('+-*/()'.includes(src[i])) {
            tokens.push(src[i]);
            i++;
        } else if (/[\d.]/.test(src[i])) {
            let num = '';
            while (i < src.length && /[\d.]/.test(src[i])) {
                num += src[i];
                i++;
            }
            tokens.push(num);
        } else {
            return NaN;
        }
    }

    let pos = 0;

    function peek(): string | undefined { return tokens[pos]; }
    function consume(): string { return tokens[pos++]; }

    // expr     → term (('+' | '-') term)*
    // term     → unary (('*' | '/') unary)*
    // unary    → ('-' | '+')* primary
    // primary  → NUMBER | '(' expr ')'
    function parseExpr(): number {
        let result = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = consume();
            const right = parseTerm();
            result = op === '+' ? result + right : result - right;
        }
        return result;
    }

    function parseTerm(): number {
        let result = parseUnary();
        while (peek() === '*' || peek() === '/') {
            const op = consume();
            const right = parseUnary();
            result = op === '*' ? result * right : result / right;
        }
        return result;
    }

    function parseUnary(): number {
        if (peek() === '-') { consume(); return -parseUnary(); }
        if (peek() === '+') { consume(); return parseUnary(); }
        return parsePrimary();
    }

    function parsePrimary(): number {
        if (peek() === '(') {
            consume(); // '('
            const result = parseExpr();
            if (peek() !== ')') return NaN;
            consume(); // ')'
            return result;
        }
        const token = consume();
        if (token === undefined) return NaN;
        const num = Number(token);
        return isNaN(num) ? NaN : num;
    }

    const result = parseExpr();
    if (pos !== tokens.length) return NaN; // leftover tokens = malformed
    return result;
}

export const getCategoryLabel = (tmpl: any) => {
    const type = tmpl.engine_type;
    const conf = tmpl.engine_config || {};

    if (type === 'bucket') {
        if (conf.fields?.some((f: any) => f.key === 'expiry')) return 'EXPIRY';
        if (conf.fields?.some((f: any) => f.key === 'serial_no')) return 'SERIAL';
        return 'BATCH';
    }
    if (type === 'converter') {
        const unit = conf.stock_unit?.toLowerCase();
        if (['min', 'h', 'hour', 's'].includes(unit)) return 'TIME';
        if (['mm', 'cm', 'm', 'in', 'ft'].includes(unit)) return 'LENGTH';
        if (['ml', 'l', 'gal'].includes(unit)) return 'VOLUME';
        if (['g', 'kg', 'lb'].includes(unit)) return 'WEIGHT';
        return 'CONVERTER';
    }
    if (type === 'counter') return 'COUNTER';
    return type?.toUpperCase();
};
