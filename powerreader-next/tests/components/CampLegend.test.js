import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CampLegend from '$lib/components/data-viz/CampLegend.svelte';

describe('CampLegend', () => {
	it('shows party stance labels', () => {
		render(CampLegend);
		expect(screen.getByText('民進黨')).toBeTruthy();
		expect(screen.getByText('民眾黨')).toBeTruthy();
		expect(screen.getByText('國民黨')).toBeTruthy();
	});

	it('does not show media camp labels', () => {
		render(CampLegend);
		expect(screen.queryByText('偏綠媒體')).toBeNull();
		expect(screen.queryByText('中立媒體')).toBeNull();
		expect(screen.queryByText('偏藍媒體')).toBeNull();
	});

	it('has correct aria-label for stance legend', () => {
		render(CampLegend);
		expect(screen.getByRole('list').getAttribute('aria-label')).toBe('議題立場圖例');
	});

	it('renders gradient dots for each party', () => {
		const { container } = render(CampLegend);
		const dots = container.querySelectorAll('.dot.gradient');
		expect(dots.length).toBe(3);
		// Each dot uses gradient background
		dots.forEach(dot => {
			expect(dot.style.backgroundImage).toContain('linear-gradient');
		});
	});
});
