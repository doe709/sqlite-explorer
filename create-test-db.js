const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    // === USERS ===
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        age INTEGER DEFAULT 0
    )`);
    db.run(`INSERT INTO users (name, email, age) VALUES
        ('John Smith', 'john@mail.com', 28),
        ('Maria Johnson', 'maria@test.com', 24),
        ('Alex Brown', 'alex@gmail.com', 35),
        ('Elena Davis', 'elena@mail.com', 30),
        ('Dmitry Wilson', 'dmitry@inbox.com', 22)`);

    // === PRODUCTS ===
    db.run(`CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT DEFAULT 'Other'
    )`);
    db.run(`INSERT INTO products (name, price, category) VALUES
        ('Laptop', 899.99, 'Electronics'),
        ('Phone', 299.99, 'Electronics'),
        ('Headphones', 49.99, 'Accessories'),
        ('Keyboard', 34.99, 'Peripherals'),
        ('Monitor', 249.99, 'Electronics')`);

    // === ORDERS ===
    db.run(`CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ''
    )`);
    db.run(`INSERT INTO orders (user_id, product_id, quantity, created_at) VALUES
        (1, 1, 1, '2026-01-15 10:30:00'),
        (2, 2, 2, '2026-01-20 14:15:00'),
        (1, 3, 1, '2026-02-01 09:00:00'),
        (3, 5, 1, '2026-02-10 16:45:00'),
        (4, 4, 3, '2026-02-25 11:20:00')`);

    // Save
    const dir = 'test-database';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'demo.db'), Buffer.from(db.export()));

    // Print contents
    console.log('✅ Database created: test-database/demo.db\n');

    const r1 = db.exec('SELECT * FROM users');
    console.log('┌──────────────────────────────────────────────────┐');
    console.log('│  📋 USERS (5 rows)                              │');
    console.log('├────┬──────────────────┬──────────────────┬───────┤');
    console.log('│ id │ name             │ email            │ age   │');
    console.log('├────┼──────────────────┼──────────────────┼───────┤');
    r1[0].values.forEach(r => {
        console.log(`│ ${String(r[0]).padEnd(2)} │ ${String(r[1]).padEnd(16)} │ ${String(r[2]).padEnd(16)} │ ${String(r[3]).padEnd(5)} │`);
    });
    console.log('└────┴──────────────────┴──────────────────┴───────┘\n');

    const r2 = db.exec('SELECT * FROM products');
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│  📋 PRODUCTS (5 rows)                            │');
    console.log('├────┬──────────────┬───────────┬──────────────────────┤');
    console.log('│ id │ name         │ price     │ category             │');
    console.log('├────┼──────────────┼───────────┼──────────────────────┤');
    r2[0].values.forEach(r => {
        console.log(`│ ${String(r[0]).padEnd(2)} │ ${String(r[1]).padEnd(12)} │ ${String(r[2]).padStart(9)} │ ${String(r[3]).padEnd(20)} │`);
    });
    console.log('└────┴──────────────┴───────────┴──────────────────────┘\n');

    const r3 = db.exec('SELECT * FROM orders');
    console.log('┌────────────────────────────────────────────────────────────────┐');
    console.log('│  📋 ORDERS (5 rows)                                        │');
    console.log('├────┬─────────┬────────────┬──────────┬────────────────────────┤');
    console.log('│ id │ user_id │ product_id │ quantity │ created_at              │');
    console.log('├────┼─────────┼────────────┼──────────┼────────────────────────┤');
    r3[0].values.forEach(r => {
        console.log(`│ ${String(r[0]).padEnd(2)} │ ${String(r[1]).padEnd(7)} │ ${String(r[2]).padEnd(10)} │ ${String(r[3]).padEnd(8)} │ ${String(r[4]).padEnd(22)} │`);
    });
    console.log('└────┴─────────┴────────────┴──────────┴────────────────────────┘');

    db.close();
}

main();
