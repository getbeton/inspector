export type PropKind = 'person' | 'group_org' | 'beton_computed'

export interface Subject {
  id: string
  props: Record<string, unknown>
}

export type EvalOk<T = unknown> = { ok: true; value: T; text: string }
export type EvalErr = { ok: false; reason: string }
export type EvalResult = EvalOk | EvalErr

export type Token =
  | { kind: 'num'; value: number; start: number; end: number }
  | { kind: 'str'; value: string; start: number; end: number }
  | { kind: 'ident'; value: string; start: number; end: number }
  | { kind: 'punct'; value: PunctValue; start: number; end: number }
  | { kind: 'eof'; start: number; end: number }

export type PunctValue =
  | '(' | ')' | ',' | '.'
  | '+' | '-' | '*' | '/'
  | '>' | '<' | '>=' | '<='
  | '==' | '!='

export type Ast =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'null' }
  | { type: 'ref'; path: string[] }
  | { type: 'call'; name: string; args: Ast[] }
  | { type: 'binop'; op: PunctValue; left: Ast; right: Ast }
  | { type: 'unary'; op: '-'; arg: Ast }

export interface FormulaFn {
  name: string
  sig: string
  desc: string
  minArgs: number
  maxArgs: number
  run: (args: unknown[]) => unknown
}
