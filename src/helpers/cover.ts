import AdmZip from "adm-zip";
import path from "path";
import mime from "mime-types";
import fs from "node:fs";
import { unzipSync } from "fflate";
import { DOMParser } from "linkedom";
import { XMLParser } from "fast-xml-parser";
import { BookInfo } from "../types";
import { getConfig } from "../config";

const SUPPORTED_ARCHIVES = [".epub", ".cbz", ".zip", ".fb2.zip"];
const COVER_REGEX = /(^|\/)cover\.(jpe?g|png)$/i;
const IMAGE_REGEX = /\.(jpe?g|png)$/i;

const config = getConfig();
const COVERS_DIR = path.join(process.cwd(), "covers");

// Ensure covers directory exists
if (!fs.existsSync(COVERS_DIR)) {
	fs.mkdirSync(COVERS_DIR, { recursive: true });
}

export function getCoverPath(filename: string): string {
	const ext = path.extname(filename);
	const baseName = path.basename(filename, ext);
	return path.join(COVERS_DIR, `${baseName}.jpg`);
}

export async function saveCoverImage(
	filename: string,
	coverData: Uint8Array,
): Promise<void> {
	const coverPath = getCoverPath(filename);
	await fs.promises.writeFile(coverPath, coverData);
}

export async function coverExists(filename: string): Promise<boolean> {
	const coverPath = getCoverPath(filename);
	return fs.existsSync(coverPath);
}

export async function deleteCoverImage(filename: string): Promise<void> {
	const coverPath = getCoverPath(filename);
	if (fs.existsSync(coverPath)) {
		await fs.promises.unlink(coverPath);
	}
}

export async function getEpubInfo(filePath: string): Promise<BookInfo | null> {
	try {
		const file = unzipSync(
			new Uint8Array(await Bun.file(filePath).arrayBuffer()),
		);
		const rootOPF = file["META-INF/container.xml"];

		// Parse container.xml to find OPF file
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
		});
		const container = parser.parse(new TextDecoder().decode(rootOPF));

		// Handle different container.xml structures
		let contentOPF;
		if (container.container?.rootfiles?.rootfile) {
			contentOPF = container.container.rootfiles.rootfile["@_full-path"];
		} else if (container.rootfiles?.rootfile) {
			contentOPF = container.rootfiles.rootfile["@_full-path"];
		} else {
			console.error("Could not find rootfile in container.xml");
			return null;
		}

		if (!contentOPF) {
			console.error("Could not find full-path attribute in rootfile");
			return null;
		}

		const route = contentOPF.split("/").slice(0, -1).join("/");

		// Parse OPF file
		const opfContent = new TextDecoder().decode(file[contentOPF]);
		const opfParser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			ignoreDeclaration: true,
			parseTagValue: true,
			trimValues: true,
		});
		const opf = opfParser.parse(opfContent);

		// Helper to get value from dc: namespace or direct tag
		const getDcValue = (tagName: string): string | undefined => {
			const metadata = opf.package?.metadata;
			if (!metadata) return undefined;

			// Helper to extract text from object or return string
			const extractText = (value: any): string | undefined => {
				if (!value) return undefined;
				if (typeof value === "string") return value;
				if (typeof value === "object" && value["#text"]) return value["#text"];
				// Skip objects that don't have #text (like complex identifier objects)
				if (typeof value === "object") return undefined;
				return String(value);
			};

			// Try with dc: prefix first
			const dcKey = `dc:${tagName}`;
			if (metadata[dcKey]) {
				const value = metadata[dcKey];
				if (Array.isArray(value)) {
					return value.map(extractText).filter(Boolean).join(", ");
				}
				return extractText(value);
			}

			// Try without prefix
			if (metadata[tagName]) {
				const value = metadata[tagName];
				if (Array.isArray(value)) {
					return value.map(extractText).filter(Boolean).join(", ");
				}
				return extractText(value);
			}

			return undefined;
		};

		// Helper to get meta property value
		const getMetaValue = (property: string): string | undefined => {
			const metadata = opf.package?.metadata;
			if (!metadata) return undefined;

			const metas = metadata.meta || [];
			const opfMetas = metadata["opf:meta"] || [];

			// Combine both meta and opf:meta arrays
			const allMetas = [
				...(Array.isArray(metas) ? metas : [metas].filter(Boolean)),
				...(Array.isArray(opfMetas) ? opfMetas : [opfMetas].filter(Boolean)),
			];

			for (const m of allMetas) {
				if (!m) continue;
				if (m["@_property"] === property || m.property === property) {
					return m["@_content"] || m["#text"] || m.content;
				}
			}

			return undefined;
		};

		// Helper to get meta with name attribute
		const getMetaByName = (name: string): string | undefined => {
			const metadata = opf.package?.metadata;
			if (!metadata) return undefined;

			const metas = metadata.meta || [];
			if (!Array.isArray(metas)) {
				if (metas["@_name"] === name) return metas["@_content"];
				return undefined;
			}

			const found = metas.find((m: any) => m["@_name"] === name);
			return found ? found["@_content"] : undefined;
		};

		// Extract cover
		const coverID = getMetaByName("cover");
		let coverImage: Uint8Array | Buffer | undefined = undefined;

		if (coverID) {
			const manifest = opf.package?.manifest?.item || [];
			const coverItem = Array.isArray(manifest)
				? manifest.find((i: any) => i["@_id"] === coverID)
				: manifest;
			if (coverItem && coverItem["@_href"]) {
				const coverPath = path
					.join(route, coverItem["@_href"])
					.replace(/\\/g, "/");
				coverImage = file[coverPath];
			}
		}

		// Fallback: look for item with cover-image property
		if (!coverImage) {
			const manifest = opf.package?.manifest?.item || [];
			const coverItem = Array.isArray(manifest)
				? manifest.find((i: any) => i["@_properties"] === "cover-image")
				: manifest;
			if (coverItem && coverItem["@_href"]) {
				const coverPath = path
					.join(route, coverItem["@_href"])
					.replace(/\\/g, "/");
				coverImage = file[coverPath];
			}
		}

		// Decode HTML entities
		const decodeEntities = (text: any): string | undefined => {
			if (!text) return undefined;
			// Convert to string if it's an object
			let strText: string;
			if (typeof text === "string") {
				strText = text;
			} else if (typeof text === "object" && text["#text"]) {
				strText = text["#text"];
			} else {
				strText = String(text);
			}
			return strText
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&amp;/g, "&")
				.replace(/&quot;/g, '"')
				.replace(/&apos;/g, "'");
		};

		const bookInfo: BookInfo = {
			title: decodeEntities(getDcValue("title")),
			creator: decodeEntities(getDcValue("creator")),
			identifier: decodeEntities(getDcValue("identifier")),
			language: decodeEntities(getDcValue("language")),
			publisher: decodeEntities(getDcValue("publisher")),
			subject: decodeEntities(getDcValue("subject")),
			description: decodeEntities(getDcValue("description")),
			date: decodeEntities(getDcValue("date")),
			cover: coverImage,
			series:
				getMetaValue("belongs-to-collection") || getMetaValue("calibre:series"),
			seriesIndex: String(
				getMetaValue("group-position") ||
					getMetaValue("calibre:series_index") ||
					"",
			),
		};

		return bookInfo;
	} catch (e) {
		console.error("Error parsing EPUB metadata:", e);
		return null;
	}
}

export const getBookInfo = async (
	filePath: string,
): Promise<BookInfo | null> => {
	try {
		const ext = path.extname(filePath).toLowerCase();

		if (ext === ".epub") {
			const epubInfo = await getEpubInfo(filePath);
			if (epubInfo) return epubInfo;
		}

		if (SUPPORTED_ARCHIVES.includes(ext)) {
			const buffer = await fs.promises.readFile(filePath);
			const zip = new AdmZip(buffer);
			const entries = zip.getEntries();

			let entry = entries.find(
				(e) => COVER_REGEX.test(e.entryName) && !e.isDirectory,
			);

			if (!entry) {
				const images = entries.filter(
					(e) =>
						IMAGE_REGEX.test(e.entryName) &&
						!e.entryName.includes("__MACOSX") &&
						!e.isDirectory,
				);

				if (images.length > 0) {
					images.sort((a, b) => {
						const sizeA = (a as any).header?.size || 0;
						const sizeB = (b as any).header?.size || 0;
						return sizeB - sizeA;
					});
					entry = images[0];
				}
			}

			if (entry) {
				return {
					cover: entry.getData(),
				};
			}
		}

		return null;
	} catch (err) {
		console.error(err);
		return null;
	}
};
