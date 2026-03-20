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
		render(ClusterCardV2, { props: { cluster: makeCluster() } });
		expect(screen.getByText('總統府召開國安會議')).toBeTruthy();
		expect(screen.getByText('政治')).toBeTruthy();
		expect(screen.getByText(/5 篇/)).toBeTruthy();
		expect(screen.getByText(/3 家媒體/)).toBeTruthy();
	});

	it('renders source badges (neutral, no camp coloring)', () => {
		render(ClusterCardV2, { props: { cluster: makeCluster() } });
		expect(screen.getByText('自由時報')).toBeTruthy();
		expect(screen.getByText('中央社')).toBeTruthy();
		expect(screen.getByText('聯合新聞網')).toBeTruthy();
	});

	it('does NOT render media camp section (CoverageRing removed)', () => {
		render(ClusterCardV2, { props: { cluster: makeCluster() } });
		expect(screen.queryByText('媒體陣營')).toBeNull();
	});

	it('has hot class when avg_emotion_intensity > 60', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ avg_emotion_intensity: 80 }) }
		});
		expect(container.querySelector('.hot')).toBeTruthy();
	});

	it('no hot class when avg_emotion_intensity <= 60', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ avg_emotion_intensity: 40 }) }
		});
		expect(container.querySelector('.hot')).toBeNull();
	});

	it('shows StancePrism with "needs AI" when no avg_camp_ratio', () => {
		render(ClusterCardV2, { props: { cluster: makeCluster() } });
		expect(screen.getByText(/議題立場需 AI 分析/)).toBeTruthy();
	});

	it('shows StancePrism with data when avg_camp_ratio exists', () => {
		render(ClusterCardV2, {
			props: {
				cluster: makeCluster({
					avg_camp_ratio: JSON.stringify({ dpp: 45, tpp: 20, kmt: 35 }),
					analyzed_count: 3,
				})
			}
		});
		expect(screen.getByText('議題立場分析')).toBeTruthy();
	});

	it('fires onclick when clicked', async () => {
		const handler = vi.fn();
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster(), onclick: handler } });
		await fireEvent.click(container.querySelector('.cluster-v2-wrapper'));
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('fires onclick on Enter key', async () => {
		const handler = vi.fn();
		const { container } = render(ClusterCardV2, { props: { cluster: makeCluster(), onclick: handler } });
		await fireEvent.keyDown(container.querySelector('.cluster-v2-wrapper'), { key: 'Enter' });
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('shows sub-cluster badge when sub_cluster_count > 1', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ sub_cluster_count: 3 }) }
		});
		expect(container.querySelector('.sub-badge')).toBeTruthy();
		expect(container.querySelector('.sub-badge').textContent).toContain('3');
	});

	it('does NOT show sub-cluster badge when sub_cluster_count is 1', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster({ sub_cluster_count: 1 }) }
		});
		expect(container.querySelector('.sub-badge')).toBeNull();
	});

	it('does NOT show sub-cluster badge when sub_cluster_count is undefined', () => {
		const { container } = render(ClusterCardV2, {
			props: { cluster: makeCluster() }
		});
		expect(container.querySelector('.sub-badge')).toBeNull();
	});
});
