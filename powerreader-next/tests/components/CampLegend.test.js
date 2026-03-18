import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CampLegend from '$lib/components/data-viz/CampLegend.svelte';

describe('CampLegend', () => {
	it('shows media labels by default', () => {
		render(CampLegend);
		expect(screen.getByText('偏綠媒體')).toBeTruthy();
		expect(screen.getByText('中立媒體')).toBeTruthy();
		expect(screen.getByText('偏藍媒體')).toBeTruthy();
	});

	it('shows stance labels in stance mode', () => {
		render(CampLegend, { props: { mode: 'stance' } });
		expect(screen.getByText('民進黨')).toBeTruthy();
		expect(screen.getByText('民眾黨')).toBeTruthy();
		expect(screen.getByText('國民黨')).toBeTruthy();
	});

	it('has correct aria-label for media mode', () => {
		render(CampLegend, { props: { mode: 'media' } });
		expect(screen.getByRole('list').getAttribute('aria-label')).toBe('媒體陣營圖例');
	});

	it('has correct aria-label for stance mode', () => {
		render(CampLegend, { props: { mode: 'stance' } });
		expect(screen.getByRole('list').getAttribute('aria-label')).toBe('議題立場圖例');
	});
});
