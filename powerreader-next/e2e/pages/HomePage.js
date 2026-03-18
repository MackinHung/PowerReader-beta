/**
 * Page Object Model for PowerReader Homepage
 *
 * Encapsulates locators and actions for the homepage to improve test maintainability.
 * When UI changes, update this file instead of every test.
 */

export class HomePage {
	constructor(page) {
		this.page = page;

		// Locators
		this.container = page.locator('.home-page');
		this.searchBar = page.locator('.search-section input');
		this.categoryChips = page.locator('.category-chips');
		this.clusterSection = page.locator('h2.section-heading').filter({ hasText: '新聞事件' });
		this.unclusteredSection = page.locator('h2.section-heading').filter({ hasText: '其他報導' });
		this.loadingIndicator = page.locator('.loading-indicator');
		this.emptyState = page.locator('.empty-state');
		this.refreshIndicator = page.locator('.refresh-indicator');
		this.scrollSentinel = page.locator('.scroll-sentinel');

		// Cluster cards (multiple possible selectors)
		this.clusterCards = page.locator('[class*="cluster"]');

		// Article cards
		this.articleCards = page.locator('.article-card, [class*="article"]');
	}

	/**
	 * Navigate to homepage
	 */
	async goto() {
		await this.page.goto('/');
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Search for articles
	 * @param {string} query - Search query
	 */
	async search(query) {
		await this.searchBar.fill(query);
		await this.searchBar.press('Enter');
		await this.page.waitForTimeout(500); // Wait for search to process
	}

	/**
	 * Clear search
	 */
	async clearSearch() {
		await this.searchBar.clear();
		await this.page.waitForTimeout(500);
	}

	/**
	 * Select a category
	 * @param {string} categoryName - Category name (e.g., '政治', '社會')
	 */
	async selectCategory(categoryName) {
		const chip = this.categoryChips.getByText(categoryName);
		await chip.click();
		await this.page.waitForTimeout(500);
	}

	/**
	 * Click on a cluster card
	 * @param {number} index - Index of cluster card (default: 0 for first)
	 */
	async clickCluster(index = 0) {
		const clusterCard = this.clusterCards.nth(index);
		await clusterCard.click();
	}

	/**
	 * Scroll to bottom to trigger infinite scroll
	 */
	async scrollToBottom() {
		await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await this.page.waitForTimeout(2000);
	}

	/**
	 * Get cluster count
	 * @returns {Promise<number>}
	 */
	async getClusterCount() {
		return await this.clusterCards.count();
	}

	/**
	 * Check if clusters are loaded
	 * @returns {Promise<boolean>}
	 */
	async hasClusters() {
		return (await this.clusterSection.count()) > 0;
	}

	/**
	 * Check if in search mode
	 * @returns {Promise<boolean>}
	 */
	async isSearchMode() {
		const searchValue = await this.searchBar.inputValue();
		return searchValue.trim().length > 0;
	}

	/**
	 * Check if loading
	 * @returns {Promise<boolean>}
	 */
	async isLoading() {
		return (await this.loadingIndicator.count()) > 0;
	}

	/**
	 * Check if empty state is shown
	 * @returns {Promise<boolean>}
	 */
	async hasEmptyState() {
		return (await this.emptyState.count()) > 0;
	}

	/**
	 * Wait for clusters to load (or timeout)
	 * @param {number} timeout - Timeout in ms (default: 10000)
	 */
	async waitForClusters(timeout = 10000) {
		try {
			await this.clusterSection.waitFor({ state: 'visible', timeout });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Take a screenshot
	 * @param {string} name - Screenshot filename
	 */
	async screenshot(name) {
		await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
	}
}
