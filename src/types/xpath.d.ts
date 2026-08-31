declare module 'xpath' {
  import type { Node } from '@xmldom/xmldom';

  export function select(expression: string, node: Node): unknown;
}
