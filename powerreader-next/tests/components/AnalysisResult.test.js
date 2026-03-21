/**
 * Unit tests for AnalysisResult.svelte
 *
 * Tests cover: rendering, political/non-political display, bias spectrum,
 * camp ratio, emotion meter, points, stances, source attribution, actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AnalysisResult from '$lib/components/analysis/AnalysisResult.svelte';

// Polyfill Element.animate for Svelte transitions in jsdom
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    return { onfinish: null, cancel: () => {}, finished: Promise.resolve() };
  };
}

// Polyfill URL.createObjectURL/revokeObjectURL for jsdom (ShareCardButton -> ShareCardDialog)
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'analysis.not_political': '非政治類文章',
      'share.card.button': '分享分析卡片',
      'share.card.title': '分享分析卡片',
      'share.card.generating': '生成中...',
      'common.button.close': '關閉',
    };
    return map[key] || key;
  })
}));

// Mock card renderer / share
vi.mock('$lib/share/card-renderer.js', () => ({
  renderArticleCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  renderEventCard: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
}));

vi.mock('$lib/share/card-share.js', () => ({
  shareCard: vi.fn().mockResolvedValue({ method: 'download', success: true }),
}));

describe('AnalysisResult', () => {
  const fullResult = {
    is_political: true,
    bias_score: 1.5,
    camp_ratio: { green: 30, white: 30, blue: 40 },
    emotion_intensity: 70,
    points: ['論點一', '論點二', '論點三'],
    stances: {
      '民進黨': '支持改革方案',
      '國民黨': '反對現行政策',
    },
    source_attribution: '綜合各媒體報導',
  };

  const nonPoliticalResult = {
    is_political: false,
    bias_score: null,
    camp_ratio: null,
    emotion_intensity: 25,
    points: [],
    stances: {},
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic rendering ──

  it('renders analysis-result container', () => {
    const { container } = render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(container.querySelector('.analysis-result')).toBeTruthy();
  });

  // ── Political / non-political ──

  it('shows not-political badge for non-political result', () => {
    render(AnalysisResult, {
      props: { result: nonPoliticalResult, articleTitle: '科技文', articleSource: 'Tech' }
    });
    expect(screen.getByText('非政治類文章')).toBeTruthy();
  });

  it('hides not-political badge for political result', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '政治文', articleSource: 'News' }
    });
    expect(screen.queryByText('非政治類文章')).toBeNull();
  });

  // ── Bias spectrum ──

  it('shows bias label for political result with score', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('立場偏向')).toBeTruthy();
  });

  it('hides bias section when score is null', () => {
    const result = { ...fullResult, bias_score: null };
    render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.queryByText('立場偏向')).toBeNull();
  });

  it('hides bias section for non-political', () => {
    render(AnalysisResult, {
      props: { result: nonPoliticalResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.queryByText('立場偏向')).toBeNull();
  });

  // ── Camp ratio ──

  it('shows camp ratio label for political result', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('陣營比例')).toBeTruthy();
  });

  it('hides camp ratio when null', () => {
    const result = { ...fullResult, camp_ratio: null };
    render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.queryByText('陣營比例')).toBeNull();
  });

  // ── Emotion meter ──

  it('renders emotion section when intensity present', () => {
    const { container } = render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(container.querySelector('.emotion-section')).toBeTruthy();
  });

  it('hides emotion section when intensity is null', () => {
    const result = { ...fullResult, emotion_intensity: null };
    const { container } = render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(container.querySelector('.emotion-section')).toBeNull();
  });

  // ── Points ──

  it('renders points list', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('論述重點')).toBeTruthy();
    expect(screen.getByText('論點一')).toBeTruthy();
    expect(screen.getByText('論點二')).toBeTruthy();
    expect(screen.getByText('論點三')).toBeTruthy();
  });

  it('hides points section when empty', () => {
    const result = { ...fullResult, points: [] };
    render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.queryByText('論述重點')).toBeNull();
  });

  // ── Stances ──

  it('renders stances section', () => {
    const { container } = render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('各方立場')).toBeTruthy();
    // Use container selectors to avoid collision with CampBar party labels
    const stanceParties = container.querySelectorAll('.stance-party');
    expect(stanceParties.length).toBe(2);
    expect(stanceParties[0].textContent).toBe('民進黨');
    expect(stanceParties[1].textContent).toBe('國民黨');
    expect(screen.getByText('支持改革方案')).toBeTruthy();
    expect(screen.getByText('反對現行政策')).toBeTruthy();
  });

  it('hides stances section when empty', () => {
    const result = { ...fullResult, stances: {} };
    render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.queryByText('各方立場')).toBeNull();
  });

  it('hides stances section when undefined', () => {
    const result = { ...fullResult, stances: undefined };
    render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.queryByText('各方立場')).toBeNull();
  });

  // ── Source attribution ──

  it('renders source attribution text', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('綜合各媒體報導')).toBeTruthy();
  });

  it('hides source attribution when falsy', () => {
    const result = { ...fullResult, source_attribution: '' };
    const { container } = render(AnalysisResult, {
      props: { result, articleTitle: '測試', articleSource: '來源' }
    });
    expect(container.querySelector('.source-attribution')).toBeNull();
  });

  // ── Action buttons ──

  it('renders submit button', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('提交分析')).toBeTruthy();
  });

  it('renders discard button', () => {
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源' }
    });
    expect(screen.getByText('放棄')).toBeTruthy();
  });

  it('calls onsubmit when submit clicked', async () => {
    const onsubmit = vi.fn();
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源', onsubmit }
    });
    const submitBtn = screen.getByText('提交分析');
    await fireEvent.click(submitBtn);
    expect(onsubmit).toHaveBeenCalledTimes(1);
  });

  it('calls ondiscard when discard clicked', async () => {
    const ondiscard = vi.fn();
    render(AnalysisResult, {
      props: { result: fullResult, articleTitle: '測試', articleSource: '來源', ondiscard }
    });
    const discardBtn = screen.getByText('放棄');
    await fireEvent.click(discardBtn);
    expect(ondiscard).toHaveBeenCalledTimes(1);
  });

  // ── Minimal result (defaults) ──

  it('renders with empty result object', () => {
    const { container } = render(AnalysisResult, {
      props: { result: {}, articleTitle: '', articleSource: '' }
    });
    expect(container.querySelector('.analysis-result')).toBeTruthy();
  });
});
