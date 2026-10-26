import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
   
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/Home.vue') },
    { path: '/benchmarks', name: 'benchmarks', component: () => import('../views/BrowserBenchmarks.vue') },
    {
      path: '/playground',
      component: () => import('../components/Playground/PlaygroundLayout.vue'),
      redirect: { name: 'playground-animation' },
      children: [
        {
          path: 'animation', name: 'playground-animation',
          component: () => import('../views/AnimationPlayground.vue'),
          meta: { playgroundPage: 'animation' },
        },
        {
          path: 'timeline', name: 'playground-timeline',
          component: () => import('../views/TimelinePlayground.vue'),
          meta: { playgroundPage: 'timeline' },
        },
        {
          path: 'easings', name: 'playground-easings',
          component: () => import('../views/EasingsPlayground.vue'),
          meta: { playgroundPage: 'easings' },
        },
        {
          path: 'tween', name: 'playground-tween-values',
          component: () => import('../components/Playground/MotionPanels/TweenPanel.vue'),
          meta: { playgroundPage: 'tween' },
        },
        {
          path: 'spring', name: 'playground-spring',
          component: () => import('../components/Playground/MotionPanels/SpringPanel.vue'),
          meta: { playgroundPage: 'spring' },
        },
        {
          path: 'frames', name: 'playground-frames',
          component: () => import('../components/Playground/MotionPanels/FramesPanel.vue'),
          meta: { playgroundPage: 'frames' },
        },
        {
          path: 'gestures', name: 'playground-gestures',
          component: () => import('../components/Playground/MotionPanels/GesturesPanel.vue'),
          meta: { playgroundPage: 'gestures' },
        },
        {
          path: 'streams', name: 'playground-streams',
          component: () => import('../components/Playground/MotionPanels/StreamsPanel.vue'),
          meta: { playgroundPage: 'streams' },
        },
        {
          path: 'adaptive', name: 'playground-adaptive',
          component: () => import('../components/Playground/MotionPanels/AdaptivePanel.vue'),
          meta: { playgroundPage: 'adaptive' },
        },
        {
          path: 'steering', name: 'playground-steering',
          component: () => import('../components/Playground/MotionPanels/SteeringPanel.vue'),
          meta: { playgroundPage: 'steering' },
        },
        {
          path: 'canvas', name: 'playground-canvas',
          component: () => import('../components/Playground/MotionPanels/CanvasPanel.vue'),
          meta: { playgroundPage: 'canvas' },
        },
        {
          path: 'motion', redirect: { name: 'playground-gestures' },
        },
        {
          path: 'api', name: 'playground-api',
          component: () => import('../views/ApiPlayground.vue'),
          meta: { playgroundPage: 'api' },
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
          meta: { docsPage: 'introduction' },
        },
        {
          path: 'animation', name: 'docs-animation',
          component: () => import('../components/DocsComponents/DocsAnimationSections.vue'),
          meta: { docsPage: 'animation' },
        },
        {
          path: 'timelines', name: 'docs-timelines',
          component: () => import('../components/DocsComponents/DocsTimelineSections.vue'),
          meta: { docsPage: 'timelines' },
        },
        {
          path: 'reactivity', name: 'docs-reactivity',
          component: () => import('../components/DocsComponents/DocsReactivitySections.vue'),
          meta: { docsPage: 'reactivity' },
        },
        {
          path: 'streams', name: 'docs-streams',
          component: () => import('../components/DocsComponents/DocsMotionStreams.vue'),
          meta: { docsPage: 'streams' },
        },
        {
          path: 'rendering', name: 'docs-rendering',
          component: () => import('../components/DocsComponents/DocsRenderingSections.vue'),
          meta: { docsPage: 'rendering' },
        },
        {
          path: 'interactions', name: 'docs-interactions',
          component: () => import('../components/DocsComponents/DocsInteractionSections.vue'),
          meta: { docsPage: 'interactions' },
        },
        {
          path: 'performance', name: 'docs-performance',
          component: () => import('../components/DocsComponents/DocsPerformanceSections.vue'),
          meta: { docsPage: 'performance' },
        },
        {
          path: 'api-reference', name: 'docs-api-reference',
          component: () => import('../components/DocsComponents/DocsApiReference.vue'),
          meta: { docsPage: 'api-reference' },
        },
      ],
    },
    { path: '/roadmap', redirect: '/docs' },
    {
      path: '/visuals',
      component: () => import('../views/VisualShowcase.vue'),
      children: [
        {
          path: '', name: 'visuals-home',
          component: () => import('../views/VisualLabOverview.vue'),
          meta: { visualPage: 'overview' },
        },
        {
          path: 'svg', name: 'visuals-svg',
          component: () => import('../components/VisualLab/VisualSvgPanel.vue'),
          meta: { visualPage: 'svg' },
        },
        {
          path: 'shaders', name: 'visuals-shaders',
          component: () => import('../components/VisualLab/VisualShadersPanel.vue'),
          meta: { visualPage: 'shaders' },
        },
        {
          path: 'canvas', name: 'visuals-canvas',
          component: () => import('../components/VisualLab/VisualCanvasPanel.vue'),
          meta: { visualPage: 'canvas' },
        },
        {
          path: 'interactions', name: 'visuals-interactions',
          component: () => import('../components/VisualLab/VisualInteractionsPanel.vue'),
          meta: { visualPage: 'interactions' },
        },
        {
          path: 'scroll', name: 'visuals-scroll',
          component: () => import('../components/VisualLab/VisualScrollPanel.vue'),
          meta: { visualPage: 'scroll' },
        },
      ],
    },
  ],
   
   
   
  scrollBehavior: () => ({ top: 0, left: 0, behavior: 'auto' }),
});
