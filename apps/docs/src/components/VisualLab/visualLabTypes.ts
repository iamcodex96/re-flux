export type VisualExperimentKind =
  | 'typography'
  | 'spline'
  | 'path-draw'
  | 'liquid-svg'
  | 'motion-path'
  | 'morph-grid'
  | 'particles'
  | 'cloth'
  | 'swarm'
  | 'spring-follower'
  | 'inertia'
  | 'soft-body'
  | 'frequency'
  | 'radial'
  | 'dispersion'
  | 'shader-aurora'
  | 'shader-spectrum';

/** Shader studies still selectable inside the Visual Lab. */
export type VisualLabShaderKind = Extract<VisualExperimentKind, 'dispersion' | 'shader-aurora' | 'shader-spectrum'>;
/** Shared shader preview programs; the fluid field is reserved for the Home hero. */
export type ShaderPreviewKind = VisualLabShaderKind | 'shader-fluid';
export type VisualExperimentCategory = 'physics' | 'shader' | 'svg' | 'canvas';

export interface VisualLabStageConfig {
  timeScale: number;
  gravity: number;
  springElasticity: number;
  airDrag: number;
}

export interface VisualLabTelemetry {
  fps: number;
  frameTimeMs: number;
  nodeCount: number;
  pointerX: number | null;
  pointerY: number | null;
  state: 'running' | 'idle' | 'reduced-motion';
}
