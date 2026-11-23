/**
 * The library reads `process.env.NODE_ENV` when a `process` global exists (Node, or a bundler that defines it) and
 * falls back gracefully when it does not. The docs app does not load the Node typings, so declare just that shape.
 */
declare const process: { readonly env?: { readonly NODE_ENV?: string } } | undefined;
