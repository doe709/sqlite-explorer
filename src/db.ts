import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

export interface TableInfo {
    name: string;
    count: number;
}

export interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
}

export interface TableData {
    table: string;
    columns: ColumnInfo[];
    rows: any[];
    count: number;
}

let SQL: any = null;
let _extensionPath: string = '';

/**
 * Set the extension path (called from extension.ts on activation)
 */
export function setExtensionPath(extPath: string): void {
    _extensionPath = extPath;
}

async function getSqlJs(): Promise<any> {
    if (!SQL) {
        // Look for wasm file next to dist/ or in node_modules
        const wasmPath = path.join(_extensionPath, 'dist', 'sql-wasm.wasm');
        const wasmBinary = fs.readFileSync(wasmPath);
        SQL = await initSqlJs({ wasmBinary });
    }
    return SQL;
}

export class SqliteDB {
    private db: SqlJsDatabase | null = null;
    private dbPath: string = '';

    /**
     * Open database
     */
    async open(filePath: string): Promise<void> {
        this.close();
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        const SqlJs = await getSqlJs();
        const buffer = fs.readFileSync(filePath);
        this.db = new SqlJs.Database(buffer);
        this.db!.run('PRAGMA foreign_keys = ON');
        this.dbPath = filePath;
    }

    /**
     * Save current DB to file
     */
    save(): void {
        if (this.db && this.dbPath) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
    }

    /**
     * Close database
     */
    close(): void {
        if (this.db) {
            this.save();
            this.db.close();
            this.db = null;
            this.dbPath = '';
        }
    }

    /**
     * Check connection
     */
    isOpen(): boolean {
        return this.db !== null;
    }

    /**
     * Get current DB path
     */
    getPath(): string {
        return this.dbPath;
    }

    /**
     * Get DB file name
     */
    getName(): string {
        return path.basename(this.dbPath);
    }

    /**
     * Get list of tables with row counts
     */
    getTables(): TableInfo[] {
        this.ensureOpen();
        const stmt = this.db!.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
        );

        const tables: TableInfo[] = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const name = row.name as string;
            const countStmt = this.db!.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`);
            countStmt.step();
            const countRow = countStmt.getAsObject();
            tables.push({
                name,
                count: countRow.cnt as number
            });
            countStmt.free();
        }
        stmt.free();
        return tables;
    }

    /**
     * Get table columns
     */
    getColumns(table: string): ColumnInfo[] {
        this.ensureOpen();
        this.validateTableName(table);
        const stmt = this.db!.prepare(`PRAGMA table_info("${table}")`);
        const columns: ColumnInfo[] = [];
        while (stmt.step()) {
            const row = stmt.getAsObject() as any;
            columns.push({
                cid: row.cid,
                name: row.name,
                type: row.type || 'TEXT',
                notnull: row.notnull,
                dflt_value: row.dflt_value,
                pk: row.pk
            });
        }
        stmt.free();
        return columns;
    }

    /**
     * Get table data
     */
    getTableData(table: string, limit: number = 100, offset: number = 0): TableData {
        this.ensureOpen();
        this.validateTableName(table);

        const columns = this.getColumns(table);

        const stmt = this.db!.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`);
        stmt.bind([limit, offset]);

        const rows: any[] = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();

        const countStmt = this.db!.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`);
        countStmt.step();
        const countRow = countStmt.getAsObject();
        countStmt.free();

        return {
            table,
            columns,
            rows,
            count: countRow.cnt as number
        };
    }

    /**
     * Insert record
     */
    insert(table: string, data: Record<string, any>): number {
        this.ensureOpen();
        this.validateTableName(table);

        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map(k => data[k]);

        const colNames = keys.map(k => `"${k}"`).join(', ');
        this.db!.run(
            `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`,
            values
        );
        this.save();

        // Get last insert rowid
        const stmt = this.db!.prepare('SELECT last_insert_rowid() as id');
        stmt.step();
        const result = stmt.getAsObject();
        stmt.free();
        return result.id as number;
    }

    /**
     * Update record
     */
    update(table: string, id: number, data: Record<string, any>): void {
        this.ensureOpen();
        this.validateTableName(table);

        const pk = this.getPrimaryKey(table);
        const keys = Object.keys(data).filter(k => k !== pk);
        if (keys.length === 0) {
            throw new Error('No data to update');
        }

        const setClause = keys.map(k => `"${k}" = ?`).join(', ');
        const values = keys.map(k => data[k]);
        values.push(id);

        this.db!.run(
            `UPDATE "${table}" SET ${setClause} WHERE "${pk}" = ?`,
            values
        );
        this.save();
    }

    /**
     * Delete record
     */
    deleteRow(table: string, id: number): void {
        this.ensureOpen();
        this.validateTableName(table);

        const pk = this.getPrimaryKey(table);
        this.db!.run(
            `DELETE FROM "${table}" WHERE "${pk}" = ?`,
            [id]
        );
        this.save();
    }

    /**
     * Get Primary Key column name
     */
    getPrimaryKey(table: string): string {
        const columns = this.getColumns(table);
        const pk = columns.find(c => c.pk === 1);
        return pk ? pk.name : 'rowid';
    }

    /**
     * Create demo DB
     */
    static async createDemoDb(filePath: string): Promise<void> {
        const SqlJs = await getSqlJs();

        const db = new SqlJs.Database();

        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                age INTEGER DEFAULT 0
            )
        `);
        db.run(`INSERT INTO users (name, email, age) VALUES ('John Smith', 'john@mail.com', 28)`);
        db.run(`INSERT INTO users (name, email, age) VALUES ('Maria Johnson', 'maria@test.com', 24)`);
        db.run(`INSERT INTO users (name, email, age) VALUES ('Alex Brown', 'alex@gmail.com', 35)`);
        db.run(`INSERT INTO users (name, email, age) VALUES ('Elena Davis', 'elena@mail.com', 30)`);
        db.run(`INSERT INTO users (name, email, age) VALUES ('Dmitry Wilson', 'dmitry@inbox.com', 22)`);

        db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT DEFAULT 'Other'
            )
        `);
        db.run(`INSERT INTO products (name, price, category) VALUES ('Laptop', 899.99, 'Electronics')`);
        db.run(`INSERT INTO products (name, price, category) VALUES ('Phone', 299.99, 'Electronics')`);
        db.run(`INSERT INTO products (name, price, category) VALUES ('Headphones', 49.99, 'Accessories')`);
        db.run(`INSERT INTO products (name, price, category) VALUES ('Keyboard', 34.99, 'Peripherals')`);
        db.run(`INSERT INTO products (name, price, category) VALUES ('Monitor', 249.99, 'Electronics')`);

        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                created_at TEXT DEFAULT '',
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);
        db.run(`INSERT INTO orders (user_id, product_id, quantity, created_at) VALUES (1, 1, 1, '2026-01-15 10:30:00')`);
        db.run(`INSERT INTO orders (user_id, product_id, quantity, created_at) VALUES (2, 2, 2, '2026-01-20 14:15:00')`);
        db.run(`INSERT INTO orders (user_id, product_id, quantity, created_at) VALUES (1, 3, 1, '2026-02-01 09:00:00')`);
        db.run(`INSERT INTO orders (user_id, product_id, quantity, created_at) VALUES (3, 5, 1, '2026-02-10 16:45:00')`);
        db.run(`INSERT INTO orders (user_id, product_id, quantity, created_at) VALUES (4, 4, 3, '2026-02-25 11:20:00')`);

        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(filePath, buffer);
        db.close();
    }

    /**
     * Ensure DB is open
     */
    private ensureOpen(): void {
        if (!this.db) {
            throw new Error('Database not open. Please open a .db file');
        }
    }

    /**
     * Validate table name (SQL injection protection)
     */
    private validateTableName(table: string): void {
        if (!/^[a-zA-Z_\u0400-\u04FF][a-zA-Z0-9_\u0400-\u04FF]*$/.test(table)) {
            throw new Error(`Invalid table name: ${table}`);
        }
    }
}
