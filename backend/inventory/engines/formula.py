"""Safe arithmetic formula parser (used by DimensionEngine)."""
import operator
import re
from typing import Dict


class SafeFormulaParser:
    """
    Safe recursive descent parser for basic arithmetic expressions.
    Supports: +, -, *, /, parentheses, and named variables.
    No eval(), no code injection possible.

    Grammar:
        expr   -> term (('+' | '-') term)*
        term   -> factor (('*' | '/') factor)*
        factor -> '-' factor | atom
        atom   -> NUMBER | VARIABLE | '(' expr ')'
    """
    _OPERATORS = {
        '+': operator.add,
        '-': operator.sub,
        '*': operator.mul,
        '/': operator.truediv,
    }
    _TOKEN_RE = re.compile(
        r'\s*(?:(\d+\.?\d*)|([a-zA-Z_]\w*)|([+\-*/()])|(.+?))\s*'
    )

    def __init__(self, variables: Dict[str, float] = None):
        self.variables = variables or {}

    def parse(self, expression: str) -> float:
        self.tokens = self._tokenize(expression)
        self.pos = 0
        result = self._expr()
        if self.pos < len(self.tokens):
            raise ValueError(f"Unexpected token: {self.tokens[self.pos]}")
        return result

    def _tokenize(self, expression: str):
        tokens = []
        for match in self._TOKEN_RE.finditer(expression):
            number, variable, op, invalid = match.groups()
            if invalid:
                raise ValueError(f"Invalid character in formula: {invalid!r}")
            if number:
                tokens.append(('NUM', float(number)))
            elif variable:
                tokens.append(('VAR', variable))
            elif op:
                tokens.append(('OP', op))
        return tokens

    def _peek(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def _consume(self, expected_type=None, expected_value=None):
        token = self._peek()
        if token is None:
            raise ValueError("Unexpected end of expression")
        if expected_type and token[0] != expected_type:
            raise ValueError(f"Expected {expected_type}, got {token}")
        if expected_value and token[1] != expected_value:
            raise ValueError(f"Expected {expected_value!r}, got {token[1]!r}")
        self.pos += 1
        return token

    def _expr(self):
        left = self._term()
        while self._peek() and self._peek()[0] == 'OP' and self._peek()[1] in ('+', '-'):
            op = self._consume()[1]
            right = self._term()
            left = self._OPERATORS[op](left, right)
        return left

    def _term(self):
        left = self._factor()
        while self._peek() and self._peek()[0] == 'OP' and self._peek()[1] in ('*', '/'):
            op = self._consume()[1]
            right = self._factor()
            if op == '/' and right == 0:
                raise ValueError("Division by zero")
            left = self._OPERATORS[op](left, right)
        return left

    def _factor(self):
        if self._peek() and self._peek() == ('OP', '-'):
            self._consume()
            return -self._factor()
        return self._atom()

    def _atom(self):
        token = self._peek()
        if token is None:
            raise ValueError("Unexpected end of expression")
        if token[0] == 'NUM':
            self._consume()
            return token[1]
        if token[0] == 'VAR':
            self._consume()
            name = token[1]
            if name not in self.variables:
                raise ValueError(f"Unknown variable: {name}")
            return float(self.variables[name])
        if token == ('OP', '('):
            self._consume()
            result = self._expr()
            self._consume('OP', ')')
            return result
        raise ValueError(f"Unexpected token: {token}")

