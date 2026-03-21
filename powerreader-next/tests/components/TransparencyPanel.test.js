/**
 * Unit tests for TransparencyPanel.svelte
 *
 * Tests cover: fingerprint section rendering, no-fingerprint case,
 * detail sections, meta chips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TransparencyPanel from '$lib/components/analysis/TransparencyPanel.svelte';

// Polyfill Element.animate for Svelte transitions in jsdom
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { onfinish: null, cancel: () => {}, finished: Promise.resolve() };
  };
}

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'analyze.transparency.fingerprint_title': '推論驗證指紋',
      'analyze.transparency.fp_model': '推論模型',
      'analyze.transparency.fp_prompt_hash': 'Prompt 雜湊',
      'analyze.transparency.fp_pass1': 'Pass 1',
      'analyze.transparency.fp_pass2': 'Pass 2',
      'analyze.transparency.fp_throughput': '吞吐量',
      'analyze.transparency.fp_gpu': 'GPU',
      'analyze.transparency.fp_timestamp': '驗證時間',
    };
    return map[key] || key;
  })
}));

const MOCK_FINGERPRINT = {
  model_id: 'Qwen3-8B-q4f16',
  prompt_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  pass1_tokens: 120,
  pass2_tokens: 200,
  pass1_time_ms: 3500,
  pass2_time_ms: 5200,
  tokens_per_second: 36.78,
  gpu_tier: 'gpu',
  gpu_device: 'NVIDIA RTX 4060',
  timestamp: '2026-03-21T10:30:00.000Z',
};

describe('TransparencyPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic rendering ──

  it('renders transparency-panel container', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: null }
    });
    expect(container.querySelector('.transparency-panel')).toBeTruthy();
  });

  it('shows panel header with visibility icon', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: null }
    });
    expect(container.querySelector('.header-title').textContent).toBe('分析透明度');
  });

  // ── Meta chips ──

  it('shows tokens_used meta chip when provided', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: { tokens_used: 350 }, fingerprint: null }
    });
    const chips = container.querySelectorAll('.meta-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('350 tokens');
  });

  it('shows inference_time_ms meta chip formatted in seconds', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: { inference_time_ms: 4500 }, fingerprint: null }
    });
    const chips = container.querySelectorAll('.meta-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('4.5s');
  });

  // ── Sections ──

  it('renders section buttons for provided detail keys', () => {
    const { container } = render(TransparencyPanel, {
      props: {
        details: { l1_prompt: 'prompt text', l3_input: 'input text' },
        fingerprint: null
      }
    });
    const buttons = container.querySelectorAll('.section-header');
    expect(buttons.length).toBe(2);
  });

  it('does not render sections for missing detail keys', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: null }
    });
    const buttons = container.querySelectorAll('.section-header');
    expect(buttons.length).toBe(0);
  });

  it('toggles section content on click', async () => {
    const { container } = render(TransparencyPanel, {
      props: {
        details: { l1_prompt: 'some prompt content' },
        fingerprint: null
      }
    });
    const btn = container.querySelector('.section-header');
    expect(container.querySelector('.section-content')).toBeNull();

    await fireEvent.click(btn);
    expect(container.querySelector('.section-content')).toBeTruthy();
    expect(container.querySelector('.section-content pre').textContent).toBe('some prompt content');

    await fireEvent.click(btn);
    expect(container.querySelector('.section-content')).toBeNull();
  });

  // ── Fingerprint section: NOT shown when null ──

  it('does not render fingerprint section when fingerprint is null', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: null }
    });
    expect(container.querySelector('.fingerprint-section')).toBeNull();
  });

  // ── Fingerprint section: shown when provided ──

  it('renders fingerprint section when fingerprint is provided', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    expect(container.querySelector('.fingerprint-section')).toBeTruthy();
  });

  it('shows fingerprint title with verified icon', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const title = container.querySelector('.fingerprint-title');
    expect(title.textContent).toBe('推論驗證指紋');
    const icon = container.querySelector('.fingerprint-icon');
    expect(icon.textContent.trim()).toBe('verified');
  });

  it('displays model_id in fingerprint grid', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[0].textContent).toBe('Qwen3-8B-q4f16');
  });

  it('displays truncated prompt_hash (first 16 chars + ...)', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[1].textContent).toBe('abcdef1234567890...');
  });

  it('displays pass1 tokens and time', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[2].textContent).toContain('120 tokens');
    expect(values[2].textContent).toContain('3.5s');
  });

  it('displays pass2 tokens and time', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[3].textContent).toContain('200 tokens');
    expect(values[3].textContent).toContain('5.2s');
  });

  it('displays tokens_per_second', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[4].textContent).toContain('36.78 tok/s');
  });

  it('displays gpu_tier and gpu_device', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[5].textContent).toContain('gpu');
    expect(values[5].textContent).toContain('NVIDIA RTX 4060');
  });

  it('displays formatted timestamp', () => {
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: MOCK_FINGERPRINT }
    });
    const values = container.querySelectorAll('.fp-value');
    // Timestamp should be formatted (not raw ISO)
    const timestampVal = values[6].textContent;
    expect(timestampVal).not.toBe('2026-03-21T10:30:00.000Z');
    expect(timestampVal.length).toBeGreaterThan(0);
  });

  it('shows dash for empty gpu_device', () => {
    const fp = { ...MOCK_FINGERPRINT, gpu_device: '' };
    const { container } = render(TransparencyPanel, {
      props: { details: {}, fingerprint: fp }
    });
    const values = container.querySelectorAll('.fp-value');
    expect(values[5].textContent).toContain('—');
  });

  // ── Both details and fingerprint ──

  it('renders both sections and fingerprint together', () => {
    const { container } = render(TransparencyPanel, {
      props: {
        details: { l1_prompt: 'prompt', tokens_used: 100 },
        fingerprint: MOCK_FINGERPRINT
      }
    });
    expect(container.querySelectorAll('.section-header').length).toBe(1);
    expect(container.querySelector('.fingerprint-section')).toBeTruthy();
    expect(container.querySelectorAll('.meta-chip').length).toBe(1);
  });
});
