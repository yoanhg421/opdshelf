import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getCookie } from "hono/cookie";
import Handlebars from "handlebars";
import { getConfig } from "../config";
import { getBooks, sortBooks, formatSize, getSimpleMime } from "../utils";
import { SortMode } from "../types";
import books from "./book";
import user from "./user";
import collections from "./collections";
import { renderView, renderXml } from "../helpers/renderers";
import { getBaseUrl } from "../helpers/general";
import { registerHandlebarsHelpers } from "../helpers/handlebars";
import { checkBasicAuth } from "../helpers/auth";

registerHandlebarsHelpers();
const app = new Hono();
const config = getConfig();

app.use("/static/*", serveStatic({ root: "./" }));
app.use("*", async (c, next) => {
	const session = getCookie(c, "auth_session");
	const username = process.env.ADMIN_USERNAME;
	const password = process.env.ADMIN_PASSWORD;

	if (
		c.req.path.startsWith("/user/") ||
		c.req.path.startsWith("/static/") ||
		session === "valid" ||
		checkBasicAuth(c) ||
		!username ||
		!password
	) {
		return next();
	}

	// Handle denied
	const accept = c.req.header("Accept") || "";
	if (accept.includes("text/html")) {
		return c.redirect("/user/login");
	} else {
		c.header("WWW-Authenticate", 'Basic realm="OPDShelf"');
	}
	return c.text("Unauthorized", 401);
});

app.route("/book/", books);
app.route("/user", user);
app.route("/collections", collections);

app.get("/", async (c) => {
	let books = await getBooks(config.BOOKS_DIR);
	const sortMode = (c.req.query("sort") as SortMode) || "name-asc";
	const searchQuery = c.req.query("search");

	// Filter books if search query is provided
	if (searchQuery) {
		const query = searchQuery.toLowerCase();
		books = books.filter(
			(book) =>
				book.title.toLowerCase().includes(query) ||
				(book.author && book.author.toLowerCase().includes(query)),
		);
	}

	const xml = await renderXml("opds", {
		books: sortBooks(books, sortMode),
		baseUrl: getBaseUrl(c, config),
		currentTime: new Date().toISOString(),
		sortMode,
	});

	c.header(
		"Content-Type",
		"application/atom+xml;charset=utf-8;profile=opds-catalog;kind=acquisition",
	);
	return c.body(xml);
});

app.get("/search", async (c) => {
	let books = await getBooks(config.BOOKS_DIR);
	const sortMode = (c.req.query("sort") as SortMode) || "name-asc";
	const searchQuery = c.req.query("q");

	// Filter books if search query is provided
	if (searchQuery) {
		const query = searchQuery.toLowerCase();
		books = books.filter(
			(book) =>
				book.title.toLowerCase().includes(query) ||
				(book.author && book.author.toLowerCase().includes(query)),
		);
	}

	const xml = await renderXml("opds", {
		books: sortBooks(books, sortMode),
		baseUrl: getBaseUrl(c, config),
		currentTime: new Date().toISOString(),
		sortMode,
		title: searchQuery ? `Search: ${searchQuery}` : "OPDS Library",
	});

	c.header(
		"Content-Type",
		"application/atom+xml;charset=utf-8;profile=opds-catalog;kind=acquisition",
	);
	return c.body(xml);
});

app.get("/admin", async (c) => {
	console.log("Admin request received");
	const books = await getBooks(config.BOOKS_DIR);
	console.log("Books loaded:", books.length);
	const sortMode = (c.req.query("sort") as SortMode) || "name-asc";

	const html = await renderView("admin", {
		books: sortBooks(books, sortMode),
		baseUrl: getBaseUrl(c, config),
		sortMode,
		title: "OPDShelf Admin",
	});

	return c.html(html);
});

app.get("/opensearch.xml", async (c) => {
	const baseUrl = getBaseUrl(c, config);
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>OPDShelf</ShortName>
  <Description>Search OPDShelf library</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
       template="${baseUrl}/?search={searchTerms}&amp;sort=name-asc"/>
</OpenSearchDescription>`;
	c.header("Content-Type", "application/opensearchdescription+xml");
	return c.body(xml);
});

export default app;
