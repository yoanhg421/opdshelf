import {
	getBookInfo,
	getCoverPath,
	coverExists,
	deleteCoverImage,
} from "../helpers/cover";
import { renderView } from "../helpers/renderers";
import { deleteBookMetadata, getBookMetadata, upsertBookMetadata } from "../db";
import mime from "mime-types";
import * as fs from "fs";
import * as path from "path";
import { Hono } from "hono";
import { getConfig } from "../config";
import { BookInfo } from "../types";

const app = new Hono();
const config = getConfig();

app.get("/:filename", async (c) => {
	const filePath = path.join(config.BOOKS_DIR, c.req.param("filename"));

	console.log(filePath);
	if (fs.existsSync(filePath)) {
		const stat = fs.statSync(filePath);
		c.header(
			"Content-Type",
			mime.lookup(filePath) || "application/octet-stream",
		);
		c.header("Content-Length", stat.size.toString());
		return c.body(fs.createReadStream(filePath) as any);
	}
	return c.notFound();
});

app.post("/upload", async (c) => {
	const body = await c.req.parseBody();
	const files = body["book"];

	// Handle single file or multiple files
	const fileList = Array.isArray(files) ? files : [files];
	let uploadedCount = 0;

	for (const file of fileList) {
		if (file instanceof File) {
			if (!file.name) continue;

			const dest = path.join(config.BOOKS_DIR, file.name);
			console.log(`Uploading ${file.name}`);

			try {
				await fs.promises.writeFile(
					dest,
					Buffer.from(await file.arrayBuffer()),
				);
				uploadedCount++;
			} catch (err) {
				console.error(`Failed to upload ${file.name}:`, err);
			}
		}
	}

	console.log(`Successfully uploaded ${uploadedCount} file(s)`);
	return c.redirect("/admin");
});

app.post("/delete/:filename", async (c) => {
	const filename = path.basename(c.req.param("filename"));
	const filePath = path.join(config.BOOKS_DIR, filename);

	try {
		if (fs.existsSync(filePath)) {
			await fs.promises.unlink(filePath);
		}
		// Clean up cover image
		await deleteCoverImage(filename);
		// Clean up database metadata
		await deleteBookMetadata(filename);
	} catch (err) {
		console.error(err);
	}

	return c.redirect("/admin");
});

app.post("/rename", async (c) => {
	const { oldFilename, newFilename } = await c.req.parseBody();

	if (oldFilename && newFilename) {
		const safeOld = path.basename(oldFilename as string);
		let safeNew = path.basename(newFilename as string);

		if (!path.extname(safeNew)) safeNew += path.extname(safeOld);

		const oldPath = path.join(config.BOOKS_DIR, safeOld);
		const newPath = path.join(config.BOOKS_DIR, safeNew);

		try {
			if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
				await fs.promises.rename(oldPath, newPath);
				// Rename cover image if it exists
				const oldCoverPath = getCoverPath(safeOld);
				const newCoverPath = getCoverPath(safeNew);
				if (fs.existsSync(oldCoverPath)) {
					await fs.promises.rename(oldCoverPath, newCoverPath);
				}
				// Note: DB metadata will be updated on next scan since filename changed
			}
		} catch (err) {
			console.error(err);
		}
	}

	return c.redirect("/admin");
});

app.post("/metadata", async (c) => {
	const body = await c.req.parseBody();
	const filename = body.filename as string;

	if (!filename) {
		return c.text("Filename is required", 400);
	}

	// Get existing metadata
	const existing = await getBookMetadata(filename);
	if (!existing) {
		return c.text("Book not found", 404);
	}

	// Update with new values
	const updated = {
		...existing,
		title: (body.title as string) || existing.title,
		author: (body.author as string) || existing.author,
		description: (body.description as string) || existing.description,
		publisher: (body.publisher as string) || existing.publisher,
		language: (body.language as string) || existing.language,
		identifier: (body.identifier as string) || existing.identifier,
		subject: (body.subject as string) || existing.subject,
		series: (body.series as string) || existing.series,
		seriesIndex: (body.seriesIndex as string) || existing.seriesIndex,
	};

	await upsertBookMetadata(updated);

	return c.text("Metadata updated successfully");
});

app.get("/info/:filename", async (c) => {
	const filename = c.req.param("filename");
	const filePath = path.join(config.BOOKS_DIR, filename);
	if (!fs.existsSync(filePath)) return c.notFound();

	const bookInfo = await getBookInfo(filePath);
	if (bookInfo) {
		const html = await renderView("book_details", {
			book: bookInfo,
			filename: filename,
			title: bookInfo.title || filename,
		});
		return c.html(html);
	}

	return c.notFound();
});

app.get("/cover/:filename", async (c) => {
	const filename = c.req.param("filename");
	const filePath = path.join(config.BOOKS_DIR, filename);
	if (!fs.existsSync(filePath)) return c.notFound();

	// Try to serve from cached cover file first
	const coverPath = getCoverPath(filename);
	if (await coverExists(filename)) {
		c.header("Cache-Control", "public, max-age=86400");
		c.header("Content-Type", "image/jpeg");
		return c.body(fs.createReadStream(coverPath) as any);
	}

	// Fallback to extracting from book
	const bookInfo = await getBookInfo(filePath);
	if (bookInfo && bookInfo.cover) {
		c.header("Cache-Control", "public, max-age=86400");
		return c.body(bookInfo.cover as any);
	}

	return c.notFound();
});

export default app;
