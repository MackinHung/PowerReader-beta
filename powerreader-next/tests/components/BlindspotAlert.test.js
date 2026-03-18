import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BlindspotAlert from '$lib/components/data-viz/BlindspotAlert.svelte';

describe('BlindspotAlert', () => {
	it('renders nothing when isBlindspot is false', () => {
		const { container } = render(BlindspotAlert, { props: { type: 'green_only', isBlindspot: false } });
		expect(container.querySelector('.blindspot-alert')).toBeNull();
	});

	it('renders nothing when type is empty', () => {
		const { container } = render(BlindspotAlert, { props: { type: '', isBlindspot: true } });
		expect(container.querySelector('.blindspot-alert')).toBeNull();
	});

	it('renders green_only alert', () => {
		render(BlindspotAlert, { props: { type: 'green_only', isBlindspot: true } });
		expect(screen.getByRole('alert')).toBeTruthy();
		expect(screen.getByText(/僅綠營報導/)).toBeTruthy();
	});

	it('renders blue_only alert', () => {
		render(BlindspotAlert, { props: { type: 'blue_only', isBlindspot: true } });
		expect(screen.getByText(/僅藍營報導/)).toBeTruthy();
	});

	it('renders white_missing alert', () => {
		render(BlindspotAlert, { props: { type: 'white_missing', isBlindspot: true } });
		expect(screen.getByText(/缺乏中立報導/)).toBeTruthy();
	});

	it('renders imbalanced alert', () => {
		render(BlindspotAlert, { props: { type: 'imbalanced', isBlindspot: true } });
		expect(screen.getByText(/報導失衡/)).toBeTruthy();
	});
});
