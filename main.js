const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Określenie ścieżki do bazy danych
let dbPath;
let isFirstRun = false;

if (process.env.NODE_ENV === 'development') {
  dbPath = 'warehouse.db';
  // Sprawdź, czy to pierwsze uruchomienie w trybie developerskim
  isFirstRun = !fs.existsSync(dbPath);
} else {
  // W wersji produkcyjnej użyj katalogu danych aplikacji
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'warehouse.db');
  
  // Sprawdź, czy plik bazy danych istnieje w katalogu użytkownika
  isFirstRun = !fs.existsSync(dbPath);
  
  if (isFirstRun) {
    const resourceDbPath = process.resourcesPath ? path.join(process.resourcesPath, 'warehouse.db') : 'warehouse.db';
    
    // Jeśli plik istnieje w zasobach, skopiuj go
    if (fs.existsSync(resourceDbPath)) {
      fs.copyFileSync(resourceDbPath, dbPath);
    }
  }
}

// Inicjalizacja bazy danych
const db = new Database(dbPath);

// Funkcja do wyczyszczenia bazy danych
function clearDatabase() {
  console.log('Czyszczenie bazy danych...');
  try {
    // Usunięcie wszystkich danych z tabel
    db.exec(`
      DELETE FROM product_items;
      DELETE FROM invoice_items;
      DELETE FROM invoices;
      DELETE FROM products;
    `);
    console.log('Baza danych została wyczyszczona');
  } catch (error) {
    console.error('Błąd podczas czyszczenia bazy danych:', error.message);
  }
}

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

  CREATE TABLE IF NOT EXISTS product_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'na magazynie',
    sale_date TEXT,
    invoice_date TEXT,
    invoice_id INTEGER,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
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

// Wyczyść bazę danych tylko przy pierwszym uruchomieniu
if (isFirstRun) {
  console.log('Pierwsze uruchomienie aplikacji, resetowanie bazy danych...');
  clearDatabase();
}

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

  // Ładowanie pliku HTML z uwzględnieniem kontekstu (produkcja vs rozwój)
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadFile('index.html');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }
  
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
  const query = `
    SELECT p.*, 
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id) as total_items,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'na magazynie') as items_in_stock,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'sprzedany') as items_sold,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as items_invoiced,
           (SELECT MAX(sale_date) FROM product_items WHERE product_id = p.id AND status IN ('sprzedany', 'fakturowany')) as last_sale_date,
           (SELECT MAX(invoice_date) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as last_invoice_date
    FROM products p
  `;
  return db.prepare(query).all();
});

// Obsługa pobierania produktów na magazynie
ipcMain.handle('get-products-in-stock', () => {
  const query = `
    SELECT p.*, 
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id) as total_items,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'na magazynie') as items_in_stock,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'sprzedany') as items_sold,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as items_invoiced,
           (SELECT MAX(sale_date) FROM product_items WHERE product_id = p.id AND status IN ('sprzedany', 'fakturowany')) as last_sale_date,
           (SELECT MAX(invoice_date) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as last_invoice_date
    FROM products p
    WHERE EXISTS (
      SELECT 1 FROM product_items 
      WHERE product_id = p.id AND status = 'na magazynie'
    )
  `;
  return db.prepare(query).all();
});

// Obsługa pobierania produktów fakturowanych
ipcMain.handle('get-products-invoiced', () => {
  const query = `
    SELECT p.*, 
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id) as total_items,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'na magazynie') as items_in_stock,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'sprzedany') as items_sold,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as items_invoiced,
           (SELECT MAX(sale_date) FROM product_items WHERE product_id = p.id AND status IN ('sprzedany', 'fakturowany')) as last_sale_date,
           (SELECT MAX(invoice_date) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as last_invoice_date
    FROM products p
    WHERE EXISTS (
      SELECT 1 FROM product_items 
      WHERE product_id = p.id AND status = 'fakturowany'
    )
  `;
  return db.prepare(query).all();
});

ipcMain.handle('add-product', (event, product) => {
  // Transakcja do dodania produktu i jego elementów
  const transaction = db.transaction(() => {
    // Dodaj główny produkt
    const productStmt = db.prepare(`
      INSERT INTO products (name, description, quantity, unit_price, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const productResult = productStmt.run(
      product.name,
      product.description,
      product.quantity,
      product.unitPrice,
      'na magazynie'
    );
    
    const productId = productResult.lastInsertRowid;
    
    // Dodaj poszczególne elementy produktu
    const itemStmt = db.prepare(`
      INSERT INTO product_items (product_id, status)
      VALUES (?, 'na magazynie')
    `);
    
    // Dodaj tyle wpisów ile wynosi ilość
    for (let i = 0; i < product.quantity; i++) {
      itemStmt.run(productId);
    }
    
    return productId;
  });
  
  return transaction();
});

ipcMain.handle('sell-product', (event, { id, quantity }) => {
  const transaction = db.transaction(() => {
    // Aktualizuj ilość w głównej tabeli produktów
    const updateProductStmt = db.prepare(`
      UPDATE products 
      SET quantity = quantity - ?
      WHERE id = ?
    `);
    
    updateProductStmt.run(quantity, id);
    
    // Znajdź elementy produktu, które są na magazynie
    const itemsToUpdateStmt = db.prepare(`
      SELECT id FROM product_items 
      WHERE product_id = ? AND status = 'na magazynie' 
      LIMIT ?
    `);
    
    const itemsToUpdate = itemsToUpdateStmt.all(id, quantity);
    
    // Aktualizuj status elementów
    const updateItemStmt = db.prepare(`
      UPDATE product_items 
      SET status = 'sprzedany',
          sale_date = datetime('now')
      WHERE id = ?
    `);
    
    itemsToUpdate.forEach(item => {
      updateItemStmt.run(item.id);
    });
    
    return itemsToUpdate.length;  // zwróć liczbę zaktualizowanych elementów
  });
  
  return transaction();
});

ipcMain.handle('invoice-product', (event, id) => {
  const transaction = db.transaction(() => {
    // Znajdź sprzedane elementy produktu, które nie są jeszcze fakturowane
    const itemsToUpdateStmt = db.prepare(`
      SELECT id FROM product_items 
      WHERE product_id = ? AND status = 'sprzedany' AND invoice_id IS NULL
    `);
    
    const itemsToUpdate = itemsToUpdateStmt.all(id);
    
    // Aktualizuj status elementów
    const updateItemStmt = db.prepare(`
      UPDATE product_items 
      SET status = 'fakturowany',
          invoice_date = datetime('now')
      WHERE id = ?
    `);
    
    itemsToUpdate.forEach(item => {
      updateItemStmt.run(item.id);
    });
    
    return itemsToUpdate.length;  // zwróć liczbę zaktualizowanych elementów
  });
  
  return transaction();
});

// Obsługa edycji produktu
ipcMain.handle('edit-product', (event, product) => {
  const transaction = db.transaction(() => {
    // Najpierw pobierz aktualny stan produktu
    const currentProduct = db.prepare(`
      SELECT * FROM products WHERE id = ?
    `).get(product.id);
    
    // Aktualizuj dane produktu
    const updateProductStmt = db.prepare(`
      UPDATE products 
      SET name = ?,
          description = ?,
          unit_price = ?
      WHERE id = ?
    `);
    
    const result = updateProductStmt.run(
      product.name,
      product.description,
      product.unitPrice,
      product.id
    );
    
    // Obsługa zmiany ilości
    if (product.quantity !== currentProduct.quantity) {
      // Jeśli ilość się zwiększyła, dodaj nowe elementy
      if (product.quantity > currentProduct.quantity) {
        const diff = product.quantity - currentProduct.quantity;
        const addItemsStmt = db.prepare(`
          INSERT INTO product_items (product_id, status)
          VALUES (?, 'na magazynie')
        `);
        
        for (let i = 0; i < diff; i++) {
          addItemsStmt.run(product.id);
        }
      } 
      // Jeśli ilość się zmniejszyła, usuń elementy
      else if (product.quantity < currentProduct.quantity) {
        const diff = currentProduct.quantity - product.quantity;
        
        // Najpierw znajdź elementy, które są na magazynie
        const inStockItems = db.prepare(`
          SELECT id FROM product_items 
          WHERE product_id = ? AND status = 'na magazynie'
          LIMIT ?
        `).all(product.id, diff);
        
        // Usuń znalezione elementy
        if (inStockItems.length > 0) {
          const deleteItemStmt = db.prepare(`
            DELETE FROM product_items WHERE id = ?
          `);
          
          inStockItems.forEach(item => {
            deleteItemStmt.run(item.id);
          });
        }
      }
    }
    
    // Zaktualizuj pole quantity w products (dla zachowania kompatybilności)
    db.prepare(`
      UPDATE products SET quantity = ?
      WHERE id = ?
    `).run(product.quantity, product.id);
    
    return result.changes;
  });
  
  return transaction();
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
        
        // Wstaw pozycje faktury
        const itemStmt = db.prepare(`
            INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        // Aktualizuj ilość oryginalnego produktu
        const updateProductStmt = db.prepare(`
            UPDATE products 
            SET quantity = quantity - ?
            WHERE id = ?
        `);
        
        // Znajdź elementy produktu, które są na magazynie
        const getAvailableItemsStmt = db.prepare(`
            SELECT id FROM product_items 
            WHERE product_id = ? AND status = 'na magazynie' 
            LIMIT ?
        `);
        
        // Aktualizuj status elementów produktu
        const updateItemStmt = db.prepare(`
            UPDATE product_items 
            SET status = 'fakturowany',
                invoice_date = datetime('now'),
                invoice_id = ?
            WHERE id = ?
        `);

        items.forEach(item => {
            // Dodaj pozycję do faktury
            itemStmt.run(
                invoiceId,
                item.product_id,
                item.quantity,
                item.unit_price,
                item.quantity * item.unit_price
            );
            
            // Zmniejsz ilość oryginalnego produktu
            updateProductStmt.run(
                item.quantity,
                item.product_id
            );
            
            // Znajdź dostępne elementy produktu
            const availableItems = getAvailableItemsStmt.all(item.product_id, item.quantity);
            
            // Zaktualizuj status każdego elementu
            availableItems.forEach(availableItem => {
                updateItemStmt.run(
                    invoiceId,
                    availableItem.id
                );
            });
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

// Endpoint do czyszczenia bazy danych
ipcMain.handle('clear-database', () => {
    try {
        clearDatabase();
        return { success: true, message: 'Baza danych została wyczyszczona' };
    } catch (error) {
        return { success: false, message: 'Błąd podczas czyszczenia bazy danych: ' + error.message };
    }
}); 