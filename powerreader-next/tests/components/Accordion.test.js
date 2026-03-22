/**
 * Tests for Accordion component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Accordion from '../../src/lib/components/ui/Accordion.svelte';

describe('Accordion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title text', () => {
    render(Accordion, { props: { title: '子事件標題' } });
    expect(screen.getByText('子事件標題')).toBeTruthy();
  });

  it('renders badge when provided', () => {
    render(Accordion, { props: { title: '標題', badge: '3 篇' } });
    expect(screen.getByText('3 篇')).toBeTruthy();
  });

  it('does not render badge element when badge is empty', () => {
    const { container } = render(Accordion, { props: { title: '標題' } });
    expect(container.querySelector('.accordion-badge')).toBeNull();
  });

  it('is collapsed by default (aria-expanded=false)', () => {
    render(Accordion, { props: { title: '標題' } });
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('is expanded when open={true}', () => {
    render(Accordion, { props: { title: '標題', open: true } });
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles aria-expanded on click', async () => {
    render(Accordion, { props: { title: '標題' } });
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles on Enter key', async () => {
    render(Accordion, { props: { title: '標題' } });
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles on Space key', async () => {
    render(Accordion, { props: { title: '標題' } });
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.keyDown(trigger, { key: ' ' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('has chevron icon with expanded class when open', () => {
    const { container } = render(Accordion, { props: { title: '標題', open: true } });
    const chevron = container.querySelector('.accordion-chevron');
    expect(chevron).toBeTruthy();
    expect(chevron.classList.contains('expanded')).toBe(true);
  });

  it('has chevron icon without expanded class when closed', () => {
    const { container } = render(Accordion, { props: { title: '標題', open: false } });
    const chevron = container.querySelector('.accordion-chevron');
    expect(chevron).toBeTruthy();
    expect(chevron.classList.contains('expanded')).toBe(false);
  });

  it('has region role on panel with matching aria-controls', () => {
    const { container } = render(Accordion, { props: { title: '標題' } });
    const trigger = screen.getByRole('button');
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const region = container.querySelector(`#${controlsId}`);
    expect(region).toBeTruthy();
    expect(region.getAttribute('role')).toBe('region');
  });
});
