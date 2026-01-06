import jsonata from 'jsonata';
import { nanoid } from 'nanoid';
import type { ExecutionContext } from '../entities/run.js';

// Built-in functions available in expressions
const builtins = {
  $now: () => new Date().toISOString(),
  $uuid: () => nanoid(),
  $timestamp: () => Date.now(),
};

// Template expression pattern: {{...}}
const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Resolve template expressions in a value.
 * Expressions like {{trigger.body.id}} or {{steps.step1.result}} are replaced
 * with values from the execution context.
 */
export async function resolveExpressions(
  template: unknown,
  context: ExecutionContext
): Promise<unknown> {
  if (typeof template === 'string') {
    return resolveStringTemplate(template, context);
  }

  if (Array.isArray(template)) {
    return Promise.all(template.map(item => resolveExpressions(item, context)));
  }

  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(template);
    for (const [key, value] of entries) {
      result[key] = await resolveExpressions(value, context);
    }
    return result;
  }

  return template;
}

async function resolveStringTemplate(template: string, context: ExecutionContext): Promise<unknown> {
  // If the entire string is a single expression, return the resolved value directly
  // This preserves the type (object, array, number, etc.)
  const singleExprMatch = template.match(/^\{\{(.+)\}\}$/);
  if (singleExprMatch?.[1]) {
    return evaluateExpression(singleExprMatch[1].trim(), context);
  }

  // Otherwise, do string interpolation
  // We need to handle async replacement
  const matches: Array<{ match: string; expr: string; index: number }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TEMPLATE_REGEX.source, 'g');
  while ((match = regex.exec(template)) !== null) {
    const expr = match[1];
    if (expr) {
      matches.push({ match: match[0], expr: expr.trim(), index: match.index });
    }
  }

  if (matches.length === 0) {
    return template;
  }

  const values = await Promise.all(
    matches.map(m => evaluateExpression(m.expr, context))
  );

  let result = template;
  // Replace in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const value = values[i];
    const m = matches[i];
    if (!m) continue;

    let replacement: string;
    if (value === null || value === undefined) {
      replacement = '';
    } else if (typeof value === 'object') {
      replacement = JSON.stringify(value);
    } else {
      replacement = String(value);
    }
    result = result.slice(0, m.index) + replacement + result.slice(m.index + m.match.length);
  }

  return result;
}

async function evaluateExpression(expr: string, context: ExecutionContext): Promise<unknown> {
  // Handle built-in functions
  if (expr.startsWith('$')) {
    const funcName = expr.split('(')[0] as keyof typeof builtins;
    if (funcName && funcName in builtins) {
      return builtins[funcName]();
    }
  }

  // Build the data object for JSONata
  const data = {
    trigger: context.trigger,
    steps: context.steps,
    variables: context.variables,
  };

  try {
    const compiled = jsonata(expr);
    return await compiled.evaluate(data);
  } catch {
    // If JSONata fails, return the expression as-is
    return `{{${expr}}}`;
  }
}

/**
 * Evaluate a JSONata expression for the transform step.
 */
export async function evaluateTransform(
  expression: string,
  context: ExecutionContext
): Promise<unknown> {
  const data = {
    trigger: context.trigger,
    steps: context.steps,
    variables: context.variables,
  };

  const compiled = jsonata(expression);
  return compiled.evaluate(data);
}
