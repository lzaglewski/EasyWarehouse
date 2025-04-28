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
                <button class="btn btn-sm btn-primary edit-btn" data-id="${product.id}">
                    Edytuj
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Dodanie obsługi przycisków edycji
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            const product = products.find(p => p.id === id);
            
            if (!product) return;
            
            // Tworzenie formularza edycji
            const modal = document.createElement('div');
            modal.className = 'modal fade show';
            modal.style.display = 'block';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edytuj produkt</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editProductForm">
                                <div class="mb-3">
                                    <label class="form-label">Nazwa</label>
                                    <input type="text" class="form-control" id="editName" value="${product.name}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Opis</label>
                                    <input type="text" class="form-control" id="editDescription" value="${product.description || ''}">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Ilość</label>
                                    <input type="number" class="form-control" id="editQuantity" value="${product.quantity}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Cena</label>
                                    <input type="number" step="0.01" class="form-control" id="editPrice" value="${product.unit_price}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-control" id="editStatus" required>
                                        <option value="na magazynie" ${product.status === 'na magazynie' ? 'selected' : ''}>Na magazynie</option>
                                        <option value="sprzedany" ${product.status === 'sprzedany' ? 'selected' : ''}>Sprzedany</option>
                                        <option value="fakturowany" ${product.status === 'fakturowany' ? 'selected' : ''}>Fakturowany</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary cancel-edit">Anuluj</button>
                            <button type="button" class="btn btn-primary save-edit">Zapisz zmiany</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Obsługa przycisku zamknięcia modalu
            modal.querySelector('.btn-close').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            // Obsługa przycisku anulowania
            modal.querySelector('.cancel-edit').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            // Obsługa przycisku zapisywania
            modal.querySelector('.save-edit').addEventListener('click', async () => {
                const updatedProduct = {
                    id: product.id,
                    name: document.getElementById('editName').value,
                    description: document.getElementById('editDescription').value,
                    quantity: parseInt(document.getElementById('editQuantity').value),
                    unitPrice: parseFloat(document.getElementById('editPrice').value),
                    status: document.getElementById('editStatus').value
                };
                
                await ipcRenderer.invoke('edit-product', updatedProduct);
                document.body.removeChild(modal);
                refreshInvoicedList();
            });
        });
    });
}

// Inicjalizacja
refreshInvoicedList(); 