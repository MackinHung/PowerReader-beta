/**
 * PowerReader - Settings Store (Svelte 5 Runes)
 *
 * Pure localStorage-backed user preferences.
 * Persists changes automatically via $effect.
 */

const KEYS = {
  ANALYSIS_MODE: 'powerreader_analysis_mode',
  AUTO_SUBMIT: 'powerreader_auto_submit',
  NOTIFICATIONS: 'powerreader_notifications',
  CACHE_ENABLED: 'powerreader_cache_enabled',
  THEME: 'powerreader_theme',
  LANGUAGE: 'powerreader_language',
  ONBOARDING_DONE: 'powerreader_onboarding_done'
};

function readBool(key, defaultVal = true) {
  const val = localStorage.getItem(key);
  if (val === null) return defaultVal;
  return val === '1' || val === 'true';
}

function readString(key, defaultVal = '') {
  return localStorage.getItem(key) || defaultVal;
}

// -- Reactive state (initialized from localStorage) --
let analysisMode = $state(readString(KEYS.ANALYSIS_MODE, 'manual'));
let autoSubmit = $state(readBool(KEYS.AUTO_SUBMIT, true));
let notifications = $state(readBool(KEYS.NOTIFICATIONS, true));
let cacheEnabled = $state(readBool(KEYS.CACHE_ENABLED, true));
let theme = $state(readString(KEYS.THEME, 'system'));
let language = $state(readString(KEYS.LANGUAGE, 'zh-TW'));
let onboardingDone = $state(readBool(KEYS.ONBOARDING_DONE, false));

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

    /**
     * @param {'auto'|'manual'} mode
     */
    setAnalysisMode(mode) {
      analysisMode = mode;
    },

    /** @param {boolean} enabled */
    setAutoSubmit(enabled) {
      autoSubmit = enabled;
    },

    /** @param {boolean} enabled */
    setNotifications(enabled) {
      notifications = enabled;
    },

    /** @param {boolean} enabled */
    setCacheEnabled(enabled) {
      cacheEnabled = enabled;
    },

    /**
     * @param {'light'|'dark'|'system'} t
     */
    setTheme(t) {
      theme = t;
    },

    /** @param {string} lang */
    setLanguage(lang) {
      language = lang;
    },

    /** Mark onboarding as completed. */
    completeOnboarding() {
      onboardingDone = true;
    },

    /** Reset onboarding (for testing). */
    resetOnboarding() {
      onboardingDone = false;
    },

    /** Reset all settings to defaults. */
    resetAll() {
      analysisMode = 'manual';
      autoSubmit = true;
      notifications = true;
      cacheEnabled = true;
      theme = 'system';
      language = 'zh-TW';
    }
  };
}
