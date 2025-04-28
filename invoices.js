const { ipcRenderer } = require('electron');

let products = [];

// Funkcja do ładowania produktów
async function loadProducts() {
    products = await ipcRenderer.invoke('get-products');
    updateProductSelects();
}

// Funkcja do aktualizacji selectów z produktami
function updateProductSelects() {
    const selects = document.querySelectorAll('.product-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Wybierz produkt</option>';
        
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.name} (Dostępne: ${product.quantity})`;
            select.appendChild(option);
        });
        
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// Funkcja do obliczania sumy faktury
function calculateTotal() {
    let total = 0;
    document.querySelectorAll('.invoice-item').forEach(item => {
        const quantity = parseFloat(item.querySelector('.quantity').value) || 0;
        const unitPrice = parseFloat(item.querySelector('.unit-price').value) || 0;
        total += quantity * unitPrice;
    });
    document.getElementById('totalAmount').textContent = total.toFixed(2);
}

// Dodaj obsługę zdarzeń dla istniejących elementów
document.querySelectorAll('.invoice-item').forEach(attachItemEvents);

// Obsługa dodawania nowego produktu do faktury
document.getElementById('addItemBtn').addEventListener('click', addNewItem);

// Funkcja do aktualizacji ceny jednostkowej po wybraniu produktu
function updateUnitPrice(event) {
    const select = event.target;
    const productId = select.value;
    const product = products.find(p => p.id === parseInt(productId));
    if (product) {
        const unitPriceInput = select.parentElement.parentElement.querySelector('.unit-price');
        unitPriceInput.value = product.unit_price;
        calculateTotal();
    }
}

// Obsługa formularza faktury
document.getElementById('invoiceFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const items = Array.from(document.querySelectorAll('.invoice-item')).map(item => ({
        product_id: parseInt(item.querySelector('.product-select').value),
        quantity: parseInt(item.querySelector('.quantity').value),
        unit_price: parseFloat(item.querySelector('.unit-price').value)
    }));
    
    const invoiceData = {
        customer_name: document.getElementById('customerName').value,
        issue_date: document.getElementById('issueDate').value,
        due_date: document.getElementById('dueDate').value,
        items: items
    };
    
    try {
        const result = await ipcRenderer.invoke('create-invoice', invoiceData);
        if (result.success) {
            alert('Faktura została utworzona pomyślnie!');
            document.getElementById('invoiceForm').style.display = 'none';
            loadInvoices();
        }
    } catch (error) {
        alert('Wystąpił błąd podczas tworzenia faktury: ' + error.message);
    }
});

// Funkcja do ładowania listy faktur
async function loadInvoices() {
    const invoices = await ipcRenderer.invoke('get-invoices');
    const tbody = document.getElementById('invoicesTableBody');
    tbody.innerHTML = '';
    
    invoices.forEach(invoice => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${invoice.invoice_number}</td>
            <td>${invoice.customer_name}</td>
            <td>${invoice.issue_date}</td>
            <td>${invoice.due_date || '-'}</td>
            <td>${invoice.total_amount.toFixed(2)} zł</td>
            <td>${invoice.status}</td>
            <td>
                <button class="btn btn-info" onclick="viewInvoice(${invoice.id})">Szczegóły</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Funkcja do wyświetlania szczegółów faktury
async function viewInvoice(invoiceId) {
    try {
        const { invoice, items } = await ipcRenderer.invoke('get-invoice-details', invoiceId);
        
        // Wypełnianie danych faktury w oknie modalnym
        document.getElementById('invoiceNumber').textContent = invoice.invoice_number;
        document.getElementById('invoiceCustomer').textContent = invoice.customer_name;
        document.getElementById('invoiceIssueDate').textContent = invoice.issue_date;
        document.getElementById('invoiceDueDate').textContent = invoice.due_date || '-';
        
        const statusElement = document.getElementById('invoiceStatus');
        statusElement.textContent = invoice.status;
        if (invoice.status === 'paid') {
            statusElement.classList.add('bg-success');
        } else if (invoice.status === 'draft') {
            statusElement.classList.add('bg-warning');
        } else {
            statusElement.classList.add('bg-primary');
        }
        
        // Wypełnianie tabeli z pozycjami faktury
        const itemsTableBody = document.getElementById('invoiceItemsTable');
        itemsTableBody.innerHTML = '';
        
        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.product_name}</td>
                <td>${item.quantity}</td>
                <td>${item.unit_price.toFixed(2)} zł</td>
                <td>${item.total_price.toFixed(2)} zł</td>
            `;
            itemsTableBody.appendChild(row);
        });
        
        document.getElementById('invoiceTotalAmount').textContent = `${invoice.total_amount.toFixed(2)} zł`;
        
        // Wypełnianie danych do wydruku
        document.getElementById('printInvoiceNumber').textContent = invoice.invoice_number;
        document.getElementById('printCustomer').textContent = invoice.customer_name;
        document.getElementById('printIssueDate').textContent = invoice.issue_date;
        document.getElementById('printDueDate').textContent = invoice.due_date || '-';
        
        const printItemsTable = document.getElementById('printItemsTable');
        printItemsTable.innerHTML = '';
        
        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.product_name}</td>
                <td>${item.quantity}</td>
                <td>${item.unit_price.toFixed(2)} zł</td>
                <td>${item.total_price.toFixed(2)} zł</td>
            `;
            printItemsTable.appendChild(row);
        });
        
        document.getElementById('printTotalAmount').textContent = invoice.total_amount.toFixed(2);
        
        // Wyświetlanie okna modalnego
        const modal = new bootstrap.Modal(document.getElementById('invoiceDetailsModal'));
        modal.show();
    } catch (error) {
        alert('Wystąpił błąd podczas pobierania danych faktury: ' + error.message);
    }
}

// Obsługa przycisków
document.getElementById('newInvoiceBtn').addEventListener('click', () => {
    document.getElementById('invoiceForm').style.display = 'block';
    document.getElementById('invoiceFormElement').reset();
    document.getElementById('issueDate').valueAsDate = new Date();
    calculateTotal();
});

document.getElementById('cancelInvoiceBtn').addEventListener('click', () => {
    document.getElementById('invoiceForm').style.display = 'none';
});

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    loadInvoices();
    
    // Dodanie obsługi przycisku drukowania
    document.getElementById('printInvoiceBtn').addEventListener('click', printInvoice);
});

// Funkcja do drukowania faktury
function printInvoice() {
    const printContent = document.getElementById('printTemplate').innerHTML;
    const originalContent = document.body.innerHTML;
    
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    
    // Odtwórz zdarzenia po przywróceniu oryginalnej treści
    loadProducts();
    loadInvoices();
    
    // Inicjalizacja Bootstrap na nowo
    document.getElementById('newInvoiceBtn').addEventListener('click', () => {
        document.getElementById('invoiceForm').style.display = 'block';
        document.getElementById('invoiceFormElement').reset();
        document.getElementById('issueDate').valueAsDate = new Date();
        calculateTotal();
    });
    
    document.getElementById('cancelInvoiceBtn').addEventListener('click', () => {
        document.getElementById('invoiceForm').style.display = 'none';
    });
    
    document.getElementById('addItemBtn').addEventListener('click', addNewItem);
    document.getElementById('printInvoiceBtn').addEventListener('click', printInvoice);
    
    document.querySelectorAll('.invoice-item').forEach(attachItemEvents);
}

// Funkcja pomocnicza do dodawania nowego elementu (zaktualizowana wersja)
function addNewItem() {
    const itemsContainer = document.getElementById('invoiceItems');
    const newItem = document.createElement('div');
    newItem.className = 'invoice-item';
    newItem.innerHTML = `
        <div class="row">
            <div class="col-md-4">
                <select class="form-select product-select" required>
                    <option value="">Wybierz produkt</option>
                </select>
            </div>
            <div class="col-md-2">
                <input type="number" class="form-control quantity" min="1" value="1" required>
            </div>
            <div class="col-md-2">
                <input type="number" class="form-control unit-price" step="0.01" required>
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger remove-item">Usuń</button>
            </div>
        </div>
    `;
    itemsContainer.appendChild(newItem);
    updateProductSelects();
    attachItemEvents(newItem);
}

// Funkcja do dołączania zdarzeń do elementów faktury
function attachItemEvents(item) {
    item.querySelector('.product-select').addEventListener('change', updateUnitPrice);
    item.querySelector('.quantity').addEventListener('input', calculateTotal);
    item.querySelector('.unit-price').addEventListener('input', calculateTotal);
    item.querySelector('.remove-item').addEventListener('click', () => {
        item.remove();
        calculateTotal();
    });
} 