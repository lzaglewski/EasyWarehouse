const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

// Inicjalizacja bazy danych
const db = new Database('warehouse.db');

// Tworzenie tabel
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    status TEXT NOT NULL,
    sale_date TEXT,
    invoice_date TEXT,
    reserved_quantity INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Odkomentuj dla trybu deweloperskiego
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Obsługa zdarzeń IPC
ipcMain.handle('get-products', () => {
  return db.prepare('SELECT * FROM products').all();
});

ipcMain.handle('add-product', (event, product) => {
  const stmt = db.prepare(`
    INSERT INTO products (name, description, quantity, unit_price, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(
    product.name,
    product.description,
    product.quantity,
    product.unitPrice,
    'na magazynie'
  ).lastInsertRowid;
});

ipcMain.handle('sell-product', (event, { id, quantity }) => {
  const stmt = db.prepare(`
    UPDATE products 
    SET quantity = quantity - ?, 
        status = CASE 
          WHEN quantity - ? <= 0 THEN 'sprzedany'
          ELSE status 
        END,
        sale_date = datetime('now')
    WHERE id = ?
  `);
  return stmt.run(quantity, quantity, id).changes;
});

ipcMain.handle('invoice-product', (event, id) => {
  const stmt = db.prepare(`
    UPDATE products 
    SET status = 'fakturowany',
        invoice_date = datetime('now')
    WHERE id = ?
  `);
  return stmt.run(id).changes;
});

// Obsługa faktur
ipcMain.handle('create-invoice', (event, invoiceData) => {
    const { customer_name, issue_date, due_date, items } = invoiceData;
    
    // Rozpocznij transakcję
    const transaction = db.transaction(() => {
        // Wstaw fakturę
        const invoiceStmt = db.prepare(`
            INSERT INTO invoices (invoice_number, customer_name, issue_date, due_date, total_amount)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const invoiceNumber = `INV-${Date.now()}`;
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        
        const invoiceResult = invoiceStmt.run(
            invoiceNumber,
            customer_name,
            issue_date,
            due_date,
            totalAmount
        );
        
        const invoiceId = invoiceResult.lastInsertRowid;
        
        // Wstaw pozycje faktury i zaktualizuj stan magazynowy
        const itemStmt = db.prepare(`
            INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const updateProductStmt = db.prepare(`
            UPDATE products 
            SET quantity = quantity - ?,
                reserved_quantity = reserved_quantity - ?
            WHERE id = ?
        `);
        
        items.forEach(item => {
            itemStmt.run(
                invoiceId,
                item.product_id,
                item.quantity,
                item.unit_price,
                item.quantity * item.unit_price
            );
            
            updateProductStmt.run(
                item.quantity,
                item.quantity,
                item.product_id
            );
        });
        
        return { success: true, invoiceId };
    });
    
    return transaction();
});

ipcMain.handle('get-invoices', () => {
    const stmt = db.prepare(`
        SELECT i.*, 
               GROUP_CONCAT(p.name || ' (' || ii.quantity || ' x ' || ii.unit_price || ' zł)') as items
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
        LEFT JOIN products p ON ii.product_id = p.id
        GROUP BY i.id
        ORDER BY i.issue_date DESC
    `);
    
    return stmt.all();
});

ipcMain.handle('get-invoice-details', (event, invoiceId) => {
    const invoiceStmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
    const itemsStmt = db.prepare(`
        SELECT ii.*, p.name as product_name
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
    `);
    
    const invoice = invoiceStmt.get(invoiceId);
    const items = itemsStmt.all(invoiceId);
    
    return { invoice, items };
}); 