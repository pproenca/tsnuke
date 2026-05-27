import ts from "typescript";

export interface ClassInfo {
  readonly node: ts.ClassDeclaration | ts.ClassExpression;
  readonly className: string;
  /** The node whose position is used for the diagnostic — the class name when
   *  present, otherwise the class node itself (for an anonymous expression). */
  readonly reportNode: ts.Node;
}

/**
 * Recognize a class-like node (`ClassDeclaration` OR `ClassExpression`) and
 * derive a display name for the diagnostic.
 *
 * For `const Logger = class { … }` the class is anonymous but the binding
 * variable name is what callers see — climb the parent chain one step to find
 * it. Returns `undefined` when no usable name exists (anonymous default-export
 * class, anonymous IIFE-style class), which is the correct skip case.
 */
export function extractClassInfo(node: ts.Node): ClassInfo | undefined {
  if (ts.isClassDeclaration(node)) {
    if (node.name === undefined) return undefined;
    return { node, className: node.name.text, reportNode: node.name };
  }
  if (!ts.isClassExpression(node)) return undefined;

  if (node.name !== undefined) {
    return { node, className: node.name.text, reportNode: node.name };
  }

  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return { node, className: parent.name.text, reportNode: parent.name };
  }
  return undefined;
}
