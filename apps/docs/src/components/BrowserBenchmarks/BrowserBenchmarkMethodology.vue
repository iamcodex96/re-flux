<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
import type { EngineMeta, ScenarioId } from '../../views/browser-benchmarks/types';

defineProps<{ selectedScenario: ScenarioId; engines: readonly EngineMeta[] }>();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.browserBenchmarks);
</script>

<template>
  <section class="browser-benchmarks__methodology">
    <div class="browser-benchmarks__method-copy">
      <div class="browser-benchmarks__kicker">{{ copy.staticText.text04Methodology }}</div>
      <h2>{{ copy.staticText.compareTheWorkNotTheMarketing }}</h2>
      <p v-if="selectedScenario === 'shared-renderer'">{{ copy.staticText.everyEngineAnimatesOneScalarProgressValueFrom0To1TheSameRenderFunctionWritesTheSelectedNumberOfRealDomSvgOrCanvasTargetsSoTheRendererWorkloadStaysConsistentWhileTheAnimationEngineChanges }}</p>
      <p v-else-if="selectedScenario === 'engine-only'">{{ copy.staticText.everyEngineUpdatesTheSameNumberOfJavascriptObjectTargetsWithoutTouchingTheDomTheReportFocusesOnCallbackCadenceCompletionAndMainThreadDiagnosticsRatherThanRendererDuration }}</p>
      <p v-else>{{ copy.staticText.everyEngineUpdatesOpacityOnTheSameNumberOfRealDomElementsReFluxUsesAnAnimationInstancePerTargetGsapAndAnimeJsUseTheirMultiTargetApisTheDifferentNativeApiShapesArePartOfThisWorkloadAndAreDocumentedInTheExport }}</p>
    </div>
    <div class="browser-benchmarks__method-list">
      <div><span>01</span><p><strong>{{ copy.staticText.warmUp }}</strong> {{ copy.staticText.eachEngineGetsOneShortUnreportedRunBeforeMeasurement }}</p></div>
      <div><span>02</span><p><strong>{{ copy.staticText.text10Repetitions }}</strong> {{ copy.staticText.theRunOrderRotatesThroughThreePermutationsCompareResultsOnTheSameMachine }}</p></div>
      <div><span>03</span><p><strong>{{ copy.staticText.refreshCalibration }}</strong> {{ copy.staticText.theMedianRequestanimationframeIntervalEstimatesTheActiveCallbackCadenceItDoesNotQueryThePhysicalDisplayMode }}</p></div>
      <div><span>04</span><p><strong>{{ copy.staticText.percentiles }}</strong> {{ copy.staticText.frameIntervalP95P99AndMissedRefreshEstimatesShowTailBehaviorNotActualDisplayPresentation }}</p></div>
      <div><span>05</span><p><strong>{{ copy.staticText.localReport }}</strong> {{ copy.staticText.jsonIsCreatedInYourBrowserNoBenchmarkResultIsUploaded }}</p></div>
    </div>
  </section>

  <section class="browser-benchmarks__notes" aria-labelledby="benchmark-notes-title">
    <h2 id="benchmark-notes-title">{{ copy.staticText.versionsAndLimitations }}</h2>
    <div class="browser-benchmarks__library-links">
      <a v-for="engine in engines" :key="engine.id" :href="engine.href" target="_blank" rel="noopener noreferrer">
        <span>{{ engine.name }}</span><strong>{{ engine.version }}</strong><UiIcon icon="mdi-open-in-new" />
      </a>
    </div>
    <ul>
      <li>{{ copy.staticText.gsapAndAnimeJsAreLoadedOnDemandFromEsmShAtPinnedVersionsTheirDownloadTimeIsNotIncludedButResultsRequireTheCdnToBeReachable }}</li>
      <li>{{ copy.staticText.theSharedRendererScenarioComparesAScalarProgressCallbackEngineOnlyAndPerTargetDomScenariosCompareEachLibrarySTargetApiShapeReFluxCreatesOneAnimationPerTargetWhileGsapAndAnimeJsUseMultiTargetCalls }}</li>
      <li>{{ copy.staticText.frameCadenceIsCalibratedFromRequestanimationframeTimestampsMissedRefreshValuesAreEstimatesFromCallbackIntervalsNotProofOfDroppedPhysicalPresentations }}</li>
      <li>{{ copy.staticText.longTasksAndLongAnimationFramesDependOnBrowserSupportNAMeansTheRelevantObserverIsUnavailableNotThatTheBrowserExperiencedZeroWork }}</li>
      <li>{{ copy.staticText.resultsVaryWithBrowserRefreshRateOperatingSystemThermalStateExtensionsOtherTabsAndSystemLoadUseMultipleRunsAndCompareTheSameEnvironment }}</li>
    </ul>
  </section>
</template>
