/**
 * PowerReader - Onboarding Page
 *
 * 4-step first-use guide:
 *   1. Welcome — concept introduction
 *   2. Bias spectrum tutorial — left/right explanation
 *   3. Local AI analysis — privacy and model download overview
 *   4. Get started — login or browse
 *
 * Routes: #/onboarding
 *
 * Shown once on first visit (localStorage key: powerreader_onboarded).
 */

import { t } from '../../locale/zh-TW.js';

const TOTAL_STEPS = 4;

/**
 * Render onboarding flow.
 * @param {HTMLElement} container
 */
export function renderOnboarding(container) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'onboarding';
  wrapper.setAttribute('role', 'dialog');
  wrapper.setAttribute('aria-label', t('onboarding.step1.title'));

  let currentStep = 1;

  function renderStep() {
    wrapper.innerHTML = '';

    // Progress dots
    const progress = document.createElement('div');
    progress.className = 'onboarding__progress';
    progress.setAttribute('aria-label', `Step ${currentStep} of ${TOTAL_STEPS}`);
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const dot = document.createElement('span');
      dot.className = `onboarding__dot${i === currentStep ? ' onboarding__dot--active' : ''}`;
      dot.setAttribute('aria-hidden', 'true');
      progress.appendChild(dot);
    }
    wrapper.appendChild(progress);

    // Step content
    const content = document.createElement('div');
    content.className = 'onboarding__content';

    const stepTitle = document.createElement('h2');
    stepTitle.className = 'onboarding__title';
    stepTitle.textContent = t(`onboarding.step${currentStep}.title`);
    content.appendChild(stepTitle);

    const stepDesc = document.createElement('p');
    stepDesc.className = 'onboarding__desc';
    stepDesc.textContent = t(`onboarding.step${currentStep}.desc`);
    content.appendChild(stepDesc);

    // Step-specific visual
    const visual = createStepVisual(currentStep);
    if (visual) {
      content.appendChild(visual);
    }

    wrapper.appendChild(content);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'onboarding__actions';

    if (currentStep < TOTAL_STEPS) {
      // Skip button
      const skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn--text';
      skipBtn.textContent = t('onboarding.button.skip');
      skipBtn.addEventListener('click', finishOnboarding);
      actions.appendChild(skipBtn);

      // Next button
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn--primary onboarding__next';
      nextBtn.textContent = t('onboarding.button.next');
      nextBtn.addEventListener('click', () => {
        currentStep += 1;
        renderStep();
      });
      actions.appendChild(nextBtn);
    } else {
      // Start button (final step)
      const startBtn = document.createElement('button');
      startBtn.className = 'btn btn--primary onboarding__next';
      startBtn.textContent = t('onboarding.button.start');
      startBtn.addEventListener('click', finishOnboarding);
      actions.appendChild(startBtn);
    }

    wrapper.appendChild(actions);
  }

  renderStep();
  container.appendChild(wrapper);
}

/**
 * Finish onboarding → navigate to home.
 */
function finishOnboarding() {
  window.location.hash = '#/';
}

/**
 * Create step-specific visual illustration.
 * Uses simple DOM/SVG elements (no images needed).
 */
function createStepVisual(step) {
  const visual = document.createElement('div');
  visual.className = 'onboarding__visual';
  visual.setAttribute('aria-hidden', 'true');

  switch (step) {
    case 1:
      // Welcome icon — simple text icon
      visual.innerHTML = '<div class="onboarding__icon">&#128218;</div>';
      return visual;

    case 2: {
      // Mini bias spectrum bar
      const bar = document.createElement('div');
      bar.className = 'onboarding__spectrum';

      const labels = document.createElement('div');
      labels.className = 'onboarding__spectrum-labels';

      const leftLabel = document.createElement('span');
      leftLabel.textContent = t('bias.label.left');
      leftLabel.style.color = 'var(--color-bias-left)';

      const centerLabel = document.createElement('span');
      centerLabel.textContent = t('bias.label.center');
      centerLabel.style.color = 'var(--color-bias-center)';

      const rightLabel = document.createElement('span');
      rightLabel.textContent = t('bias.label.right');
      rightLabel.style.color = 'var(--color-bias-right)';

      labels.appendChild(leftLabel);
      labels.appendChild(centerLabel);
      labels.appendChild(rightLabel);

      visual.appendChild(bar);
      visual.appendChild(labels);
      return visual;
    }

    case 3:
      // Privacy shield icon
      visual.innerHTML = '<div class="onboarding__icon">&#128274;</div>';
      return visual;

    case 4:
      // Start icon
      visual.innerHTML = '<div class="onboarding__icon">&#128640;</div>';
      return visual;

    default:
      return null;
  }
}
