<script>
  /**
   * ClusterTimeline — mini timeline showing cluster time range.
   * Uses relative time (e.g. "6 小時前") for <24h, absolute for >24h.
   */
  let { earliest = '', latest = '' } = $props();

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);

    if (diffH < 1) {
      const diffM = Math.max(1, Math.floor(diffMs / 60000));
      return `${diffM} 分鐘前`;
    }
    if (diffH < 24) {
      return `${diffH} 小時前`;
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  let earliestLabel = $derived(formatTime(earliest));
  let latestLabel = $derived(formatTime(latest));
</script>

<span class="cluster-timeline" aria-label="時間範圍: {earliestLabel} 至 {latestLabel}">
  <span class="material-symbols-outlined timeline-icon">schedule</span>
  <span class="timeline-text">{earliestLabel} — {latestLabel}</span>
</span>

<style>
  .cluster-timeline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: var(--md-sys-typescale-label-small-font);
    color: var(--md-sys-color-on-surface-variant);
  }
  .timeline-icon {
    font-size: 14px;
  }
  .timeline-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
