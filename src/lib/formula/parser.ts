import type { Ast, PunctValue, Token } from './types'
import { FormulaError, tokenize } from './tokenizer'

/**
 * Recursive-descent parser.
 *
 * Grammar (precedence low → high):
 *   expression   := comparison
 *   comparison   := additive ( ( '>' | '<' | '>=' | '<=' | '==' | '!=' ) additive )?
 *   additive     := multiplicative ( ('+' | '-') multiplicative )*
 *   multiplicative := unary ( ('*' | '/') unary )*
 *   unary        := '-'? primary
 *   primary      := NUMBER | STRING | 'true' | 'false' | 'null'
 *                 | ident ( '.' ident )*               // reference
 *                 | ident '(' argList ')'               // function call
 *                 | '(' expression ')'
 *   argList      := ( expression ( ',' expression )* )?
 */
export function parse(input: string): Ast {
  const tokens = tokenize(input)
  const parser = new Parser(tokens, input)
  const ast = parser.parseExpression()
  parser.expectEof()
  return ast
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[], private readonly input: string) {}

  parseExpression(): Ast {
    return this.parseComparison()
  }

  parseComparison(): Ast {
    const left = this.parseAdditive()
    const t = this.peek()
    if (
      t.kind === 'punct' &&
      (t.value === '>' || t.value === '<' || t.value === '>=' || t.value === '<=' || t.value === '==' || t.value === '!=')
    ) {
      const op = t.value
      this.advance()
      const right = this.parseAdditive()
      return { type: 'binop', op, left, right }
    }
    return left
  }

  parseAdditive(): Ast {
    let left = this.parseMultiplicative()
    while (true) {
      const t = this.peek()
      if (t.kind === 'punct' && (t.value === '+' || t.value === '-')) {
        const op = t.value
        this.advance()
        const right = this.parseMultiplicative()
        left = { type: 'binop', op, left, right }
      } else break
    }
    return left
  }

  parseMultiplicative(): Ast {
    let left = this.parseUnary()
    while (true) {
      const t = this.peek()
      if (t.kind === 'punct' && (t.value === '*' || t.value === '/')) {
        const op = t.value
        this.advance()
        const right = this.parseUnary()
        left = { type: 'binop', op, left, right }
      } else break
    }
    return left
  }

  parseUnary(): Ast {
    const t = this.peek()
    if (t.kind === 'punct' && t.value === '-') {
      this.advance()
      return { type: 'unary', op: '-', arg: this.parsePrimary() }
    }
    return this.parsePrimary()
  }

  parsePrimary(): Ast {
    const t = this.peek()

    if (t.kind === 'num') {
      this.advance()
      return { type: 'num', value: t.value }
    }
    if (t.kind === 'str') {
      this.advance()
      return { type: 'str', value: t.value }
    }
    if (t.kind === 'ident') {
      if (t.value === 'true') {
        this.advance()
        return { type: 'bool', value: true }
      }
      if (t.value === 'false') {
        this.advance()
        return { type: 'bool', value: false }
      }
      if (t.value === 'null') {
        this.advance()
        return { type: 'null' }
      }

      const name = t.value
      this.advance()

      // Function call
      const next = this.peek()
      if (next.kind === 'punct' && next.value === '(') {
        this.advance()
        const args: Ast[] = []
        if (!this.check('punct', ')')) {
          args.push(this.parseExpression())
          while (this.check('punct', ',')) {
            this.advance()
            args.push(this.parseExpression())
          }
        }
        this.expect('punct', ')')
        return { type: 'call', name, args }
      }

      // Reference: ident ('.' ident)*
      const path = [name]
      while (this.check('punct', '.')) {
        this.advance()
        const seg = this.peek()
        if (seg.kind !== 'ident') {
          throw new FormulaError(`Expected identifier after "."`, seg.start)
        }
        path.push(seg.value)
        this.advance()
      }
      return { type: 'ref', path }
    }

    if (t.kind === 'punct' && t.value === '(') {
      this.advance()
      const expr = this.parseExpression()
      this.expect('punct', ')')
      return expr
    }

    throw new FormulaError(`Unexpected token at ${t.start}`, t.start)
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }
  private advance(): Token {
    return this.tokens[this.pos++]
  }
  private check(kind: Token['kind'], value?: PunctValue): boolean {
    const t = this.peek()
    if (t.kind !== kind) return false
    if (value !== undefined && t.kind === 'punct' && t.value !== value) return false
    return true
  }
  private expect(kind: Token['kind'], value?: PunctValue): Token {
    const t = this.peek()
    if (!this.check(kind, value)) {
      throw new FormulaError(
        `Expected ${value ?? kind} at ${t.start}`,
        t.start,
      )
    }
    return this.advance()
  }
  expectEof(): void {
    const t = this.peek()
    if (t.kind !== 'eof') {
      throw new FormulaError(`Unexpected trailing token at ${t.start}`, t.start)
    }
  }
}
