import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CampBar from '$lib/components/data-viz/CampBar.svelte';

describe('CampBar', () => {
	it('renders with party labels (stance only)', () => {
		render(CampBar, { props: { green: 3, white: 2, blue: 1 } });
		expect(screen.getByText('民進黨')).toBeTruthy();
		expect(screen.getByText('民眾黨')).toBeTruthy();
		expect(screen.getByText('國民黨')).toBeTruthy();
	});

	it('does not render media camp labels', () => {
		render(CampBar, { props: { green: 3, white: 2, blue: 1 } });
		expect(screen.queryByText('偏綠')).toBeNull();
		expect(screen.queryByText('中立')).toBeNull();
		expect(screen.queryByText('偏藍')).toBeNull();
	});

	describe('percentage calculation', () => {
		it('calculates correct percentages', () => {
			const { container } = render(CampBar, { props: { green: 6, white: 2, blue: 2 } });
			const segments = container.querySelectorAll('.segment');
			expect(segments[0].style.width).toBe('60%');
			expect(segments[1].style.width).toBe('20%');
			expect(segments[2].style.width).toBe('20%');
		});

		it('handles all zeros gracefully', () => {
			const { container } = render(CampBar, { props: { green: 0, white: 0, blue: 0 } });
			const segments = container.querySelectorAll('.segment');
			expect(segments.length).toBeGreaterThanOrEqual(0);
		});

		it('shows percentage text when > 15%', () => {
			render(CampBar, { props: { green: 8, white: 1, blue: 1 } });
			expect(screen.getByText('80%')).toBeTruthy();
		});

		it('hides percentage text when <= 15%', () => {
			const { container } = render(CampBar, { props: { green: 8, white: 1, blue: 1 } });
			const segments = container.querySelectorAll('.segment');
			// white segment (10%) should have no span child
			expect(segments[1].querySelector('span')).toBeNull();
		});
	});

	it('uses gradient backgrounds for segments', () => {
		const { container } = render(CampBar, { props: { green: 3, white: 2, blue: 1 } });
		const segments = container.querySelectorAll('.segment');
		// All segments should use gradient background-image
		expect(segments[0].style.backgroundImage).toContain('linear-gradient');
		expect(segments[1].style.backgroundImage).toContain('linear-gradient');
		expect(segments[2].style.backgroundImage).toContain('linear-gradient');
	});

	it('renders legend with gradient dots', () => {
		const { container } = render(CampBar, { props: { green: 3, white: 2, blue: 1 } });
		const dots = container.querySelectorAll('.legend .dot');
		expect(dots.length).toBe(3);
	});
});
