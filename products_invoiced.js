const { ipcRenderer } = require('electron');

// Funkcja do odświeżania listy produktów fakturowanych
async function refreshInvoicedList() {
    const products = await ipcRenderer.invoke('get-products-invoiced');
    const tbody = document.getElementById('invoicedList');
    tbody.innerHTML = '';

    products.forEach(product => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.description || ''}</td>
            <td>${product.items_invoiced}</td>
            <td>${product.unit_price.toFixed(2)} zł</td>
            <td class="status-fakturowany">fakturowany</td>
            <td>${product.last_invoice_date || '-'}</td>
            <td>

            </td>
        `;
        tbody.appendChild(tr);
    });


}

// Inicjalizacja
refreshInvoicedList(); 