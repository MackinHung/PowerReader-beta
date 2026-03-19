/**
 * Unit tests for TopicStanceView.svelte
 *
 * Tests cover: three-party rendering, missing stance fallback, party colors
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from 'svelte';
import TopicStanceView from '../../src/lib/components/knowledge/TopicStanceView.svelte';

// Mock i18n
vi.mock('$lib/i18n/zh-TW.js', () => ({
  t: vi.fn((key) => {
    const map = {
      'knowledge.stances.title': '各黨立場比較',
      'knowledge.stances.dpp': '民主進步黨',
      'knowledge.stances.kmt': '中國國民黨',
      'knowledge.stances.tpp': '台灣民眾黨',
      'knowledge.stances.missing': '尚無此黨立場資料'
    };
    return map[key] || key;
  })
}));

function createContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('TopicStanceView', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders all three party cards with stances', () => {
    mount(TopicStanceView, {
      target: container,
      props: {
        stances: {
          DPP: 'DPP stance text',
          KMT: 'KMT stance text',
          TPP: 'TPP stance text'
        }
      }
    });

    expect(container.textContent).toContain('民主進步黨');
    expect(container.textContent).toContain('中國國民黨');
    expect(container.textContent).toContain('台灣民眾黨');
    expect(container.textContent).toContain('DPP stance text');
    expect(container.textContent).toContain('KMT stance text');
    expect(container.textContent).toContain('TPP stance text');
  });

  it('shows missing text when a party stance is absent', () => {
    mount(TopicStanceView, {
      target: container,
      props: {
        stances: {
          DPP: 'DPP has a stance',
          KMT: null,
          TPP: undefined
        }
      }
    });

    expect(container.textContent).toContain('DPP has a stance');
    const missingEls = container.querySelectorAll('.stance-missing');
    expect(missingEls.length).toBe(2);
    expect(missingEls[0].textContent).toBe('尚無此黨立場資料');
  });

  it('shows missing text when stances is empty object', () => {
    mount(TopicStanceView, {
      target: container,
      props: { stances: {} }
    });

    const missingEls = container.querySelectorAll('.stance-missing');
    expect(missingEls.length).toBe(3);
  });

  it('renders correct party colors in headers', () => {
    mount(TopicStanceView, {
      target: container,
      props: {
        stances: { DPP: 'a', KMT: 'b', TPP: 'c' }
      }
    });

    const headers = container.querySelectorAll('.stance-header');
    expect(headers[0].style.backgroundColor).toBe('rgb(27, 148, 49)');   // DPP green
    expect(headers[1].style.backgroundColor).toBe('rgb(0, 71, 171)');    // KMT blue
    expect(headers[2].style.backgroundColor).toBe('rgb(40, 200, 200)');  // TPP teal
  });

  it('renders section heading', () => {
    mount(TopicStanceView, {
      target: container,
      props: { stances: { DPP: 'x' } }
    });

    expect(container.querySelector('.stances-heading').textContent).toBe('各黨立場比較');
  });
});
