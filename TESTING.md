# Testing

This document describes the test suite for the OPDShelf application.

## Running Tests

To run all tests:

```bash
bun test
```

To run a specific test file:

```bash
bun test cover.test.ts
```

## Test Suite: EPUB Metadata Extraction

The `cover.test.ts` file contains tests for the EPUB metadata extraction functionality in `src/helpers/cover.ts`.

### Test Cases

#### `getEpubInfo`

- **Should extract metadata from Cinder EPUB**: Verifies that basic metadata (title, creator, series, series index, language, publisher, identifier, subject, cover) is correctly extracted from the Cinder book.
- **Should extract metadata from Stars Above EPUB**: Tests extraction from another book in the same series to ensure consistency.
- **Should handle decimal series indices**: Verifies that decimal series indices (e.g., 4.5) are correctly parsed.
- **Should extract multiple identifiers as comma-separated string**: Ensures that multiple identifier values are joined with commas and do not contain `[object Object]`.
- **Should extract multiple subjects as comma-separated string**: Verifies that multiple subject/genre values are properly joined.
- **Should return null for non-existent file**: Tests error handling when the EPUB file doesn't exist.
- **Should decode HTML entities in description**: Ensures that HTML entities in the description are decoded (e.g., `&lt;` becomes `<`).

### Test Data

Tests use actual EPUB files from the `books/` directory:
- `Cinder - Marissa Meyer.epub` - Standard EPUB with series information
- `Stars Above - Marissa Meyer.epub` - EPUB with decimal series index

### Adding New Tests

To add a new test:

1. Add a new `it()` block within the appropriate `describe()` block in `cover.test.ts`
2. Use `expect()` assertions to verify the expected behavior
3. Run `bun test` to verify the new test passes

Example:

```typescript
it("should extract publisher from EPUB", async () => {
  const result = await getEpubInfo("./books/Test Book.epub");
  expect(result?.publisher).toBe("Test Publisher");
});
```
