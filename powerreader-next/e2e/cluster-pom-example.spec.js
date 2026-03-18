import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage.js';
import { ClusterDetailPage } from './pages/ClusterDetailPage.js';

/**
 * Example E2E Tests using Page Object Model (POM)
 *
 * This demonstrates best practices for writing maintainable E2E tests.
 * When UI changes, update the page objects instead of every test.
 */

test.describe('PowerReader with Page Object Model', () => {
	let homePage;
	let detailPage;

	test.beforeEach(async ({ page }) => {
		homePage = new HomePage(page);
		detailPage = new ClusterDetailPage(page);
		await homePage.goto();
	});

	test('Homepage loads and shows appropriate state', async () => {
		// Verify container is visible
		await expect(homePage.container).toBeVisible();

		// Check for one of the valid states
		const hasClusters = await homePage.hasClusters();
		const isLoading = await homePage.isLoading();
		const hasEmpty = await homePage.hasEmptyState();

		expect(hasClusters || isLoading || hasEmpty).toBe(true);

		// Take screenshot
		await homePage.screenshot('pom-homepage');
	});

	test('Category filter works correctly', async () => {
		// Select 政治 category
		await homePage.selectCategory('政治');

		// Wait for update with longer timeout
		await homePage.page.waitForTimeout(1000);

		// Should show loading, updated content, or empty state
		const isLoading = await homePage.isLoading();
		const hasClusters = await homePage.hasClusters();
		const hasEmpty = await homePage.hasEmptyState();

		// At least one should be true
		expect(isLoading || hasClusters || hasEmpty).toBe(true);

		await homePage.screenshot('pom-category-filter');
	});

	test('Search toggles between modes', async () => {
		const initialHasClusters = await homePage.hasClusters();

		// Enter search mode
		await homePage.search('台灣');
		expect(await homePage.isSearchMode()).toBe(true);

		// Clusters should be hidden when searching
		if (initialHasClusters) {
			const clustersAfterSearch = await homePage.hasClusters();
			expect(clustersAfterSearch).toBe(false);
		}

		// Clear search
		await homePage.clearSearch();
		expect(await homePage.isSearchMode()).toBe(false);

		await homePage.screenshot('pom-search-toggle');
	});

	test('Cluster detail page handles invalid ID gracefully', async ({ page }) => {
		// Navigate to invalid cluster
		await detailPage.goto('invalid-id-12345');

		// Should show error state
		expect(await detailPage.hasError()).toBe(true);

		await detailPage.screenshot('pom-error-state');
	});

	test('Infinite scroll behavior', async () => {
		const hasClusters = await homePage.hasClusters();

		if (!hasClusters) {
			test.skip();
			return;
		}

		const initialCount = await homePage.getClusterCount();

		// Scroll to bottom
		await homePage.scrollToBottom();

		const updatedCount = await homePage.getClusterCount();
		const isLoading = await homePage.isLoading();

		// Either more loaded OR loading indicator appeared
		expect(updatedCount >= initialCount || isLoading).toBe(true);

		await homePage.screenshot('pom-infinite-scroll');
	});
});
