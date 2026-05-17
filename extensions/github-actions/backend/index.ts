/**
 * @tmux-web/ext-sdk — extension SDK for tmux-web.
 *
 * @example
 *   import { createExtension } from '@tmux-web/ext-sdk';
 *   const ext = createExtension();
 *   ext.onContext(ctx => console.log('session:', ctx.session));
 */
import { ExtBridge } from './bridge';

export type { ExtContext, ExtMessage } from './types';
export { ExtBridge };

let _bridge: ExtBridge | null = null;

/**
 * Initialize the extension. The id is auto-detected from the iframe URL,
 * which is derived from the extension's npm package name.
 */
export function createExtension(): ExtBridge {
  if (_bridge) throw new Error('[ext-sdk] createExtension() called more than once');
  _bridge = new ExtBridge();
  return _bridge;
}
