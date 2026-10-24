import type { MotionPreferences } from '@lib';
import type { VisualLabStageConfig, VisualLabTelemetry } from './visualLabTypes';

export interface PointerPosition { x: number; y: number; }
export interface CanvasSize { width: number; height: number; }
export interface StageFrame {
  phase: number;
  pointer: PointerPosition | null;
  config: VisualLabStageConfig;
  size: CanvasSize;
}
export interface FieldParticle { ribbon: number; progress: number; speed: number; radius: number; }
export interface VisualLabFeaturedStageProps {
  config: VisualLabStageConfig;
  preferences: MotionPreferences;
}
export type VisualLabTelemetryHandler = (telemetry: VisualLabTelemetry) => void;
