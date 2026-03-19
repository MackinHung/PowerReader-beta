/**
 * Unit tests for DiffView.svelte
 *
 * Tests cover: before/after display, changed field marking, topic stances diff, unchanged display
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from 'svelte';
import DiffView from '../../src/lib/components/knowledge/DiffView.svelte';

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'knowledge.diff.before': '修改前',
      'knowledge.diff.after': '修改後',
      'knowledge.diff.changed': '已變更',
      'knowledge.diff.unchanged': '未變更',
      'knowledge.stances.title': '各黨立場比較'
    };
    return map[key] || key;
  })
}));

function createContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('DiffView', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders before and after headings', () => {
    mount(DiffView, {
      target: container,
      props: {
        oldEntry: { title: 'Old Title', content: 'Old content' },
        newEntry: { title: 'New Title', content: 'New content' }
      }
    });

    expect(container.textContent).toContain('修改前');
    expect(container.textContent).toContain('修改後');
  });

  it('marks changed fields with changed badge', () => {
    mount(DiffView, {
      target: container,
      props: {
        oldEntry: { title: 'Old', content: 'Same' },
        newEntry: { title: 'New', content: 'Same' }
      }
    });

    const changedBadges = container.querySelectorAll('.diff-badge--changed');
    const unchangedBadges = container.querySelectorAll('.diff-badge--unchanged');

    expect(changedBadges.length).toBeGreaterThanOrEqual(1);
    expect(unchangedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows topic stances diff', () => {
    mount(DiffView, {
      target: container,
      props: {
        oldEntry: {
          type: 'topic', title: 'Topic',
          stances: { DPP: 'old DPP', KMT: 'same', TPP: 'old TPP' }
        },
        newEntry: {
          type: 'topic', title: 'Topic',
          stances: { DPP: 'new DPP', KMT: 'same', TPP: 'new TPP' }
        }
      }
    });

    expect(container.textContent).toContain('各黨立場比較');
    expect(container.textContent).toContain('old DPP');
    expect(container.textContent).toContain('new DPP');

    // DPP and TPP should be changed, KMT unchanged
    const stancesSection = container.querySelector('.diff-stances-heading');
    expect(stancesSection).toBeTruthy();
  });

  it('shows unchanged for identical entries', () => {
    mount(DiffView, {
      target: container,
      props: {
        oldEntry: { title: 'Same', content: 'Same content', type: 'politician' },
        newEntry: { title: 'Same', content: 'Same content', type: 'politician' }
      }
    });

    const changedBadges = container.querySelectorAll('.diff-badge--changed');
    expect(changedBadges.length).toBe(0);

    const unchangedBadges = container.querySelectorAll('.diff-badge--unchanged');
    expect(unchangedBadges.length).toBeGreaterThan(0);
  });
});
