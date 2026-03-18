import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import StancePrism from '$lib/components/data-viz/StancePrism.svelte';

describe('StancePrism', () => {
	it('shows "needs AI" message when no data', () => {
		render(StancePrism);
		expect(screen.getByText(/議題立場需 AI 分析/)).toBeTruthy();
	});

	it('shows toggle button with data', () => {
		render(StancePrism, {
			props: { avgCampRatio: { dpp: 45, tpp: 20, kmt: 35 }, analyzedCount: 3, totalCount: 5 }
		});
		expect(screen.getByText('議題立場分析')).toBeTruthy();
	});

	it('does not show prism body initially (collapsed)', () => {
		const { container } = render(StancePrism, {
			props: { avgCampRatio: { dpp: 45, tpp: 20, kmt: 35 }, analyzedCount: 3, totalCount: 5 }
		});
		expect(container.querySelector('.prism-body')).toBeNull();
	});

	it('expands to show bars on click', async () => {
		const { container } = render(StancePrism, {
			props: { avgCampRatio: { dpp: 45, tpp: 20, kmt: 35 }, analyzedCount: 3, totalCount: 5 }
		});
		await fireEvent.click(screen.getByText('議題立場分析'));
		expect(container.querySelector('.prism-body')).toBeTruthy();
		expect(screen.getByText('民進黨')).toBeTruthy();
		expect(screen.getByText('民眾黨')).toBeTruthy();
		expect(screen.getByText('國民黨')).toBeTruthy();
	});

	it('shows correct percentages', async () => {
		render(StancePrism, {
			props: { avgCampRatio: { dpp: 45, tpp: 20, kmt: 35 }, analyzedCount: 3, totalCount: 5 }
		});
		await fireEvent.click(screen.getByText('議題立場分析'));
		expect(screen.getByText('45%')).toBeTruthy();
		expect(screen.getByText('20%')).toBeTruthy();
		expect(screen.getByText('35%')).toBeTruthy();
	});

	it('filters out zero-value parties', async () => {
		render(StancePrism, {
			props: { avgCampRatio: { dpp: 60, tpp: 0, kmt: 40 }, analyzedCount: 2, totalCount: 4 }
		});
		await fireEvent.click(screen.getByText('議題立場分析'));
		expect(screen.queryByText('民眾黨')).toBeNull();
	});

	it('shows coverage note with counts', async () => {
		render(StancePrism, {
			props: { avgCampRatio: { dpp: 50, kmt: 50 }, analyzedCount: 3, totalCount: 5 }
		});
		await fireEvent.click(screen.getByText('議題立場分析'));
		expect(screen.getByText(/基於 3\/5 篇已分析/)).toBeTruthy();
	});

	it('collapses on second click', async () => {
		const { container } = render(StancePrism, {
			props: { avgCampRatio: { dpp: 50, kmt: 50 }, analyzedCount: 2, totalCount: 3 }
		});
		const btn = screen.getByText('議題立場分析');
		await fireEvent.click(btn);
		expect(container.querySelector('.prism-body')).toBeTruthy();
		await fireEvent.click(btn);
		expect(container.querySelector('.prism-body')).toBeNull();
	});
});
