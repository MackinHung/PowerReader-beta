import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CoverageRing from '$lib/components/data-viz/CoverageRing.svelte';

describe('CoverageRing', () => {
	it('renders with default props', () => {
		render(CoverageRing);
		expect(screen.getByText('媒體陣營')).toBeTruthy();
	});

	it('calculates correct percentages', () => {
		render(CoverageRing, { props: { green: 3, white: 1, blue: 1 } });
		const el = screen.getByRole('img');
		expect(el.getAttribute('aria-label')).toContain('偏綠 60%');
		expect(el.getAttribute('aria-label')).toContain('中立 20%');
		expect(el.getAttribute('aria-label')).toContain('偏藍 20%');
	});

	it('shows 100% for single camp', () => {
		render(CoverageRing, { props: { green: 5, white: 0, blue: 0 } });
		const el = screen.getByRole('img');
		expect(el.getAttribute('aria-label')).toContain('偏綠 100%');
	});

	it('shows missing hint when a camp has 0 articles but others exist', () => {
		render(CoverageRing, { props: { green: 5, white: 0, blue: 3 } });
		expect(screen.getByText(/缺少中立觀點/)).toBeTruthy();
	});

	it('shows no missing hint when all camps present', () => {
		render(CoverageRing, { props: { green: 3, white: 2, blue: 1 } });
		expect(screen.queryByText(/缺少/)).toBeNull();
	});

	it('handles all zeros gracefully', () => {
		render(CoverageRing, { props: { green: 0, white: 0, blue: 0 } });
		const el = screen.getByRole('img');
		expect(el.getAttribute('aria-label')).toContain('偏綠 0%');
	});

	it('shows percentage labels when segment > 15%', () => {
		render(CoverageRing, { props: { green: 8, white: 1, blue: 1 } });
		expect(screen.getByText('80%')).toBeTruthy();
	});

	it('shows multiple missing camps', () => {
		render(CoverageRing, { props: { green: 0, white: 0, blue: 5 } });
		expect(screen.getByText(/缺少偏綠、中立觀點/)).toBeTruthy();
	});
});
