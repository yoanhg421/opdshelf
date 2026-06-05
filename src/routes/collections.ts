import { Hono } from "hono";
import { renderView, renderXml } from "../helpers/renderers";
import { getBaseUrl } from "../helpers/general";
import {
	createCollection,
	getCollections,
	getCollection,
	updateCollection,
	deleteCollection,
	addBookToCollection,
	removeBookFromCollection,
	getBooksInCollection,
	getBookCollections,
	saveDb,
} from "../db";
import { getBooks, sortBooks } from "../utils";
import { SortMode } from "../types";
import { getConfig } from "../config";

const app = new Hono();
const config = getConfig();

// List all collections
app.get("/", async (c) => {
	const collections = await getCollections();
	const html = await renderView("collections", {
		collections,
		title: "Collections - OPDShelf",
	});
	return c.html(html);
});

// Create a new collection
app.post("/", async (c) => {
	const { name, description } = await c.req.parseBody();
	if (name) {
		await createCollection(name as string, description as string);
	}
	return c.redirect("/collections");
});

// OPDS feed for all collections
app.get("/opds", async (c) => {
	const collections = await getCollections();
	const baseUrl = getBaseUrl(c, config);

	const xml = await renderXml("collections_opds", {
		collections,
		baseUrl,
		currentTime: new Date().toISOString(),
	});

	c.header(
		"Content-Type",
		"application/atom+xml;charset=utf-8;profile=opds-catalog;kind=navigation",
	);
	return c.body(xml);
});

// OPDS feed for a specific collection (must come before /:id)
app.get("/:id/opds", async (c) => {
	const id = parseInt(c.req.param("id"));
	const collection = await getCollection(id);
	if (!collection) {
		return c.notFound();
	}

	const bookFilenames = await getBooksInCollection(id);
	const allBooks = await getBooks(config.BOOKS_DIR);
	const collectionBooks = allBooks.filter((book) =>
		bookFilenames.includes(book.filename),
	);

	const baseUrl = getBaseUrl(c, config);

	const xml = await renderXml("opds", {
		books: collectionBooks,
		baseUrl,
		currentTime: new Date().toISOString(),
		title: collection.name,
	});

	c.header(
		"Content-Type",
		"application/atom+xml;charset=utf-8;profile=opds-catalog;kind=acquisition",
	);
	return c.body(xml);
});

// View a specific collection
app.get("/:id", async (c) => {
	const id = parseInt(c.req.param("id"));
	const collection = await getCollection(id);
	if (!collection) {
		return c.notFound();
	}

	const bookFilenames = await getBooksInCollection(id);
	const allBooks = await getBooks(config.BOOKS_DIR);
	const collectionBooks = allBooks.filter((book) =>
		bookFilenames.includes(book.filename),
	);

	// Filter out books already in collection for the selection modal
	const availableBooks = allBooks.filter(
		(book) => !bookFilenames.includes(book.filename),
	);

	// Sort books by title A-Z
	const sortedBooks = sortBooks(collectionBooks, "name-asc");

	const html = await renderView("collection_detail", {
		collection,
		books: sortedBooks,
		allBooks: sortBooks(availableBooks, "name-asc"),
		title: `${collection.name} - OPDShelf`,
	});
	return c.html(html);
});

// Update a collection
app.post("/:id", async (c) => {
	const id = parseInt(c.req.param("id"));
	const { name, description } = await c.req.parseBody();
	if (name) {
		await updateCollection(id, name as string, description as string);
	}
	return c.redirect(`/collections/${id}`);
});

// Delete a collection
app.post("/:id/delete", async (c) => {
	const id = parseInt(c.req.param("id"));
	await deleteCollection(id);
	return c.redirect("/collections");
});

// Add books to a collection
app.post("/:id/add", async (c) => {
	const id = parseInt(c.req.param("id"));
	const body = await c.req.parseBody();
	console.log("Form data received:", body);

	// FormData sends book_filename[] as the key
	const bookFiles = body["book_filename[]"];

	// Handle single file or multiple files
	const fileList = Array.isArray(bookFiles)
		? bookFiles
		: bookFiles
			? [bookFiles]
			: [];
	let addedCount = 0;

	console.log("File list:", fileList);

	for (const filename of fileList) {
		if (filename) {
			await addBookToCollection(filename as string, id);
			addedCount++;
		}
	}

	console.log(`Added ${addedCount} books to collection ${id}`);
	return c.redirect(`/collections/${id}`);
});

// Remove a book from a collection
app.post("/:id/remove", async (c) => {
	const id = parseInt(c.req.param("id"));
	const { book_filename } = await c.req.parseBody();
	if (book_filename) {
		await removeBookFromCollection(book_filename as string, id);
	}
	return c.redirect(`/collections/${id}`);
});

export default app;
