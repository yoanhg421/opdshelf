import fs from "fs";
import path from "path";
import mime from "mime-types";
import { Book, SortMode } from "./types";
import {
	getBookInfo,
	saveCoverImage,
	coverExists,
	deleteCoverImage,
} from "./helpers/cover";
import {
	getBookMetadata,
	getAllBookMetadata,
	upsertBookMetadata,
	deleteBookMetadata,
	type BookMetadata,
} from "./db";

const MIME_MAP: Record<string, string> = {
	"application/epub+zip": "EPUB",
	"application/pdf": "PDF",
	"application/x-fictionbook+xml": "FB2",
	"application/x-zip-compressed-fb2": "FB2",
	"application/zip": "ZIP",
	"application/x-zip-compressed": "ZIP",
	"application/x-cbz": "CBZ",
	"application/vnd.comicbook+zip": "CBZ",
	"application/x-cbr": "CBR",
	"application/x-mobi": "MOBI",
	"application/x-mobipocket-ebook": "MOBI",
	"application/vnd.amazon.ebook": "AZW",
	"image/vnd.djvu": "DJVU",
	"text/plain": "TXT",
	"text/rtf": "RTF",
	"application/rtf": "RTF",
	"text/html": "HTML",
};

// In-memory cache for book metadata
const metadataCache = new Map<string, any>();

// Background scanning state
let isScanning = false;
let scanPromise: Promise<void> | null = null;

export const getSimpleMime = (mimeType: string): string => {
	if (MIME_MAP[mimeType]) return MIME_MAP[mimeType];

	const lower = mimeType.toLowerCase();
	if (lower.includes("azw")) return "AZW";
	if (lower.includes("djvu")) return "DJVU";

	return mimeType.length > 12 ? mimeType.substring(0, 10) + "..." : mimeType;
};

export const formatSize = (bytes: number): string => {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let i = 0;

	while (size >= 1024 && i < units.length - 1) {
		size /= 1024;
		i++;
	}

	return `${size.toFixed(1)} ${units[i]}`;
};

export const getBooks = async (dir: string): Promise<Book[]> => {
	try {
		// Ensure directory exists (handle race conditions in container environments)
		if (!fs.existsSync(dir)) {
			try {
				await fs.promises.mkdir(dir, { recursive: true });
			} catch (e) {
				// Directory might have been created by another process or mount
				if (!fs.existsSync(dir)) {
					console.error(`Failed to create directory ${dir}:`, e);
					return [];
				}
			}
			return [];
		}

		const files = await fs.promises.readdir(dir);
		const fileSet = new Set(files.filter((f) => !f.startsWith(".")));

		// Get cached metadata from database (non-blocking)
		let cachedMetadata: BookMetadata[] = [];
		let cachedMap = new Map<string, BookMetadata>();

		try {
			cachedMetadata = await getAllBookMetadata();
			cachedMap = new Map(cachedMetadata.map((m) => [m.filename, m]));
		} catch (err) {
			console.log("No cached metadata found, will scan in background");
		}

		const books: Book[] = [];
		const filesToUpdate: string[] = [];

		// Check each file - use cached data immediately
		for (const file of fileSet) {
			const filePath = path.join(dir, file);
			const stats = await fs.promises.stat(filePath);

			if (stats.isFile()) {
				const mimeType = mime.lookup(filePath) || "application/octet-stream";
				const cached = cachedMap.get(file);
				const lastUpdated = stats.mtime.toISOString();

				let title = path.basename(file, path.extname(file));
				let author: string | undefined;
				let description: string | undefined;
				let publisher: string | undefined;
				let language: string | undefined;
				let identifier: string | undefined;
				let subject: string | undefined;
				let series: string | undefined;
				let seriesIndex: string | undefined;

				// Use cached metadata if available
				if (cached) {
					title = cached.title;
					author = cached.author;
					description = cached.description;
					publisher = cached.publisher;
					language = cached.language;
					identifier = cached.identifier;
					subject = cached.subject;
					series = cached.series;
					seriesIndex = cached.seriesIndex;
					// Check if file needs update
					if (cached.lastUpdated !== lastUpdated) {
						filesToUpdate.push(file);
					}
				} else {
					// New file, needs metadata extraction
					filesToUpdate.push(file);
				}

				books.push({
					title,
					filename: file,
					size: stats.size,
					mimeType,
					lastUpdated: stats.mtime,
					author,
					description,
					publisher,
					language,
					identifier,
					subject,
					series,
					seriesIndex,
					simpleMime: getSimpleMime(mimeType),
				});
			}
		}

		// Remove metadata and cover images for deleted files (only if we have cache)
		if (cachedMetadata.length > 0) {
			for (const cached of cachedMetadata) {
				if (!fileSet.has(cached.filename)) {
					await deleteBookMetadata(cached.filename);
					await deleteCoverImage(cached.filename);
				}
			}
		}

		// Background scan for files that need metadata updates
		if (filesToUpdate.length > 0 && !isScanning) {
			isScanning = true;
			const filesToScan = [...filesToUpdate]; // Capture files to scan
			scanPromise = (async () => {
				console.log(`Scanning ${filesToScan.length} file(s) for metadata...`);
				for (const file of filesToScan) {
					try {
						const filePath = path.join(dir, file);
						const stats = await fs.promises.stat(filePath);
						const mimeType =
							mime.lookup(filePath) || "application/octet-stream";
						let title = path.basename(file, path.extname(file));
						let author: string | undefined;
						let description: string | undefined;
						let publisher: string | undefined;
						let language: string | undefined;
						let identifier: string | undefined;
						let subject: string | undefined;
						let series: string | undefined;
						let seriesIndex: string | undefined;

						// Extract metadata and cover for supported formats
						if (
							mimeType === "application/epub+zip" ||
							mimeType === "application/zip" ||
							mimeType === "application/x-cbz" ||
							mimeType === "application/vnd.comicbook+zip"
						) {
							const metadata = await getBookInfo(filePath);
							if (metadata) {
								if (metadata.title) {
									title = metadata.title;
								}
								author = metadata.creator;
								description = metadata.description;
								publisher = metadata.publisher;
								language = metadata.language;
								identifier = metadata.identifier;
								subject = metadata.subject;
								series = metadata.series;
								seriesIndex = String(metadata.seriesIndex || "");
								// Save cover image if it exists and not already saved
								if (metadata.cover && !(await coverExists(file))) {
									await saveCoverImage(file, metadata.cover);
								}
							}
						}

						await upsertBookMetadata({
							filename: file,
							title,
							author,
							description,
							publisher,
							language,
							identifier,
							subject,
							series,
							seriesIndex,
							size: stats.size,
							mimeType,
							lastUpdated: stats.mtime.toISOString(),
						});
					} catch (err) {
						console.error(`Error scanning ${file}:`, err);
					}
				}
				console.log("Metadata scan complete");
				isScanning = false;
				scanPromise = null;
			})();
		}

		return books;
	} catch (err) {
		console.error(err);
		return [];
	}
};

export const sortBooks = (books: Book[], mode: SortMode): Book[] => {
	return [...books].sort((a, b) => {
		switch (mode) {
			case "name-asc":
				return a.title.localeCompare(b.title);
			case "name-desc":
				return b.title.localeCompare(a.title);
			case "date-asc":
				return a.lastUpdated.getTime() - b.lastUpdated.getTime();
			case "date-desc":
			default:
				return b.lastUpdated.getTime() - a.lastUpdated.getTime();
		}
	});
};
