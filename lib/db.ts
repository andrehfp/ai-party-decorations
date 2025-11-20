import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "party.db");
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS iterations (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    theme TEXT NOT NULL,
    details TEXT,
    decorationTypes TEXT NOT NULL, -- JSON array
    imageCount INTEGER NOT NULL,
    size TEXT NOT NULL,
    aspectRatio TEXT,
    prompt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    iterationId TEXT NOT NULL,
    data TEXT NOT NULL, -- Base64 string
    type TEXT NOT NULL CHECK(type IN ('generated', 'reference')),
    FOREIGN KEY (iterationId) REFERENCES iterations (id) ON DELETE CASCADE
  );
`);

export default db;
