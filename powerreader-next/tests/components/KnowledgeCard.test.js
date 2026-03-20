/**
 * Unit tests for KnowledgeCard.svelte
 *
 * Tests cover: rendering, type icons, party badges, click handler, snippet truncation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from 'svelte';
import KnowledgeCard from '../../src/lib/components/knowledge/KnowledgeCard.svelte';

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'knowledge.type.politician': '政治人物',
      'knowledge.type.media': '媒體',
      'knowledge.type.event': '事件',
      'knowledge.type.topic': '議題',
      'knowledge.party.KMT': '國民黨',
      'knowledge.party.DPP': '民進黨',
      'knowledge.party.TPP': '民眾黨',
      'knowledge.stances.compare': '立場比較'
    };
    return map[key] || key;
  })
}));

function createContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('KnowledgeCard', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders entry title', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test Person', content: 'Bio text', party: null },
        onclick: () => {}
      }
    });

    expect(container.textContent).toContain('Test Person');
  });

  it('renders type badge', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: 'c', party: null },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.type-badge').textContent).toBe('政治人物');
  });

  it('renders type icon for politician', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: 'c', party: null },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.type-icon').textContent).toBe('person');
  });

  it('renders party info for KMT politician (figure-header)', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: 'c', party: 'KMT' },
        onclick: () => {}
      }
    });

    const header = container.querySelector('.figure-header');
    expect(header).toBeTruthy();
    expect(container.querySelector('.figure-party').textContent).toBe('國民黨');
    expect(container.querySelector('.figure-name').textContent).toBe('Test');
    expect(container.querySelector('.party-logo')).toBeTruthy();
  });

  it('renders party info for DPP politician (figure-header)', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: 'c', party: 'DPP' },
        onclick: () => {}
      }
    });

    const header = container.querySelector('.figure-header');
    expect(header).toBeTruthy();
    expect(container.querySelector('.figure-party').textContent).toBe('民進黨');
  });

  it('does not render figure-header when party is null', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'e1', type: 'event', title: 'Test', content: 'c', party: null },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.figure-header')).toBeNull();
  });

  it('truncates content to 120 chars', () => {
    const longContent = 'A'.repeat(200);
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: longContent, party: null },
        onclick: () => {}
      }
    });

    const snippet = container.querySelector('.card-snippet').textContent;
    expect(snippet.length).toBeLessThanOrEqual(124); // 120 + "..."
    expect(snippet).toContain('...');
  });

  it('does not truncate short content', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: 'Short bio', party: null },
        onclick: () => {}
      }
    });

    const snippet = container.querySelector('.card-snippet').textContent;
    expect(snippet).toBe('Short bio');
  });

  it('calls onclick when clicked', async () => {
    const spy = vi.fn();
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'p1', type: 'politician', title: 'Test', content: 'c', party: null },
        onclick: spy
      }
    });

    container.querySelector('.knowledge-card').click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('renders event type icon', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: { id: 'e1', type: 'event', title: 'Test', content: 'c', party: null },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.type-icon').textContent).toBe('event');
  });

  // ── Topic entry tests ──

  it('renders stance dots for topic entry', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: {
          id: 'topic1', type: 'topic', title: 'Test Topic',
          stances: { DPP: 'a', KMT: 'b', TPP: 'c' }
        },
        onclick: () => {}
      }
    });

    const dots = container.querySelectorAll('.dot');
    expect(dots.length).toBe(3);
    expect(container.querySelector('.stance-label').textContent).toBe('立場比較');
  });

  it('does not show figure-header for topic entry', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: {
          id: 'topic1', type: 'topic', title: 'Test Topic',
          stances: { DPP: 'a', KMT: 'b', TPP: 'c' }, party: 'DPP'
        },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.figure-header')).toBeNull();
  });

  it('does not show content snippet for topic entry', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: {
          id: 'topic1', type: 'topic', title: 'Test Topic',
          content: 'Should not appear', stances: { DPP: 'a' }
        },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.card-snippet')).toBeNull();
  });

  it('shows type badge for topic entry', () => {
    mount(KnowledgeCard, {
      target: container,
      props: {
        entry: {
          id: 'topic1', type: 'topic', title: 'Test Topic',
          stances: { DPP: 'a' }
        },
        onclick: () => {}
      }
    });

    expect(container.querySelector('.type-badge').textContent).toBe('議題');
  });
});
