/**
 * PowerReader - Settings Store (Svelte 5 Runes)
 *
 * Pure localStorage-backed user preferences.
 * Persists changes automatically via $effect.
 */

import type { AnalysisModeOption, ThemeOption } from '$lib/types/stores.js';

const KEYS = {
  ANALYSIS_MODE: 'powerreader_analysis_mode',
  AUTO_SUBMIT: 'powerreader_auto_submit',
  NOTIFICATIONS: 'powerreader_notifications',
  CACHE_ENABLED: 'powerreader_cache_enabled',
  THEME: 'powerreader_theme',
  LANGUAGE: 'powerreader_language',
  ONBOARDING_DONE: 'powerreader_onboarding_done'
} as const;

function readBool(key: string, defaultVal: boolean = true): boolean {
  const val = localStorage.getItem(key);
  if (val === null) return defaultVal;
  return val === '1' || val === 'true';
}

function readString(key: string, defaultVal: string = ''): string {
  return localStorage.getItem(key) || defaultVal;
}

// -- Reactive state (initialized from localStorage) --
let analysisMode: AnalysisModeOption = $state(readString(KEYS.ANALYSIS_MODE, 'manual') as AnalysisModeOption);
let autoSubmit: boolean = $state(readBool(KEYS.AUTO_SUBMIT, true));
let notifications: boolean = $state(readBool(KEYS.NOTIFICATIONS, true));
let cacheEnabled: boolean = $state(readBool(KEYS.CACHE_ENABLED, true));
let theme: ThemeOption = $state(readString(KEYS.THEME, 'system') as ThemeOption);
let language: string = $state(readString(KEYS.LANGUAGE, 'zh-TW'));
let onboardingDone: boolean = $state(readBool(KEYS.ONBOARDING_DONE, false));

// -- Auto-persist via $effect --
$effect.root(() => {
  $effect(() => { localStorage.setItem(KEYS.ANALYSIS_MODE, analysisMode); });
  $effect(() => { localStorage.setItem(KEYS.AUTO_SUBMIT, autoSubmit ? '1' : '0'); });
  $effect(() => { localStorage.setItem(KEYS.NOTIFICATIONS, notifications ? '1' : '0'); });
  $effect(() => { localStorage.setItem(KEYS.CACHE_ENABLED, cacheEnabled ? '1' : '0'); });
  $effect(() => { localStorage.setItem(KEYS.THEME, theme); });
  $effect(() => { localStorage.setItem(KEYS.LANGUAGE, language); });
  $effect(() => { localStorage.setItem(KEYS.ONBOARDING_DONE, onboardingDone ? '1' : '0'); });
});

export function getSettingsStore() {
  return {
    // -- Getters --
    get analysisMode() { return analysisMode; },
    get autoSubmit() { return autoSubmit; },
    get notifications() { return notifications; },
    get cacheEnabled() { return cacheEnabled; },
    get theme() { return theme; },
    get language() { return language; },
    get onboardingDone() { return onboardingDone; },

    // -- Setters --

    setAnalysisMode(mode: AnalysisModeOption): void {
      analysisMode = mode;
    },

    setAutoSubmit(enabled: boolean): void {
      autoSubmit = enabled;
    },

    setNotifications(enabled: boolean): void {
      notifications = enabled;
    },

    setCacheEnabled(enabled: boolean): void {
      cacheEnabled = enabled;
    },

    setTheme(t: ThemeOption): void {
      theme = t;
    },

    setLanguage(lang: string): void {
      language = lang;
    },

    /** Mark onboarding as completed. */
    completeOnboarding(): void {
      onboardingDone = true;
    },

    /** Reset onboarding (for testing). */
    resetOnboarding(): void {
      onboardingDone = false;
    },

    /** Reset all settings to defaults. */
    resetAll(): void {
      analysisMode = 'manual';
      autoSubmit = true;
      notifications = true;
      cacheEnabled = true;
      theme = 'system';
      language = 'zh-TW';
    }
  };
}
