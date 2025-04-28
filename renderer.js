const { ipcRenderer } = require('electron');

// Funkcja do odświeżania listy produktów
async function refreshProductsList() {
    const products = await ipcRenderer.invoke('get-products');
    const tbody = document.getElementById('productsList');
    tbody.innerHTML = '';

    products.forEach(product => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.description || ''}</td>
            <td>${product.quantity}</td>
            <td>${product.unit_price.toFixed(2)} zł</td>
            <td class="status-${product.status.replace(' ', '-')}">${product.status}</td>
            <td>${product.sale_date || '-'}</td>
            <td>${product.invoice_date || '-'}</td>
            <td>
                ${product.quantity > 0 ? `
                    <button class="btn btn-sm btn-warning sell-btn" data-id="${product.id}">
                        Sprzedaj
                    </button>
                ` : ''}
                ${product.status === 'sprzedany' ? `
                    <button class="btn btn-sm btn-info invoice-btn" data-id="${product.id}">
                        Fakturuj
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Dodanie obsługi przycisków sprzedaży
    document.querySelectorAll('.sell-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const quantity = prompt('Podaj ilość do sprzedaży:');
            if (quantity && !isNaN(quantity) && quantity > 0) {
                await ipcRenderer.invoke('sell-product', { id, quantity: parseInt(quantity) });
                refreshProductsList();
            }
        });
    });

    // Dodanie obsługi przycisków fakturowania
    document.querySelectorAll('.invoice-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            await ipcRenderer.invoke('invoice-product', id);
            refreshProductsList();
        });
    });
}

// Obsługa formularza dodawania produktu
document.getElementById('addProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const product = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDescription').value,
        quantity: parseInt(document.getElementById('productQuantity').value),
        unitPrice: parseFloat(document.getElementById('productPrice').value)
    };

    await ipcRenderer.invoke('add-product', product);
    
    // Wyczyść formularz
    e.target.reset();
    
    // Odśwież listę
    refreshProductsList();
});

// Inicjalizacja
refreshProductsList(); 