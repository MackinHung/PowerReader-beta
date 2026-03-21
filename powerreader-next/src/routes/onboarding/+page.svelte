<script>
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import CampBar from '$lib/components/data-viz/CampBar.svelte';

  let currentStep = $state(0);
  const TOTAL_STEPS = 4;

  const steps = [
    {
      title: '歡迎使用 PowerReader',
      icon: 'menu_book',
      description: 'PowerReader 是一款去中心化的新聞立場分析工具。透過 AI 技術，幫助你了解不同媒體的報導角度與立場偏向。'
    },
    {
      title: 'AI 分析如何運作',
      icon: 'psychology',
      description: '我們使用 WebLLM 技術，直接在你的瀏覽器中運行 AI 模型（Qwen3-8B）。所有分析都在你的裝置上完成，不會將新聞內容上傳到任何伺服器。'
    },
    {
      title: '立場光譜',
      icon: 'balance',
      description: '台灣媒體可大致分為偏綠、中立、偏藍三個陣營。PowerReader 幫助你跨越資訊同溫層，看見不同立場的報導。'
    },
    {
      title: '準備開始',
      icon: 'rocket_launch',
      description: '你可以選擇登入以保存分析紀錄，或直接開始使用。所有核心功能無需登入即可使用。'
    }
  ];

  function next() {
    if (currentStep < TOTAL_STEPS - 1) {
      currentStep++;
    }
  }

  function back() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  function skip() {
    complete();
  }

  function complete() {
    localStorage.setItem('onboarding_complete', 'true');
    goto('/');
  }
</script>

<div class="onboarding-page">
  <div class="step-dots">
    {#each steps as _, i}
      <div class="dot" class:active={i === currentStep} class:done={i < currentStep}></div>
    {/each}
  </div>

  <div class="step-content">
    <span class="material-symbols-outlined step-icon">
      {steps[currentStep].icon}
    </span>
    <h1 class="step-title">{steps[currentStep].title}</h1>
    <p class="step-description">{steps[currentStep].description}</p>

    {#if currentStep === 2}
      <div class="camp-demo">
        <CampBar green={35} white={30} blue={35} />
        <div class="camp-labels">
          <span class="camp-label green">偏綠媒體</span>
          <span class="camp-label white">中立媒體</span>
          <span class="camp-label blue">偏藍媒體</span>
        </div>
      </div>
    {/if}

    {#if currentStep === 3}
      <div class="final-actions">
        <Button onclick={complete}>
          <span class="material-symbols-outlined">play_arrow</span>
          開始使用
        </Button>
      </div>
    {/if}
  </div>

  <div class="nav-row">
    {#if currentStep > 0}
      <Button variant="text" onclick={back}>
        <span class="material-symbols-outlined">arrow_back</span>
        上一步
      </Button>
    {:else}
      <div></div>
    {/if}

    {#if currentStep < TOTAL_STEPS - 1}
      <div class="nav-right">
        <Button variant="text" onclick={skip}>略過</Button>
        <Button onclick={next}>
          下一步
          <span class="material-symbols-outlined">arrow_forward</span>
        </Button>
      </div>
    {:else}
      <div></div>
    {/if}
  </div>
</div>

<style>
  .onboarding-page {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 64px);
    padding: var(--pr-page-padding);
  }
  .step-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 16px 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 0;
    background: var(--md-sys-color-outline-variant);
    transition: all var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .dot.active {
    width: 24px;
    height: 4px;
    background: var(--pr-ink);
  }
  .dot.done {
    background: var(--pr-ink);
    opacity: 0.6;
  }
  .step-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 16px;
    padding: 24px 0;
  }
  .step-icon {
    font-size: 64px;
    color: var(--md-sys-color-primary);
  }
  .step-title {
    margin: 0;
    font: var(--md-sys-typescale-headline-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  .step-description {
    margin: 0;
    font: var(--md-sys-typescale-body-large-font);
    color: var(--md-sys-color-on-surface-variant);
    max-width: 100%;
    line-height: 1.6;
  }
  @media (min-width: 768px) {
    .step-description {
      max-width: 80%;
    }
  }
  @media (min-width: 1024px) {
    .step-description {
      max-width: 60%;
    }
  }
  .camp-demo {
    width: 100%;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 0;
  }
  .camp-labels {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .camp-label {
    font: var(--md-sys-typescale-label-medium-font);
    padding: 4px 10px;
    border-radius: 0;
  }
  .camp-label.green {
    color: var(--camp-green);
    background: color-mix(in srgb, var(--camp-green) 15%, transparent);
  }
  .camp-label.white {
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container);
  }
  .camp-label.blue {
    color: var(--camp-blue);
    background: color-mix(in srgb, var(--camp-blue) 15%, transparent);
  }
  .final-actions {
    padding: 16px 0;
  }
  .nav-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }
  .nav-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
