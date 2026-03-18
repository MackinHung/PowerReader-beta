/**
 * Page Object Model for Cluster Detail Page
 *
 * Encapsulates locators and actions for the cluster detail page.
 */

export class ClusterDetailPage {
	constructor(page) {
		this.page = page;

		// Locators
		this.container = page.locator('.cluster-detail');
		this.header = page.locator('.detail-header');
		this.title = page.locator('h1.detail-title, .detail-header h1');
		this.categoryBadge = page.locator('.category-badge');
		this.blindspotBadge = page.locator('.blindspot-badge');
		this.metaBadge = page.locator('.meta-badge');
		this.timeRange = page.locator('.detail-time');

		// Visualizations
		this.campBar = page.locator('[class*="camp"]');
		this.controversyMeter = page.locator('[class*="controversy"]');
		this.blindspotAlert = page.locator('.blindspot-alert');

		// Sections
		this.comparisonSection = page.locator('.comparison-section');
		this.articlesSection = page.locator('.articles-section');
		this.articlesHeading = page.locator('h2.section-heading').filter({ hasText: '相關報導' });

		// State indicators
		this.loadingIndicator = page.locator('.center-state').locator('[class*="progress"]');
		this.errorState = page.locator('.center-state').filter({ hasText: /無法載入|錯誤|error/i });
		this.retryButton = page.locator('button').filter({ hasText: '重試' });

		// Article cards
		this.articleCards = page.locator('.article-card, [class*="article"]');
	}

	/**
	 * Navigate to cluster detail page
	 * @param {string} clusterId - Cluster ID
	 */
	async goto(clusterId) {
		await this.page.goto(`/event/${clusterId}`);
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Go back to previous page
	 */
	async goBack() {
		await this.page.goBack();
		await this.page.waitForLoadState('networkidle');
	}

	/**
	 * Check if page is loaded successfully
	 * @returns {Promise<boolean>}
	 */
	async isLoaded() {
		return await this.container.isVisible();
	}

	/**
	 * Check if error state is shown
	 * @returns {Promise<boolean>}
	 */
	async hasError() {
		return (await this.errorState.count()) > 0;
	}

	/**
	 * Check if loading
	 * @returns {Promise<boolean>}
	 */
	async isLoading() {
		return (await this.loadingIndicator.count()) > 0;
	}

	/**
	 * Get cluster title
	 * @returns {Promise<string>}
	 */
	async getTitle() {
		return await this.title.textContent();
	}

	/**
	 * Get article count from meta badge
	 * @returns {Promise<number>}
	 */
	async getArticleCount() {
		const metaText = await this.metaBadge.textContent();
		const match = metaText.match(/(\d+)\s*篇/);
		return match ? parseInt(match[1], 10) : 0;
	}

	/**
	 * Check if camp bar is visible
	 * @returns {Promise<boolean>}
	 */
	async hasCampBar() {
		return (await this.campBar.count()) > 0;
	}

	/**
	 * Check if comparison section is visible
	 * @returns {Promise<boolean>}
	 */
	async hasComparisonSection() {
		return await this.comparisonSection.isVisible();
	}

	/**
	 * Check if articles section is visible
	 * @returns {Promise<boolean>}
	 */
	async hasArticlesSection() {
		return await this.articlesSection.isVisible();
	}

	/**
	 * Get number of article cards
	 * @returns {Promise<number>}
	 */
	async getArticleCardCount() {
		return await this.articleCards.count();
	}

	/**
	 * Click retry button (when error state is shown)
	 */
	async retry() {
		await this.retryButton.click();
		await this.page.waitForTimeout(500);
	}

	/**
	 * Take a screenshot
	 * @param {string} name - Screenshot filename
	 */
	async screenshot(name) {
		await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
	}
}
