import { describe, it, expect } from 'vitest';

describe('project setup', () => {
	it('vitest is configured correctly', () => {
		expect(true).toBe(true);
	});

	it('can import from $lib', async () => {
		const lib = await import('$lib');
		expect(lib).toBeDefined();
	});
});
