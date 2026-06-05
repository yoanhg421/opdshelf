import AdmZip from "adm-zip";
import path from "path";
import mime from "mime-types";
import fs from "node:fs";
import { unzipSync } from "fflate";
import { DOMParser } from "linkedom";
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
		const documentOPF = new DOMParser().parseFromString(
			new TextDecoder().decode(rootOPF),
			"text/xml",
		);
		const contentOPF = documentOPF
			.querySelector("rootfile")
			?.getAttribute("full-path")!;
		const route = contentOPF.split("/").slice(0, -1).join("/");

		const document = new DOMParser().parseFromString(
			new TextDecoder().decode(file[contentOPF]),
			"text/xml",
		);
		const coverID = document
			.querySelector("meta[name='cover']")
			?.getAttribute("content");
		const converRoute = path
			.join(
				route,
				document.querySelector(`item[id='${coverID}']`)?.getAttribute("href")!,
			)
			.replace(/\\/g, "/");
		const coverImage = file[converRoute];

		const bookInfo: BookInfo = {
			title: document.querySelector("dc\\:title")?.textContent,
			creator: document.querySelector("dc\\:creator")?.textContent,
			identifier: document.querySelector("dc\\:identifier")?.textContent,
			language: document.querySelector("dc\\:language")?.textContent,
			publisher: document.querySelector("dc\\:publisher")?.textContent,
			subject: document.querySelector("dc\\:subject")?.textContent,
			description:
				document.querySelector("dc\\:description")?.textContent ||
				document.querySelector("description")?.textContent,
			date: document.querySelector("dc\\:date")?.textContent,
			cover: coverImage,
			// Try new Calibre format first
			series:
				document.querySelector("meta[property='belongs-to-collection']")
					?.textContent ||
				document.querySelector("opf\\:meta[property='belongs-to-collection']")
					?.textContent ||
				// Fallback to old Calibre format
				document
					.querySelector("meta[name='calibre:series']")
					?.getAttribute("content") ||
				document
					.querySelector("meta[property='calibre:series']")
					?.getAttribute("content"),
			seriesIndex:
				document.querySelector("meta[property='group-position']")
					?.textContent ||
				document.querySelector("opf\\:meta[property='group-position']")
					?.textContent ||
				// Fallback to old Calibre format
				document
					.querySelector("meta[name='calibre:series_index']")
					?.getAttribute("content") ||
				document
					.querySelector("meta[property='calibre:series_index']")
					?.getAttribute("content"),
		};

		return bookInfo;
	} catch (e) {
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
