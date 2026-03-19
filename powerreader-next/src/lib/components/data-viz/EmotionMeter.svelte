<script>
  import { t } from '$lib/i18n/zh-TW.js';

  let { intensity = 50 } = $props();

  const LEVELS = [
    { max: 20, label: 'emotion.level.calm', color: '#4CAF50', icon: 'spa' },
    { max: 40, label: 'emotion.level.rational', color: '#2196F3', icon: 'psychology' },
    { max: 60, label: 'emotion.level.emotional', color: '#FFC107', icon: 'sentiment_dissatisfied' },
    { max: 80, label: 'emotion.level.sensational', color: '#FF9800', icon: 'whatshot' },
    { max: 100, label: 'emotion.level.extreme', color: '#F44336', icon: 'warning' },
  ];

  let config = $derived(() => {
    const clamped = Math.max(0, Math.min(100, intensity));
    const level = LEVELS.find(l => clamped <= l.max) || LEVELS[4];
    return { ...level, value: clamped };
  });
</script>

<span
  class="emotion-chip"
  style="background: {config().color}20; color: {config().color}; border-color: {config().color}40"
  role="img"
  aria-label={t('a11y.emotion_meter', { score: String(config().value), level: t(config().label) })}
>
  <span class="material-symbols-outlined chip-icon">{config().icon}</span>
  <span class="chip-text">{t('analysis.emotion_intensity')}: {t(config().label)}</span>
</span>

<style>
  .emotion-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--md-sys-shape-corner-small);
    border: 1px solid;
    font: var(--md-sys-typescale-label-medium-font);
    white-space: nowrap;
  }
  .chip-icon {
    font-size: 16px;
  }
  .chip-text {
    position: relative;
  }
</style>
