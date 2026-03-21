import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ClusterCardV2 from '$lib/components/article/ClusterCardV2.svelte';

// Mock $app/navigation for goto calls
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const makeCluster = (overrides = {}) => ({
	cluster_id: 'test-1',
	representative_title: '總統府召開國安會議',
	category: '政治',
	article_count: 5,
	source_count: 3,
	sources_json: JSON.stringify([
		{ source: 'liberty_times', count: 2 },
		{ source: 'cna', count: 2 },
		{ source: 'udn', count: 1 },
	]),
	earliest_published_at: '2026-03-18T06:00:00Z',
	latest_published_at: '2026-03-18T10:00:00Z',
	is_blindspot: false,
	blindspot_type: null,
	avg_camp_ratio: null,
	analyzed_count: 0,
	...overrides,
});

describe('ClusterCardV2', () => {
	it('renders title and metadata', () => {
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster() } });
		expect(screen.getByText('總統府召開國安會議')).toBeTruthy();
		expect(screen.getByText('政治')).toBeTruthy();
		// Stats are split across <span class="num"> and <span class="label">
		const statItems = container.querySelectorAll('.stat-item');
		expect(statItems.length).toBe(2);
		expect(statItems[0].textContent).toMatch(/5/);
		expect(statItems[0].textContent).toMatch(/篇/);
		expect(statItems[1].textContent).toMatch(/3/);
		expect(statItems[1].textContent).toMatch(/家/);
	});

	it('renders category chip with correct color', () => {
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster() } });
		const chip = container.querySelector('.category-chip');
		expect(chip).toBeTruthy();
		expect(chip.textContent.trim()).toBe('政治');
		expect(chip.style.background).toContain('255, 51, 102');
	});

	it('does NOT render media camp section (CoverageRing removed)', () => {
		render(ClusterCardV2, { props: { cluster: makeCluster() } });
		expect(screen.queryByText('媒體陣營')).toBeNull();
	});

	it('renders heat badge with score', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ avg_emotion_intensity: 80, heat_score: 80 }) }
		});
		const badge = container.querySelector('.heat-badge');
		expect(badge).toBeTruthy();
		expect(badge.textContent).toContain('80');
	});

	it('renders camp bar when avg_camp_ratio exists', () => {
		const { container } = render(ClusterCardV2, {
			props: {
				cluster: makeCluster({
					avg_camp_ratio: JSON.stringify({ green: 45, white: 20, blue: 35 }),
					analyzed_count: 3,
				})
			}
		});
		expect(container.querySelector('.camp-bar-wrapper')).toBeTruthy();
	});

	it('does not render camp bar when avg_camp_ratio is null', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ avg_camp_ratio: null }) }
		});
		expect(container.querySelector('.camp-bar-wrapper')).toBeNull();
	});

	it('fires onclick when clicked', async () => {
		const handler = vi.fn();
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster(), onclick: handler } });
		await fireEvent.click(container.querySelector('.brutalist-card'));
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('fires onclick on Enter key', async () => {
		const handler = vi.fn();
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster(), onclick: handler } });
		await fireEvent.keyDown(container.querySelector('.brutalist-card'), { key: 'Enter' });
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('renders title in card-title element', () => {
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster() } });
		const title = container.querySelector('.card-title');
		expect(title).toBeTruthy();
		expect(title.textContent.trim()).toBe('總統府召開國安會議');
	});

	it('has correct aria-label', () => {
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster() } });
		const card = container.querySelector('.brutalist-card');
		expect(card.getAttribute('aria-label')).toBe('事件: 總統府召開國安會議');
	});

	it('renders footer with time icon', () => {
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster() } });
		const footer = container.querySelector('.card-footer');
		expect(footer).toBeTruthy();
		const icon = footer.querySelector('.time-icon');
		expect(icon).toBeTruthy();
		expect(icon.textContent.trim()).toBe('schedule');
	});

	it('renders empty div when no category', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ category: null }) }
		});
		expect(container.querySelector('.category-chip')).toBeNull();
	});
});
