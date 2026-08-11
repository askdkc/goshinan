declare module "@sabaki/sgf" {
  export interface SgfNode {
    id?: number | string | null;
    data: Record<string, string[]>;
    parentId?: number | string | null;
    children: SgfNode[];
  }

  export function parse(contents: string): SgfNode[];
  export function stringify(
    nodes: SgfNode | SgfNode[],
    options?: { linebreak?: string; indent?: string; level?: number },
  ): string;
  export function parseVertex(input: string): [number, number];
  export function stringifyVertex(vertex: [number, number]): string;
}
