import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ControversyPulse from '$lib/components/data-viz/ControversyPulse.svelte';

describe('ControversyPulse', () => {
	it('renders with default score 0', () => {
		render(ControversyPulse);
		const meter = screen.getByRole('meter');
		expect(meter.getAttribute('aria-valuenow')).toBe('0');
		expect(meter.getAttribute('aria-label')).toContain('低');
	});

	it('shows correct tier for low score (10)', () => {
		render(ControversyPulse, { props: { score: 10 } });
		expect(screen.getByRole('meter').getAttribute('aria-label')).toContain('低');
		expect(screen.getByText('10')).toBeTruthy();
	});

	it('shows correct tier for medium score (50)', () => {
		render(ControversyPulse, { props: { score: 50 } });
		expect(screen.getByRole('meter').getAttribute('aria-label')).toContain('中');
	});

	it('shows correct tier for high score (90)', () => {
		render(ControversyPulse, { props: { score: 90 } });
		expect(screen.getByRole('meter').getAttribute('aria-label')).toContain('高');
	});

	it('adds pulse class for scores > 60', () => {
		const { container } = render(ControversyPulse, { props: { score: 70 } });
		expect(container.querySelector('.pulse')).toBeTruthy();
	});

	it('no pulse class for scores <= 60', () => {
		const { container } = render(ControversyPulse, { props: { score: 40 } });
		expect(container.querySelector('.pulse')).toBeNull();
	});
});
