import initSqlJs from "sql.js";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "opdshelf.db");

export interface Collection {
	id: number;
	name: string;
	description?: string;
	created_at: string;
}

export interface BookCollection {
	book_filename: string;
	collection_id: number;
}

export interface BookMetadata {
	filename: string;
	title: string;
	author?: string;
	description?: string;
	publisher?: string;
	language?: string;
	identifier?: string;
	subject?: string;
	series?: string;
	seriesIndex?: string;
	size: number;
	mimeType: string;
	lastUpdated: string;
}

let db: initSqlJs.Database | null = null;
let SQL: any = null;
let initPromise: Promise<any> | null = null;

async function initSqlJsModule() {
	if (!SQL) {
		if (!initPromise) {
			initPromise = initSqlJs().then((module) => {
				SQL = module;
				initPromise = null;
				return SQL;
			});
		}
		return initPromise;
	}
	return SQL;
}

export async function getDb(): Promise<initSqlJs.Database> {
	if (!db) {
		console.log("Initializing database...");
		const SQL = await initSqlJsModule();

		// Load existing database or create new one
		let dbBuffer: Uint8Array | null = null;
		if (fs.existsSync(DB_PATH)) {
			dbBuffer = fs.readFileSync(DB_PATH);
		}

		db = new SQL.Database(dbBuffer);
		initializeDatabase();
		console.log("Database initialized");
	}
	return db!;
}

function initializeDatabase() {
	if (!db) return;

	// Create collections table
	db!.run(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// Create books table for metadata caching
	db!.run(`
    CREATE TABLE IF NOT EXISTS books (
      filename TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      publisher TEXT,
      language TEXT,
      identifier TEXT,
      subject TEXT,
      series TEXT,
      series_index TEXT,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// Add new columns if they don't exist (for existing databases)
	try {
		db!.run("ALTER TABLE books ADD COLUMN description TEXT");
	} catch (e) {
		// Column already exists
	}
	try {
		db!.run("ALTER TABLE books ADD COLUMN publisher TEXT");
	} catch (e) {
		// Column already exists
	}
	try {
		db!.run("ALTER TABLE books ADD COLUMN language TEXT");
	} catch (e) {
		// Column already exists
	}
	try {
		db!.run("ALTER TABLE books ADD COLUMN identifier TEXT");
	} catch (e) {
		// Column already exists
	}
	try {
		db!.run("ALTER TABLE books ADD COLUMN subject TEXT");
	} catch (e) {
		// Column already exists
	}
	try {
		db!.run("ALTER TABLE books ADD COLUMN series TEXT");
	} catch (e) {
		// Column already exists
	}
	try {
		db!.run("ALTER TABLE books ADD COLUMN series_index TEXT");
	} catch (e) {
		// Column already exists
	}

	// Create book_collections junction table
	db!.run(`
    CREATE TABLE IF NOT EXISTS book_collections (
      book_filename TEXT NOT NULL,
      collection_id INTEGER NOT NULL,
      PRIMARY KEY (book_filename, collection_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    )
  `);

	// Create index for faster lookups
	db!.run(`
    CREATE INDEX IF NOT EXISTS idx_book_collections_filename 
    ON book_collections(book_filename)
  `);
}

export async function createCollection(
	name: string,
	description?: string,
): Promise<Collection> {
	const db = await getDb();
	db.run("INSERT INTO collections (name, description) VALUES (?, ?)", [
		name,
		description || null,
	]);
	await saveDb();

	const result = db.exec("SELECT last_insert_rowid() as id")[0];
	const id = result.values[0][0] as number;

	return {
		id,
		name,
		description,
		created_at: new Date().toISOString(),
	};
}

export async function getCollections(): Promise<Collection[]> {
	const db = await getDb();
	const result = db.exec("SELECT * FROM collections ORDER BY name");

	if (result.length === 0) return [];

	const columns = result[0].columns;
	return result[0].values.map((row: any[]) => {
		const obj: any = {};
		columns.forEach((col: string, i: number) => {
			obj[col] = row[i];
		});
		return obj as Collection;
	});
}

export async function getCollection(id: number): Promise<Collection | null> {
	const db = await getDb();
	const result = db.exec("SELECT * FROM collections WHERE id = ?", [id]);

	if (result.length === 0) return null;

	const columns = result[0].columns;
	const row = result[0].values[0];
	const obj: any = {};
	columns.forEach((col: string, i: number) => {
		obj[col] = row[i];
	});
	return obj as Collection;
}

export async function syncSeriesToCollections(): Promise<number> {
	const db = await getDb();

	// Get all unique series names from books that have more than 1 book
	const seriesResult = db.exec(`
		SELECT series, COUNT(*) as book_count 
		FROM books 
		WHERE series IS NOT NULL AND series != '' 
		GROUP BY series 
		HAVING book_count > 1
	`);

	if (seriesResult.length === 0) return 0;

	const seriesData = seriesResult[0].values.map((row: any[]) => ({
		name: row[0] as string,
		count: row[1] as number,
	}));
	let collectionsCreated = 0;

	for (const { name: seriesName, count } of seriesData) {
		// Check if collection already exists
		const existing = db.exec("SELECT id FROM collections WHERE name = ?", [
			seriesName,
		]);

		let collectionId: number;
		if (existing.length === 0) {
			// Create new collection
			db.run("INSERT INTO collections (name, description) VALUES (?, ?)", [
				seriesName,
				`Automatic collection for ${seriesName} series (${count} books)`,
			]);
			const result = db.exec("SELECT last_insert_rowid() as id")[0];
			collectionId = result.values[0][0] as number;
			collectionsCreated++;
		} else {
			collectionId = existing[0].values[0][0] as number;
		}

		// Get all books in this series
		const booksResult = db.exec("SELECT filename FROM books WHERE series = ?", [
			seriesName,
		]);

		if (booksResult.length > 0) {
			const bookFilenames = booksResult[0].values.map(
				(row: any[]) => row[0] as string,
			);

			// Add books to collection
			for (const filename of bookFilenames) {
				// Check if already in collection
				const existingRelation = db.exec(
					"SELECT * FROM book_collections WHERE book_filename = ? AND collection_id = ?",
					[filename, collectionId],
				);

				if (existingRelation.length === 0) {
					db.run(
						"INSERT INTO book_collections (book_filename, collection_id) VALUES (?, ?)",
						[filename, collectionId],
					);
				}
			}
		}
	}

	await saveDb();
	return collectionsCreated;
}

export async function cleanupSingleBookCollections(): Promise<number> {
	const db = await getDb();

	// Get collections that have only 1 book
	const result = db.exec(`
		SELECT c.id, c.name, COUNT(bc.book_filename) as book_count
		FROM collections c
		LEFT JOIN book_collections bc ON c.id = bc.collection_id
		GROUP BY c.id
		HAVING book_count <= 1
	`);

	if (result.length === 0) return 0;

	const collectionIds = result[0].values.map((row: any[]) => row[0] as number);
	let deletedCount = 0;

	for (const id of collectionIds) {
		// Delete the collection (cascade will handle book_collections)
		db.run("DELETE FROM collections WHERE id = ?", [id]);
		deletedCount++;
	}

	await saveDb();
	return deletedCount;
}

export async function updateCollection(
	id: number,
	name: string,
	description?: string,
): Promise<boolean> {
	const db = await getDb();
	db.run("UPDATE collections SET name = ?, description = ? WHERE id = ?", [
		name,
		description || null,
		id,
	]);
	await saveDb();
	return true;
}

export async function deleteCollection(id: number): Promise<boolean> {
	const db = await getDb();
	db.run("DELETE FROM collections WHERE id = ?", [id]);
	await saveDb();
	return true;
}

export async function addBookToCollection(
	bookFilename: string,
	collectionId: number,
): Promise<boolean> {
	const db = await getDb();
	db.run(
		"INSERT OR IGNORE INTO book_collections (book_filename, collection_id) VALUES (?, ?)",
		[bookFilename, collectionId],
	);
	await saveDb();
	return true;
}

export async function removeBookFromCollection(
	bookFilename: string,
	collectionId: number,
): Promise<boolean> {
	const db = await getDb();
	db.run(
		"DELETE FROM book_collections WHERE book_filename = ? AND collection_id = ?",
		[bookFilename, collectionId],
	);
	await saveDb();
	return true;
}

export async function getBooksInCollection(
	collectionId: number,
): Promise<string[]> {
	const db = await getDb();
	const result = db.exec(
		"SELECT book_filename FROM book_collections WHERE collection_id = ?",
		[collectionId],
	);

	if (result.length === 0) return [];

	return result[0].values.map((row: any[]) => row[0] as string);
}

export async function getBookCollections(
	bookFilename: string,
): Promise<Collection[]> {
	const db = await getDb();
	const result = db.exec(
		`
    SELECT c.* FROM collections c
    JOIN book_collections bc ON c.id = bc.collection_id
    WHERE bc.book_filename = ?
    ORDER BY c.name
  `,
		[bookFilename],
	);

	if (result.length === 0) return [];

	const columns = result[0].columns;
	return result[0].values.map((row: any[]) => {
		const obj: any = {};
		columns.forEach((col: string, i: number) => {
			obj[col] = row[i];
		});
		return obj as Collection;
	});
}

export async function saveDb() {
	if (db) {
		const data = db.export();
		fs.writeFileSync(DB_PATH, Buffer.from(data));
	}
}

export async function closeDb() {
	if (db) {
		await saveDb();
		db.close();
		db = null;
	}
}

// Book metadata functions
export async function upsertBookMetadata(
	metadata: BookMetadata,
): Promise<void> {
	const db = await getDb();
	db.run(
		`INSERT OR REPLACE INTO books (filename, title, author, description, publisher, language, identifier, subject, series, series_index, size, mime_type, last_updated) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			metadata.filename,
			metadata.title,
			metadata.author || null,
			metadata.description || null,
			metadata.publisher || null,
			metadata.language || null,
			metadata.identifier || null,
			metadata.subject || null,
			metadata.series || null,
			metadata.seriesIndex || null,
			metadata.size,
			metadata.mimeType,
			metadata.lastUpdated,
		],
	);
	await saveDb();
}

export async function getBookMetadata(
	filename: string,
): Promise<BookMetadata | null> {
	const db = await getDb();
	const result = db.exec("SELECT * FROM books WHERE filename = ?", [filename]);

	if (result.length === 0) return null;

	const columns = result[0].columns;
	const row = result[0].values[0];
	const obj: any = {};
	columns.forEach((col: string, i: number) => {
		// Convert snake_case to camelCase for series_index
		const key = col === "series_index" ? "seriesIndex" : col;
		obj[key] = row[i];
	});
	return obj as BookMetadata;
}

export async function getAllBookMetadata(): Promise<BookMetadata[]> {
	const db = await getDb();
	const result = db.exec("SELECT * FROM books ORDER BY title ASC");

	if (result.length === 0) return [];

	const columns = result[0].columns;
	return result[0].values.map((row: any[]) => {
		const obj: any = {};
		columns.forEach((col: string, i: number) => {
			// Convert snake_case to camelCase for series_index
			const key = col === "series_index" ? "seriesIndex" : col;
			obj[key] = row[i];
		});
		return obj as BookMetadata;
	});
}

export async function deleteBookMetadata(filename: string): Promise<void> {
	const db = await getDb();
	db.run("DELETE FROM books WHERE filename = ?", [filename]);
	await saveDb();
}
