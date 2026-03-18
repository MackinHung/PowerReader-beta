# E2E Tests for PowerReader Cluster Visualization

End-to-end tests for the PowerReader cluster visualization feature using Playwright.

## Test Coverage

### Critical User Journeys

1. **Homepage loads clusters** - Verifies cluster cards are rendered or appropriate loading/empty state is shown
2. **Category filter** - Tests clicking category chips (e.g., 政治) and verifying clusters update
3. **Search mode toggle** - Tests typing in search bar hides clusters and shows search results; clearing search shows clusters again
4. **Cluster card click → detail page** - Tests navigation to /event/[id] and verifies detail page elements
5. **Detail page back navigation** - Tests returning to homepage from detail page
6. **Infinite scroll** - Tests scrolling to bottom loads more clusters
7. **Error state handling** - Tests navigation to invalid cluster ID shows error state
8. **Responsive UI** - Tests mobile viewport rendering

## Running Tests

### Prerequisites

```bash
npm install
npx playwright install chromium
```

### Run all E2E tests

```bash
npm run test:e2e
```

### Run tests with UI mode (interactive)

```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)

```bash
npm run test:e2e:headed
```

### Debug tests with Playwright Inspector

```bash
npm run test:e2e:debug
```

### View HTML report after test run

```bash
npm run test:e2e:report
```

## Test Configuration

Configuration is in `playwright.config.js`:

- **Test directory**: `./e2e`
- **Test pattern**: `**/*.spec.js`
- **Base URL**: `http://localhost:5173` (local dev server)
- **Browsers**: Chromium (Desktop Chrome)
- **Retries**: 2 in CI, 0 locally
- **Workers**: 1 (serial execution to avoid race conditions)
- **Reporters**: HTML report + JUnit XML
- **Artifacts**: Screenshots on failure, video on failure, trace on retry

## Test Results & Artifacts

After running tests, artifacts are saved in:

- **Screenshots**: `test-results/*.png` (on failure + specific test checkpoints)
- **Videos**: `test-results/` (on failure)
- **Traces**: `test-results/` (on first retry)
- **HTML Report**: `playwright-report/index.html`
- **JUnit XML**: `test-results/junit.xml` (for CI integration)

## Backend API Notes

The backend API may not be available when running locally. Tests are designed to handle:

- **Loading states** - Spinner indicators while fetching data
- **Empty states** - No content available messages
- **Error states** - API failures or invalid data
- **Graceful degradation** - Tests skip or pass based on available data

## Debugging Tips

### Slow down test execution

```javascript
// In test file, add:
test.use({ slowMo: 500 }); // 500ms delay between actions
```

### Pause test execution

```javascript
// In test, add:
await page.pause();
```

### View browser console logs

```javascript
page.on('console', msg => console.log('PAGE LOG:', msg.text()));
```

### Check for network errors

```javascript
page.on('pageerror', err => console.error('PAGE ERROR:', err));
page.on('requestfailed', request =>
  console.error('FAILED REQUEST:', request.url(), request.failure())
);
```

## CI/CD Integration

For continuous integration:

1. Install dependencies: `npm install`
2. Install browsers: `npx playwright install --with-deps chromium`
3. Run tests: `npm run test:e2e`
4. Upload artifacts: `playwright-report/` and `test-results/`

Example GitHub Actions workflow:

```yaml
- name: Run E2E tests
  run: npm run test:e2e
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 30
```

## Test Maintenance

### Flaky Test Handling

If a test is flaky, you can:

1. **Quarantine it**:
   ```javascript
   test.fixme('flaky test name', async ({ page }) => { ... });
   ```

2. **Increase timeout**:
   ```javascript
   test('test name', async ({ page }) => {
     test.setTimeout(60000); // 60 seconds
     // ...
   });
   ```

3. **Add retry for specific test**:
   ```javascript
   test.describe.configure({ retries: 3 });
   ```

### Updating Selectors

When UI changes, update selectors in `cluster-visualization.spec.js`:

- Use `data-testid` attributes where possible (preferred)
- Use semantic HTML elements (e.g., `h1`, `nav`)
- Use class names as fallback (e.g., `.home-page`, `.cluster-detail`)
- Avoid XPath selectors (brittle)

### Page Object Model (POM)

For better maintainability, consider extracting page objects:

```javascript
// e2e/pages/HomePage.js
export class HomePage {
  constructor(page) {
    this.page = page;
    this.searchBar = page.locator('.search-section input');
    this.categoryChips = page.locator('.category-chips');
  }

  async search(query) {
    await this.searchBar.fill(query);
    await this.searchBar.press('Enter');
  }

  async selectCategory(categoryName) {
    await this.categoryChips.getByText(categoryName).click();
  }
}
```

## Success Metrics

- All critical journeys passing: 100%
- Overall pass rate: > 95%
- Flaky rate: < 5%
- Test duration: < 5 minutes
- Artifacts captured and accessible

## References

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Locator Strategies](https://playwright.dev/docs/locators)
- [Test Configuration](https://playwright.dev/docs/test-configuration)
