<p align="center">
  <img src="static/logo.png" alt="OPDShelf Logo" width="200">
</p>
<h1 align="center">OPDShelf</h1>
<p align="center"><em>Host your own OPDS library server in seconds</em></p>
<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Install</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#faq">FAQ</a>
</p>

<p align="center">
  <img src="static/screenshot.png" alt="OPDShelf Screenshot" width="800">
</p>

---

## Features

🚀 **Simple & Fast**
- Powered by **Bun** for high performance
- SQLite database for collections and metadata
- Minimal resource usage

📚 **Full Format Support**
- EPUB, PDF, FB2, MOBI, AZW, CBZ, CBR, DJVU, RTF, TXT
- Automatic cover extraction
- Recursive directory scanning
- **Metadata extraction**: Book titles extracted from EPUB metadata

🖥️ **Modern Web UI**
- Drag-and-drop uploads
- Responsive admin panel
- Dark mode support
- **Collections/Shelves**: Organize books into custom collections
- **Search**: Client-side search in admin panel

📱 **OPDS Compatible**
- Works with any OPDS reader (Moon+ Reader, KOReader, Calibre, etc.)
- OPDS 1.x feed
- **Dynamic Sorting**: Order your feed by name or date via URL parameters
- **Search support**: OpenSearch protocol for OPDS readers
- **Collections in OPDS**: Browse collections via OPDS feed
- **Default sorting**: Title A-Z (configurable via URL)

---

## Usage

### Sorting
Both the Admin UI and the OPDS feed support sorting. In the OPDS feed, use the `sort` query parameter:

- **Name (A-Z)**: `?sort=name-asc` (Default)
- **Name (Z-A)**: `?sort=name-desc`
- **Newest First**: `?sort=date-desc`
- **Oldest First**: `?sort=date-asc`

Example: `http://localhost:3000/?sort=name-asc`

### Search
Search is supported in both the Admin UI and OPDS feed:

- **Admin UI**: Use the search box to filter books by title
- **OPDS Feed**: Use the `search` query parameter: `?search=keyword`
- **OpenSearch**: OPDS readers can discover search capabilities via the OpenSearch description at `/opensearch.xml`

Example: `http://localhost:3000/?search=harry`

### Collections
Organize your books into custom collections:

- **Web UI**: Create collections via the Collections page in the admin panel
- **OPDS Feed**: Browse collections at `/collections/opds`
- **Collection Feed**: Each collection has its own OPDS feed at `/collections/{id}/opds`
- **Management**: Add/remove books from collections through the web interface

---

## Installation

### Docker Compose (Recommended)

```yaml
services:
  opdshelf:
    build: .
    container_name: opdshelf
    ports:
      - "3000:3000"
    volumes:
      - ./books:/app/books
    restart: unless-stopped
```

```bash
docker compose up -d
```

Access the admin panel at **http://localhost:3000/admin**

### Binary

1. Install [Bun](https://bun.sh)
2. Install dependencies and run:

```bash
bun install
bun run start
```

3. Open **http://localhost:3000/admin**

---

## Configuration

| Variable  | Default   | Description            |
|-----------|-----------|------------------------|
| `PORT`    | `3000`    | Port to listen on      |
| `HOST`    | `0.0.0.0` | Host to bind to        |
| `BOOKS_DIR` | `./books` | Directory for books  |
| `ADMIN_USERNAME` | none | Username (optional) |
| `ADMIN_PASSWORD` | none | Password (optional) |

---

## Building from Source

```bash
# Requires Bun
bun build --compile --outfile opds-server ./src/index.ts
```

---

## FAQ

<details>
<summary><strong>What is OPDS?</strong></summary>

OPDS (Open Publication Distribution System) is a standard for sharing digital books via web feeds, supported by most e-reader apps.
</details>

<details>
<summary><strong>How do I connect my e-reader?</strong></summary>

Add your server's OPDS URL (shown in the admin panel) to your reader app.
</details>

<details>
<summary><strong>Books not showing up?</strong></summary>

Ensure files are in the `books/` directory with supported extensions.
</details>

---

## Contributing

Pull requests welcome! Open an issue first for feature discussions.

## License

MIT
