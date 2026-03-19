/**
 * Mock for $app/state (SvelteKit)
 * Provides a reactive-like page object for testing.
 */
export const page = {
  params: { id: 'test-cluster-1' },
  url: new URL('http://localhost/event/test-cluster-1'),
  route: { id: '/event/[id]' },
};
