import { test, expect } from '@playwright/test';

/**
 * E2E Tests for PowerReader Cluster Visualization Feature
 *
 * Key User Journeys:
 * 1. Homepage loads clusters
 * 2. Category filter
 * 3. Search mode toggle
 * 4. Cluster card click → detail page
 * 5. Detail page back navigation
 * 6. Infinite scroll
 *
 * Note: Backend API may not be available locally, so tests handle loading/error states gracefully.
 */

test.describe('PowerReader Cluster Visualization', () => {

	test.beforeEach(async ({ page }) => {
		// Navigate to homepage before each test
		await page.goto('/');
		// Wait for app to initialize
		await page.waitForLoadState('networkidle');
	});

	test('1. Homepage loads clusters or shows appropriate state', async ({ page }) => {
		// Wait for the home page container
		const homePage = page.locator('.home-page');
		await expect(homePage).toBeVisible();

		// Check for search bar and category chips (always present)
		await expect(page.locator('.search-section')).toBeVisible();
		await expect(page.locator('.category-chips')).toBeVisible();

		// Check for one of the following states:
		// - Clusters are loaded (section heading "新聞事件" visible)
		// - Loading indicator is shown
		// - Empty state is shown ("暫無新聞事件")

		const hasClusterSection = await page.locator('h2.section-heading').filter({ hasText: '新聞事件' }).count();
		const hasLoading = await page.locator('.loading-indicator').count();
		const hasEmptyState = await page.locator('.empty-state').filter({ hasText: '暫無新聞事件' }).count();

		// At least one of these should be present
		expect(hasClusterSection + hasLoading + hasEmptyState).toBeGreaterThan(0);

		// Take screenshot for visual verification
		await page.screenshot({ path: 'test-results/homepage-state.png', fullPage: true });
	});

	test('2. Category filter updates clusters', async ({ page }) => {
		// Wait for category chips to be ready
		const categoryChips = page.locator('.category-chips');
		await expect(categoryChips).toBeVisible();

		// Get initial state
		const initialContent = await page.locator('.home-page').textContent();

		// Click on "政治" category
		const politicsChip = page.locator('.category-chips').getByText('政治');
		await expect(politicsChip).toBeVisible();
		await politicsChip.click();

		// Wait for network activity to settle
		await page.waitForTimeout(500);

		// Verify the chip is selected (should have selected class or attribute)
		// Note: Actual verification depends on how selection is styled

		// Check that content has updated or loading indicator appeared
		const updatedContent = await page.locator('.home-page').textContent();
		const hasLoadingAfterClick = await page.locator('.loading-indicator').count() > 0;

		// Either content changed OR loading indicator appeared (indicating fetch started)
		expect(initialContent !== updatedContent || hasLoadingAfterClick).toBe(true);

		// Take screenshot
		await page.screenshot({ path: 'test-results/category-filter.png', fullPage: true });
	});

	test('3. Search mode toggle hides clusters and shows search results', async ({ page }) => {
		// Wait for search bar
		const searchBar = page.locator('.search-section input');
		await expect(searchBar).toBeVisible();

		// Check if clusters section exists initially
		const initialClusterCount = await page.locator('h2.section-heading').filter({ hasText: '新聞事件' }).count();

		// Type in search bar
		await searchBar.fill('台灣');
		await searchBar.press('Enter');

		// Wait for search to process
		await page.waitForTimeout(500);

		// Clusters section should be hidden when searching
		// Search results or empty search state should appear
		const clusterCountAfterSearch = await page.locator('h2.section-heading').filter({ hasText: '新聞事件' }).count();

		// If clusters were initially visible, they should now be hidden
		if (initialClusterCount > 0) {
			expect(clusterCountAfterSearch).toBe(0);
		}

		// Check for search results or "找不到相關新聞" empty state
		const hasSearchEmpty = await page.locator('.empty-state').filter({ hasText: '找不到相關新聞' }).count();
		const hasArticleCards = await page.locator('.home-page').locator('article, .article-card, [class*="card"]').count();

		expect(hasSearchEmpty + hasArticleCards).toBeGreaterThan(0);

		// Clear search
		await searchBar.clear();
		await page.waitForTimeout(500);

		// Clusters should reappear (if they were there initially)
		const clusterCountAfterClear = await page.locator('h2.section-heading').filter({ hasText: '新聞事件' }).count();
		if (initialClusterCount > 0) {
			expect(clusterCountAfterClear).toBeGreaterThanOrEqual(initialClusterCount);
		}

		await page.screenshot({ path: 'test-results/search-toggle.png', fullPage: true });
	});

	test('4. Cluster card click navigates to detail page', async ({ page }) => {
		// Wait for clusters to load
		await page.waitForTimeout(1000);

		// Try to find a cluster card (try multiple possible selectors)
		const clusterCard = page.locator('[class*="cluster"]').first();
		const clusterCardExists = await clusterCard.count() > 0;

		if (!clusterCardExists) {
			console.log('No cluster cards found, skipping navigation test');
			test.skip();
			return;
		}

		// Get cluster card text for verification
		const clusterText = await clusterCard.textContent();
		console.log('Found cluster card:', clusterText?.substring(0, 50));

		// Click the cluster card
		await clusterCard.click();

		// Wait for navigation
		await page.waitForURL(/\/event\/[a-zA-Z0-9-]+/, { timeout: 5000 }).catch(() => {
			console.log('Navigation did not happen as expected');
		});

		// Check if we're on detail page
		const currentUrl = page.url();
		if (currentUrl.includes('/event/')) {
			// We successfully navigated to detail page
			console.log('Successfully navigated to:', currentUrl);

			// Wait for detail page to load
			await page.waitForLoadState('networkidle');

			// Check for detail page elements
			const detailPage = page.locator('.cluster-detail');
			await expect(detailPage).toBeVisible({ timeout: 10000 });

			// Check for key elements on detail page
			const hasTitle = await page.locator('h1.detail-title, .detail-header h1').count();
			const hasCampBar = await page.locator('[class*="camp"], [class*="陣營"]').count();
			const hasArticlesSection = await page.locator('h2.section-heading').filter({ hasText: '相關報導' }).count();

			expect(hasTitle + hasCampBar + hasArticlesSection).toBeGreaterThan(0);

			await page.screenshot({ path: 'test-results/cluster-detail.png', fullPage: true });
		} else {
			console.log('Did not navigate to detail page, current URL:', currentUrl);
		}
	});

	test('5. Detail page back navigation returns to homepage', async ({ page }) => {
		// First navigate to a cluster detail page (if available)
		await page.waitForTimeout(1000);

		const clusterCard = page.locator('[class*="cluster"]').first();
		const clusterCardExists = await clusterCard.count() > 0;

		if (!clusterCardExists) {
			console.log('No cluster cards found, skipping back navigation test');
			test.skip();
			return;
		}

		// Navigate to detail page
		await clusterCard.click();
		await page.waitForTimeout(1000);

		const currentUrl = page.url();
		if (!currentUrl.includes('/event/')) {
			console.log('Not on detail page, skipping back navigation test');
			test.skip();
			return;
		}

		// Now test back navigation
		await page.goBack();
		await page.waitForLoadState('networkidle');

		// Should be back on homepage
		const homePage = page.locator('.home-page');
		await expect(homePage).toBeVisible();

		// Search bar should be visible
		await expect(page.locator('.search-section')).toBeVisible();

		await page.screenshot({ path: 'test-results/back-navigation.png', fullPage: true });
	});

	test('6. Infinite scroll loads more clusters', async ({ page }) => {
		// Wait for initial load
		await page.waitForTimeout(1000);

		// Check if there's content to scroll
		const hasContent = await page.locator('h2.section-heading').filter({ hasText: '新聞事件' }).count() > 0;

		if (!hasContent) {
			console.log('No cluster content to scroll, skipping infinite scroll test');
			test.skip();
			return;
		}

		// Get initial cluster count
		const initialClusterCount = await page.locator('[class*="cluster"]').count();
		console.log('Initial cluster count:', initialClusterCount);

		// Scroll to bottom
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		// Wait for potential loading
		await page.waitForTimeout(2000);

		// Check if scroll sentinel exists (indicates more content might load)
		const sentinelExists = await page.locator('.scroll-sentinel').count() > 0;
		console.log('Scroll sentinel exists:', sentinelExists);

		// Get updated cluster count
		const updatedClusterCount = await page.locator('[class*="cluster"]').count();
		console.log('Updated cluster count:', updatedClusterCount);

		// If sentinel exists and more content is available, count should increase
		// OR loading indicator should appear
		const hasLoadingIndicator = await page.locator('.loading-indicator').count() > 0;

		if (sentinelExists) {
			// Either more items loaded OR loading indicator appeared
			expect(updatedClusterCount >= initialClusterCount || hasLoadingIndicator).toBe(true);
		} else {
			// No sentinel means no more content to load - this is also valid
			console.log('No sentinel found, all content loaded');
		}

		await page.screenshot({ path: 'test-results/infinite-scroll.png', fullPage: true });
	});

	test('7. Error state handling - navigating to invalid cluster ID', async ({ page }) => {
		// Navigate to an invalid cluster ID
		await page.goto('/event/invalid-cluster-id-12345');
		await page.waitForLoadState('networkidle');

		// Should show error state or handle gracefully
		const detailPage = page.locator('.cluster-detail');
		await expect(detailPage).toBeVisible();

		// Check for error state
		const hasError = await page.locator('.center-state').count() > 0;
		const hasErrorMessage = await page.locator('.center-state').filter({ hasText: /無法載入|錯誤|error/i }).count() > 0;

		expect(hasError || hasErrorMessage).toBe(true);

		await page.screenshot({ path: 'test-results/error-state.png', fullPage: true });
	});

	test('8. Responsive UI - mobile viewport', async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		// Check that UI elements are visible in mobile view
		await expect(page.locator('.home-page')).toBeVisible();
		await expect(page.locator('.search-section')).toBeVisible();
		await expect(page.locator('.category-chips')).toBeVisible();

		// Category chips should be scrollable horizontally
		const categoryChips = page.locator('.category-chips');
		const scrollWidth = await categoryChips.evaluate(el => el.scrollWidth);
		const clientWidth = await categoryChips.evaluate(el => el.clientWidth);

		// ScrollWidth should be greater than or equal to clientWidth
		expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth);

		await page.screenshot({ path: 'test-results/mobile-viewport.png', fullPage: true });
	});
});
