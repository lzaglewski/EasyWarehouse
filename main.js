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
    invoice_date TEXT
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