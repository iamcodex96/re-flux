import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
   
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/Home.vue') },
    {
      path: '/playground',
      component: () => import('../components/Playground/PlaygroundLayout.vue'),
      redirect: { name: 'playground-animation' },
      children: [
        {
          path: 'animation', name: 'playground-animation',
          component: () => import('../views/AnimationPlayground.vue'),
          meta: { playgroundTitle: 'Animation', playgroundDescription: 'One instance, one time cursor. Adjust timing options, replay the animation and inspect its reactive state.' },
        },
        {
          path: 'timeline', name: 'playground-timeline',
          component: () => import('../views/TimelinePlayground.vue'),
          meta: { playgroundTitle: 'Timeline', playgroundDescription: 'Compose motions on one shared clock and inspect their timing, duration and progress.' },
        },
        {
          path: 'easings', name: 'playground-easings',
          component: () => import('../views/EasingsPlayground.vue'),
          meta: { playgroundTitle: 'Easings', playgroundDescription: 'Explore how easing functions map linear time to motion and compare their sample values.' },
        },
        {
          path: 'tween', name: 'playground-tween-values',
          component: () => import('../components/Playground/MotionPanels/TweenPanel.vue'),
          meta: { playgroundTitle: 'Tween values', playgroundDescription: 'Inspect a typed value stream, adjust timing, seek progress and control playback.' },
        },
        {
          path: 'spring', name: 'playground-spring',
          component: () => import('../components/Playground/MotionPanels/SpringPanel.vue'),
          meta: { playgroundTitle: 'Spring physics', playgroundDescription: 'Retarget motion without losing velocity and explore projected inertia.' },
        },
        {
          path: 'frames', name: 'playground-frames',
          component: () => import('../components/Playground/MotionPanels/FramesPanel.vue'),
          meta: { playgroundTitle: 'Frame coordinator', playgroundDescription: 'Observe coordinated layout reads and writes on the shared frame clock.' },
        },
        {
          path: 'gestures', name: 'playground-gestures',
          component: () => import('../components/Playground/MotionPanels/GesturesPanel.vue'),
          meta: { playgroundTitle: 'Gesture physics', playgroundDescription: 'Drag, lock an axis, inspect filtered velocity and let spring following settle.' },
        },
        {
          path: 'streams', name: 'playground-streams',
          component: () => import('../components/Playground/MotionPanels/StreamsPanel.vue'),
          meta: { playgroundTitle: 'Reactive streams', playgroundDescription: 'Retarget spring motion and smooth irregular timestamped input.' },
        },
        {
          path: 'adaptive', name: 'playground-adaptive',
          component: () => import('../components/Playground/MotionPanels/AdaptivePanel.vue'),
          meta: { playgroundTitle: 'Adaptive tween', playgroundDescription: 'Compare how animation duration adapts to fast, slow and jittery input cadence.' },
        },
        {
          path: 'canvas', name: 'playground-canvas',
          component: () => import('../components/Playground/MotionPanels/CanvasPanel.vue'),
          meta: { playgroundTitle: 'Canvas adapter', playgroundDescription: 'Drive a Canvas draw callback from a headless Tween and stop it cleanly.' },
        },
        {
          path: 'motion', redirect: { name: 'playground-gestures' },
        },
        {
          path: 'api', name: 'playground-api',
          component: () => import('../views/ApiPlayground.vue'),
          meta: { playgroundTitle: 'Keyframes & DOM API', playgroundDescription: 'Build value sequences, target elements, animate arrays and stagger multiple elements.' },
        },
      ],
    },
     
    { path: '/animation', redirect: { name: 'playground-animation' } },
    { path: '/timeline', redirect: { name: 'playground-timeline' } },
    { path: '/easings', redirect: { name: 'playground-easings' } },
    { path: '/motion', redirect: { name: 'playground-gestures' } },
    { path: '/api', redirect: { name: 'playground-api' } },
    {
      path: '/docs',
      component: () => import('../views/Docs.vue'),
      redirect: { name: 'docs-introduction' },
      children: [
        {
          path: 'introduction', name: 'docs-introduction',
          component: () => import('../components/DocsComponents/DocsGettingStarted.vue'),
          meta: { docsPage: 'introduction', tocIds: ['overview', 'install'] },
        },
        {
          path: 'animation', name: 'docs-animation',
          component: () => import('../components/DocsComponents/DocsAnimationSections.vue'),
          meta: { docsPage: 'animation', tocIds: ['animation', 'parameters', 'timing-examples', 'controls', 'callback-examples'] },
        },
        {
          path: 'timelines', name: 'docs-timelines',
          component: () => import('../components/DocsComponents/DocsTimelineSections.vue'),
          meta: { docsPage: 'timelines', tocIds: ['timeline', 'offsets', 'offset-explorer', 'nested-timeline'] },
        },
        {
          path: 'reactivity', name: 'docs-reactivity',
          component: () => import('../components/DocsComponents/DocsReactivitySections.vue'),
          meta: { docsPage: 'reactivity', tocIds: ['reactivity', 'await-example', 'easings', 'easing-gallery'] },
        },
        {
          path: 'streams', name: 'docs-streams',
          component: () => import('../components/DocsComponents/DocsMotionStreams.vue'),
          meta: { docsPage: 'streams', tocIds: ['retarget-motion', 'smooth-stream', 'adaptive-tween'] },
        },
        {
          path: 'rendering', name: 'docs-rendering',
          component: () => import('../components/DocsComponents/DocsRenderingSections.vue'),
          meta: { docsPage: 'rendering', tocIds: ['render-adapters', 'keyframes-dom', 'svg-path-morph'] },
        },
        {
          path: 'interactions', name: 'docs-interactions',
          component: () => import('../components/DocsComponents/DocsInteractionSections.vue'),
          meta: { docsPage: 'interactions', tocIds: ['gesture-physics', 'motion-lifecycle', 'scroll-triggers'] },
        },
        {
          path: 'performance', name: 'docs-performance',
          component: () => import('../components/DocsComponents/DocsPerformanceSections.vue'),
          meta: { docsPage: 'performance', tocIds: ['frame-observability'] },
        },
      ],
    },
    { path: '/roadmap', name: 'roadmap', component: () => import('../views/Roadmap.vue') },
    {
      path: '/visuals',
      component: () => import('../views/VisualShowcase.vue'),
      redirect: { name: 'visuals-svg' },
      children: [
        {
          path: 'svg', name: 'visuals-svg',
          component: () => import('../components/VisualLab/VisualSvgPanel.vue'),
          meta: { visualTitle: 'SVG & geometry', visualDescription: 'Path drawing, normalized morphing, liquid filters and motion paths.' },
        },
        {
          path: 'canvas', name: 'visuals-canvas',
          component: () => import('../components/VisualLab/VisualCanvasPanel.vue'),
          meta: { visualTitle: 'Canvas & data', visualDescription: 'Procedural particles, waves, geometry and frequency visualization.' },
        },
        {
          path: 'interactions', name: 'visuals-interactions',
          component: () => import('../components/VisualLab/VisualInteractionsPanel.vue'),
          meta: { visualTitle: 'DOM & interactions', visualDescription: 'Numeric interpolation, pointer physics, kinetic typography and FLIP layout transitions.' },
        },
        {
          path: 'scroll', name: 'visuals-scroll',
          component: () => import('../components/VisualLab/VisualScrollPanel.vue'),
          meta: { visualTitle: 'Scroll motion', visualDescription: 'A contained scroll region for inspecting progress, trigger callbacks and timeline scrubbing.' },
        },
      ],
    },
  ],
   
   
   
  scrollBehavior: () => ({ top: 0, left: 0, behavior: 'auto' }),
});
