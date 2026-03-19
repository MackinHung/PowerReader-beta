/**
 * PowerReader - Analysis Store (Svelte 5 Runes)
 *
 * Reactive store wrapping queue.js + auto-runner.js event emitters.
 * Tracks queue status, auto-runner state, and current analysis progress.
 */

import type { QueueStatus, AutoRunnerStatus, AnalysisStage } from '$lib/types/inference.js';
import type { Article, AnalysisResult } from '$lib/types/models.js';

import {
  enqueueAnalysis,
  cancelAnalysis,
  cancelAll,
  onQueueChange,
  getQueueStatus
} from '$lib/core/queue.js';

import {
  startAutoRunner,
  stopAutoRunner,
  pauseAutoRunner,
  resumeAutoRunner,
  forceStopAutoRunner,
  onAutoRunnerUpdate,
  getAutoRunnerStatus,
  isAutoModeEnabled,
  setAnalysisMode
} from '$lib/core/auto-runner.js';

// -- Queue state --
let queueStatus: QueueStatus = $state(getQueueStatus());

// -- Auto-runner state --
let autoRunnerStatus: AutoRunnerStatus = $state(getAutoRunnerStatus());

// -- Current manual analysis tracking --
let currentAnalysis: { articleId: string; startedAt: number } | null = $state(null);
let analysisError: string | null = $state(null);
let analysisStage: AnalysisStage | null = $state(null);
let analysisEta: number | null = $state(null);
let analysisProgress: number = $state(0);

export function getAnalysisStore() {
  // Subscribe to event emitters via $effect in the consuming component,
  // or call init() once on app startup.
  let _unsubQueue: (() => void) | null = null;
  let _unsubAutoRunner: (() => void) | null = null;

  return {
    // -- Getters: Queue --
    get queueStatus() { return queueStatus; },
    get currentJob() { return queueStatus.currentJob; },
    get pendingIds() { return queueStatus.pending; },

    // -- Getters: Auto-runner --
    get autoRunnerStatus() { return autoRunnerStatus; },
    get isAutoRunning() { return autoRunnerStatus.running; },
    get isAutoPaused() { return autoRunnerStatus.paused; },
    get autoStats() {
      return {
        analyzed: autoRunnerStatus.analyzed,
        failed: autoRunnerStatus.failed,
        skipped: autoRunnerStatus.skipped
      };
    },
    get autoStopReason() { return autoRunnerStatus.stopReason; },
    get autoCurrentArticle() { return autoRunnerStatus.currentArticle; },

    // -- Getters: Manual analysis --
    get currentAnalysis() { return currentAnalysis; },
    get analysisError() { return analysisError; },
    get analysisStage() { return analysisStage; },
    get eta() { return analysisEta; },
    get progress() { return analysisProgress; },
    get isAutoModeEnabled() { return isAutoModeEnabled(); },

    /**
     * Initialize event subscriptions. Call once on app mount.
     * Returns a cleanup function.
     */
    init(): () => void {
      _unsubQueue = onQueueChange((status: QueueStatus) => {
        queueStatus = status;
      });
      _unsubAutoRunner = onAutoRunnerUpdate((status: AutoRunnerStatus) => {
        autoRunnerStatus = status;
      });

      return () => {
        if (_unsubQueue) _unsubQueue();
        if (_unsubAutoRunner) _unsubAutoRunner();
      };
    },

    /**
     * Enqueue a manual analysis for a single article.
     */
    async analyze(articleId: string, article: Article): Promise<AnalysisResult> {
      currentAnalysis = { articleId, startedAt: Date.now() };
      analysisError = null;
      analysisStage = 'preparing';

      try {
        const result = await enqueueAnalysis(articleId, article, {
          onStatus: (stage: AnalysisStage, elapsed: number, extra?: { eta?: number | null; progress?: number }) => {
            analysisStage = stage;
            analysisEta = extra?.eta || null;
            analysisProgress = extra?.progress || 0;
          }
        });
        currentAnalysis = null;
        analysisStage = null;
        analysisEta = null;
        analysisProgress = 0;
        return result;
      } catch (e) {
        analysisError = (e as Error).message;
        currentAnalysis = null;
        analysisStage = null;
        analysisEta = null;
        analysisProgress = 0;
        throw e;
      }
    },

    /**
     * Cancel a specific analysis by article ID.
     */
    cancel(articleId: string): void {
      cancelAnalysis(articleId);
      if (currentAnalysis?.articleId === articleId) {
        currentAnalysis = null;
        analysisStage = null;
        analysisEta = null;
        analysisProgress = 0;
      }
    },

    /** Cancel all queued and running analyses. */
    cancelAll(): void {
      cancelAll();
      currentAnalysis = null;
      analysisStage = null;
      analysisEta = null;
      analysisProgress = 0;
    },

    // -- Auto-runner controls --

    /** Start the background auto-analysis loop. */
    async startAuto(): Promise<void> {
      await startAutoRunner();
    },

    /** Smart toggle: running -> pause, paused -> force stop. */
    stopAuto(): void {
      stopAutoRunner();
    },

    /** Pause auto-runner (current analysis finishes, then suspends). */
    pauseAuto(): void {
      pauseAutoRunner();
    },

    /** Resume auto-runner from paused state. */
    resumeAuto(): void {
      resumeAutoRunner();
    },

    /** Force-stop all auto-runner activity immediately. */
    forceStopAuto(): void {
      forceStopAutoRunner();
    },

    /**
     * Toggle analysis mode between 'auto' and 'manual'.
     */
    setMode(mode: 'auto' | 'manual'): void {
      setAnalysisMode(mode);
    }
  };
}
