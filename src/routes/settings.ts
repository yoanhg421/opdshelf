import { Hono } from "hono";
import { renderView } from "../helpers/renderers";
import { getBooks } from "../utils";
import { getEpubInfo } from "../helpers/cover";
import { getConfig } from "../config";
import { getDb, upsertBookMetadata } from "../db";

const app = new Hono();
const config = getConfig();

// Settings page
app.get("/", async (c) => {
	const html = await renderView("settings", {
		title: "Settings - OPDShelf",
	});
	return c.html(html);
});

// Re-extract metadata for all books
app.post("/reextract-metadata", async (c) => {
	const books = await getBooks(config.BOOKS_DIR);
	const db = await getDb();

	let updatedCount = 0;
	let errorCount = 0;

	for (const book of books) {
		try {
			const filePath = `${config.BOOKS_DIR}/${book.filename}`;
			const epubInfo = await getEpubInfo(filePath);

			if (epubInfo) {
				await upsertBookMetadata({
					filename: book.filename,
					title: epubInfo.title || book.title,
					author: epubInfo.creator,
					description: epubInfo.description,
					publisher: epubInfo.publisher,
					language: epubInfo.language,
					identifier: epubInfo.identifier,
					subject: epubInfo.subject,
					series: epubInfo.series,
					seriesIndex: String(epubInfo.seriesIndex || ""),
					size: book.size,
					mimeType: book.mimeType,
					lastUpdated:
						book.lastUpdated instanceof Date
							? book.lastUpdated.toISOString()
							: book.lastUpdated,
				});
				updatedCount++;
			} else {
				console.log(`No metadata extracted for ${book.filename}`);
			}
		} catch (error) {
			console.error(`Error extracting metadata for ${book.filename}:`, error);
			errorCount++;
		}
	}

	return c.json({ success: true, updatedCount, errorCount });
});

export default app;
