import type P5 from 'p5';

export type P5Constructor = typeof P5;
export type P5Instance = InstanceType<typeof P5>;

let p5LoadPromise: Promise<P5Constructor> | null = null;

/** Load the pinned, workspace-installed p5.js package only when Visual Lab activates the renderer. */
export function loadP5(): Promise<P5Constructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('p5.js requires a browser environment.'));
  }

  if (!p5LoadPromise) {
    p5LoadPromise = import('p5')
      .then((module) => module.default)
      .catch((error: unknown) => {
        p5LoadPromise = null;
        throw error;
      });
  }

  return p5LoadPromise;
}
