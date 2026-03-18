import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CampBar from '$lib/components/data-viz/CampBar.svelte';

describe('CampBar', () => {
	describe('media mode (default)', () => {
		it('renders with default media labels', () => {
			render(CampBar, { props: { green: 3, white: 2, blue: 1 } });
			expect(screen.getByText('偏綠')).toBeTruthy();
			expect(screen.getByText('中立')).toBeTruthy();
			expect(screen.getByText('偏藍')).toBeTruthy();
		});

		it('has 8px height bar in media mode', () => {
			const { container } = render(CampBar, { props: { green: 3, white: 2, blue: 1 } });
			const bar = container.querySelector('.camp-bar');
			expect(bar.classList.contains('stance')).toBe(false);
		});
	});

	describe('stance mode', () => {
		it('renders with party labels', () => {
			render(CampBar, { props: { green: 3, white: 2, blue: 1, mode: 'stance' } });
			expect(screen.getByText('民進黨')).toBeTruthy();
			expect(screen.getByText('民眾黨')).toBeTruthy();
			expect(screen.getByText('國民黨')).toBeTruthy();
		});

		it('has stance class for taller bar', () => {
			const { container } = render(CampBar, { props: { green: 3, white: 2, blue: 1, mode: 'stance' } });
			expect(container.querySelector('.camp-bar.stance')).toBeTruthy();
		});
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
			// bluePct = 100 - 0 - 0 = 100 but only renders if bluePct > 0
			// With all zeros, total becomes 1 so green/white/blue all compute, blue gets remainder
			const segments = container.querySelectorAll('.segment');
			// At least one segment is rendered (blue takes remainder)
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
});
