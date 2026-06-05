import { describe, it, expect } from "bun:test";
import { getEpubInfo } from "../src/helpers/cover";

describe("EPUB Metadata Extraction", () => {
	describe("getEpubInfo", () => {
		it("should extract metadata from Cinder EPUB", async () => {
			const result = await getEpubInfo("./books/Cinder - Marissa Meyer.epub");

			expect(result).not.toBeNull();
			expect(result?.title).toBe("Cinder");
			expect(result?.creator).toBe("Marissa Meyer");
			expect(result?.series).toBe("The Lunar Chronicles");
			expect(result?.seriesIndex).toBe("1");
			expect(result?.language).toBe("en");
			expect(result?.publisher).toBe("Manteau");
			expect(result?.identifier).toContain("isbn:9781466800113");
			expect(result?.subject).toContain("Fantasy");
			expect(result?.cover).toBeDefined();
		});

		it("should extract metadata from Stars Above EPUB", async () => {
			const result = await getEpubInfo(
				"./books/Stars Above - Marissa Meyer.epub",
			);

			expect(result).not.toBeNull();
			expect(result?.title).toBe("Stars Above");
			expect(result?.creator).toBe("Marissa Meyer");
			expect(result?.series).toBe("The Lunar Chronicles");
			expect(result?.seriesIndex).toBe("4.5");
			expect(result?.language).toBe("en-US");
		});

		it("should handle decimal series indices", async () => {
			const result = await getEpubInfo(
				"./books/Stars Above - Marissa Meyer.epub",
			);

			expect(result?.seriesIndex).toBe("4.5");
		});

		it("should extract multiple identifiers as comma-separated string", async () => {
			const result = await getEpubInfo("./books/Cinder - Marissa Meyer.epub");

			expect(result?.identifier).toContain("amazon:B00E8UZM42");
			expect(result?.identifier).toContain("isbn:9781466800113");
			expect(result?.identifier).toContain("goodreads:16125241");
			// Should not contain [object Object]
			expect(result?.identifier).not.toContain("[object Object]");
		});

		it("should extract multiple subjects as comma-separated string", async () => {
			const result = await getEpubInfo("./books/Cinder - Marissa Meyer.epub");

			expect(result?.subject).toContain("Fantasy");
			expect(result?.subject).toContain("Young Adult");
			expect(result?.subject).toContain("Science Fiction");
			expect(result?.subject).toContain("Romance");
		});

		it("should return null for non-existent file", async () => {
			const result = await getEpubInfo("./books/non-existent.epub");

			expect(result).toBeNull();
		});

		it("should decode HTML entities in description", async () => {
			const result = await getEpubInfo("./books/Cinder - Marissa Meyer.epub");

			expect(result?.description).toBeDefined();
			expect(result?.description).toContain("<p>");
			expect(result?.description).toContain("</p>");
			// Should not contain encoded entities
			expect(result?.description).not.toContain("&lt;");
			expect(result?.description).not.toContain("&gt;");
		});
	});
});
