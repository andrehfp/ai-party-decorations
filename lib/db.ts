import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Store database in data directory for better security
const dataDir = path.join(process.cwd(), "data");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "party.db");
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
    decorationType TEXT, -- Specific decoration type (e.g., 'Cake topper', 'Favor tags')
    FOREIGN KEY (iterationId) REFERENCES iterations (id) ON DELETE CASCADE
  );
`);

// Add decorationType column to existing images table if it doesn't exist
try {
  db.exec(`ALTER TABLE images ADD COLUMN decorationType TEXT;`);
} catch (error) {
  // Column already exists, ignore error
}

export default db;
