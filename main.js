const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Określenie ścieżki do bazy danych
let dbPath;
let isFirstRun = false;

// Zawsze używaj katalogu głównego aplikacji
dbPath = 'warehouse.db';
// Sprawdź, czy to pierwsze uruchomienie
isFirstRun = !fs.existsSync(dbPath);

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
    needs_restocking BOOLEAN DEFAULT 0,
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
    mainWindow.loadFile('products_in_stock.html');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'products_in_stock.html'));
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
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND needs_restocking = 1) as items_to_restock,
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
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND needs_restocking = 1) as items_to_restock,
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
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND needs_restocking = 1) as items_to_restock,
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

// Obsługa pobierania produktów do uzupełnienia
ipcMain.handle('get-products-to-restock', () => {
  const query = `
    SELECT p.*, 
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id) as total_items,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'na magazynie') as items_in_stock,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'sprzedany') as items_sold,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as items_invoiced,
           (SELECT COUNT(*) FROM product_items WHERE product_id = p.id AND needs_restocking = 1) as items_to_restock,
           (SELECT MAX(sale_date) FROM product_items WHERE product_id = p.id AND status IN ('sprzedany', 'fakturowany')) as last_sale_date,
           (SELECT MAX(invoice_date) FROM product_items WHERE product_id = p.id AND status = 'fakturowany') as last_invoice_date
    FROM products p
    WHERE EXISTS (
      SELECT 1 FROM product_items 
      WHERE product_id = p.id AND needs_restocking = 1
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
    
    // Sprawdź, czy po sprzedaży nie ma już więcej produktów tego typu na magazynie
    const remainingItemsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM product_items 
      WHERE product_id = ? AND status = 'na magazynie'
    `);
    
    const remainingItems = remainingItemsStmt.get(id);
    
    // Jeśli nie ma więcej produktów na magazynie, oznacz sprzedane jako potrzebujące uzupełnienia
    if (remainingItems.count === 0) {
      const markForRestockingStmt = db.prepare(`
        UPDATE product_items 
        SET needs_restocking = 1
        WHERE product_id = ? AND status = 'sprzedany'
      `);
      
      markForRestockingStmt.run(id);
    }
    
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
        
        // Sprawdź ilość dostępną na magazynie
        const checkAvailabilityStmt = db.prepare(`
            SELECT COUNT(*) as available_count FROM product_items 
            WHERE product_id = ? AND status = 'na magazynie'
        `);
        
        // Aktualizuj ilość oryginalnego produktu
        const updateProductStmt = db.prepare(`
            UPDATE products 
            SET quantity = 
                CASE
                    WHEN quantity - ? >= 0 THEN quantity - ?
                    ELSE 0
                END
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
        
        // Dodaj nowe elementy produktu do uzupełnienia
        const addRestockItemStmt = db.prepare(`
            INSERT INTO product_items (product_id, status, needs_restocking, invoice_id, invoice_date)
            VALUES (?, 'fakturowany', 1, ?, datetime('now'))
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
            
            // Sprawdź dostępną ilość
            const availabilityCheck = checkAvailabilityStmt.get(item.product_id);
            const availableCount = availabilityCheck.available_count;
            
            // Zmniejsz ilość oryginalnego produktu
            updateProductStmt.run(
                item.quantity,
                item.quantity,
                item.product_id
            );
            
            // Znajdź dostępne elementy produktu
            const availableItems = getAvailableItemsStmt.all(item.product_id, availableCount);
            
            // Zaktualizuj status każdego dostępnego elementu
            availableItems.forEach(availableItem => {
                updateItemStmt.run(
                    invoiceId,
                    availableItem.id
                );
            });
            
            // Jeśli brakuje produktów, dodaj elementy do uzupełnienia
            if (availableCount < item.quantity) {
                const missingCount = item.quantity - availableCount;
                
                // Dodaj brakujące elementy jako "fakturowany" i oznacz jako "do uzupełnienia"
                for (let i = 0; i < missingCount; i++) {
                    addRestockItemStmt.run(item.product_id, invoiceId);
                }
            }
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
        ORDER BY ii.id ASC
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

// Dodanie nowego endpointu do oznaczania produktów jako uzupełnionych
ipcMain.handle('mark-as-restocked', (event, productId) => {
  const transaction = db.transaction(() => {
    // Policz ile elementów wymaga uzupełnienia
    const countRestockItemsStmt = db.prepare(`
      SELECT COUNT(*) as count_to_restock FROM product_items
      WHERE product_id = ? AND needs_restocking = 1
    `);
    
    const countResult = countRestockItemsStmt.get(productId);
    const countToRestock = countResult.count_to_restock;
    
    // Oznacz wszystkie elementy produktu jako już uzupełnione
    const markAsRestockedStmt = db.prepare(`
      UPDATE product_items
      SET needs_restocking = 0
      WHERE product_id = ? AND needs_restocking = 1
    `);
    
    markAsRestockedStmt.run(productId);
    
    // Dodaj nowe elementy produktu na magazyn
    const addNewItemsStmt = db.prepare(`
      INSERT INTO product_items (product_id, status)
      VALUES (?, 'na magazynie')
    `);
    
    // Dodaj odpowiednią liczbę nowych elementów
    for (let i = 0; i < countToRestock; i++) {
      addNewItemsStmt.run(productId);
    }
    
    // Zaktualizuj ilość w głównej tabeli products
    const updateProductQuantityStmt = db.prepare(`
      UPDATE products
      SET quantity = quantity + ?
      WHERE id = ?
    `);
    
    updateProductQuantityStmt.run(countToRestock, productId);
    
    return countToRestock; // zwróć liczbę uzupełnionych elementów
  });
  
  return transaction();
}); 