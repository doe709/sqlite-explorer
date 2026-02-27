// ============================================
// 🗄️ SQLite Explorer — Frontend Logic
// CRUD operations + auto-generated forms
// ============================================

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // ─── STATE ───
    let state = {
        dbName: '',
        tables: [],
        currentTable: '',
        currentColumns: [],
        currentRows: [],
        currentCount: 0,
        primaryKey: 'id',
        editingId: null // null = adding, number = editing
    };

    // ─── DOM ELEMENTS ───
    const $dbName = document.getElementById('dbName');
    const $tableList = document.getElementById('tableList');
    const $tableView = document.getElementById('tableView');
    const $currentTableName = document.getElementById('currentTableName');
    const $currentTableCount = document.getElementById('currentTableCount');
    const $dataContainer = document.getElementById('dataContainer');
    const $formModal = document.getElementById('formModal');
    const $formTitle = document.getElementById('formTitle');
    const $formBody = document.getElementById('formBody');
    const $confirmModal = document.getElementById('confirmModal');
    const $confirmText = document.getElementById('confirmText');
    const $toast = document.getElementById('toast');

    // ─── BUTTONS ───
    document.getElementById('btnOpenDb').addEventListener('click', () => {
        vscode.postMessage({ cmd: 'openDb' });
    });

    document.getElementById('btnBackToList').addEventListener('click', () => {
        showTableList();
    });

    document.getElementById('btnAdd').addEventListener('click', () => {
        openForm(null);
    });

    document.getElementById('btnRefresh').addEventListener('click', () => {
        if (state.currentTable) {
            vscode.postMessage({ cmd: 'getData', table: state.currentTable });
        }
    });

    // Form modal
    document.getElementById('btnCloseModal').addEventListener('click', closeForm);
    document.getElementById('btnCancelForm').addEventListener('click', closeForm);
    document.getElementById('btnSaveForm').addEventListener('click', saveForm);

    // Delete confirmation modal
    document.getElementById('btnCloseConfirm').addEventListener('click', closeConfirm);
    document.getElementById('btnConfirmNo').addEventListener('click', closeConfirm);

    // ─── RECEIVE MESSAGES FROM BACKEND ───
    window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
            case 'dbInfo':
                handleDbInfo(msg);
                break;
            case 'tableData':
                handleTableData(msg);
                break;
            case 'columns':
                handleColumns(msg);
                break;
            case 'success':
                showToast(msg.message, 'success');
                break;
            case 'error':
                showToast(msg.message, 'error');
                break;
        }
    });

    // ─── DATA HANDLERS ───
    function handleDbInfo(msg) {
        state.dbName = msg.dbName;
        state.tables = msg.tables;
        $dbName.textContent = msg.dbName;
        renderTableList();
    }

    function handleTableData(msg) {
        state.currentTable = msg.table;
        state.currentColumns = msg.columns;
        state.currentRows = msg.rows;
        state.currentCount = msg.count;
        // Determine PK
        const pkCol = msg.columns.find(c => c.pk === 1);
        state.primaryKey = pkCol ? pkCol.name : 'rowid';
        renderTableData();
    }

    function handleColumns(msg) {
        state.currentColumns = msg.columns;
        state.primaryKey = msg.primaryKey;
    }

    // ─── RENDER TABLE LIST ───
    function renderTableList() {
        if (state.tables.length === 0) {
            $tableList.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-database-slash" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 text-muted">No tables in database</p>
                </div>`;
            return;
        }

        $tableList.innerHTML = state.tables.map(t => `
            <div class="table-item" data-table="${escapeHtml(t.name)}">
                <span class="table-icon"><i class="bi bi-table"></i></span>
                <span class="table-name">${escapeHtml(t.name)}</span>
                <span class="table-count">${t.count} rows</span>
            </div>
        `).join('');

        // Click on table
        $tableList.querySelectorAll('.table-item').forEach(item => {
            item.addEventListener('click', () => {
                const tableName = item.getAttribute('data-table');
                openTable(tableName);
            });
        });
    }

    // ─── OPEN TABLE ───
    function openTable(tableName) {
        state.currentTable = tableName;
        $currentTableName.textContent = tableName;
        $tableList.style.display = 'none';
        $tableView.style.display = 'flex';
        document.querySelector('.toolbar').style.display = 'none';

        vscode.postMessage({ cmd: 'getData', table: tableName });
    }

    // ─── SHOW TABLE LIST ───
    function showTableList() {
        state.currentTable = '';
        $tableList.style.display = 'block';
        $tableView.style.display = 'none';
        document.querySelector('.toolbar').style.display = 'block';
    }

    // ─── RENDER TABLE DATA ───
    function renderTableData() {
        $currentTableName.textContent = state.currentTable;
        $currentTableCount.textContent = state.currentCount + ' rows';

        if (state.currentRows.length === 0) {
            $dataContainer.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-inbox" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 text-muted">Table is empty<br>Click ➕ Add</p>
                </div>`;
            return;
        }

        const cols = state.currentColumns;
        const pk = state.primaryKey;

        let html = '<table class="data-table">';

        // Header
        html += '<thead><tr>';
        cols.forEach(col => {
            const isPk = col.name === pk;
            html += `<th>${isPk ? '🔑 ' : ''}${escapeHtml(col.name)}</th>`;
        });
        html += '<th class="actions-col">⚡</th>';
        html += '</tr></thead>';

        // Rows
        html += '<tbody>';
        state.currentRows.forEach(row => {
            const rowId = row[pk];
            html += '<tr>';
            cols.forEach(col => {
                const val = row[col.name];
                const isPk = col.name === pk;
                const displayVal = val === null ? '<em style="opacity:0.4">NULL</em>' : escapeHtml(String(val));
                html += `<td class="${isPk ? 'pk-cell' : ''}">${displayVal}</td>`;
            });
            html += `<td class="actions-cell">
                <button class="row-action-btn edit-btn" data-id="${rowId}" title="✏️ Edit record #${rowId}">✏️</button>
                <button class="row-action-btn delete-btn" data-id="${rowId}" title="🗑️ Delete record #${rowId}">🗑️</button>
            </td>`;
            html += '</tr>';
        });
        html += '</tbody></table>';

        $dataContainer.innerHTML = html;

        // Row button handlers
        $dataContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = Number(e.currentTarget.getAttribute('data-id'));
                const row = state.currentRows.find(r => r[pk] === id);
                if (row) { openForm(row); }
            });
        });

        $dataContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = Number(e.currentTarget.getAttribute('data-id'));
                openConfirm(id);
            });
        });
    }

    // ─── FORM (Add / Edit) ───
    function openForm(rowData) {
        const isEdit = rowData !== null;
        state.editingId = isEdit ? rowData[state.primaryKey] : null;

        $formTitle.textContent = isEdit
            ? `✏️ Edit record #${state.editingId}`
            : '➕ Add record';

        // Generate form fields by columns
        let fieldsHtml = '';
        state.currentColumns.forEach(col => {
            // Skip autoincrement PK when adding
            if (!isEdit && col.pk === 1 && col.type.toUpperCase().includes('INTEGER')) {
                return;
            }
            // Don't edit PK
            if (isEdit && col.pk === 1) {
                return;
            }

            const value = isEdit ? (rowData[col.name] !== null ? rowData[col.name] : '') : '';
            const typeHint = col.type || 'TEXT';
            const inputType = getInputType(col.type);

            fieldsHtml += `
                <div class="form-group">
                    <label>${escapeHtml(col.name)} <span class="type-hint">(${typeHint}${col.notnull ? ', NOT NULL' : ''})</span></label>
                    <input class="form-control" 
                           name="${escapeHtml(col.name)}" 
                           type="${inputType}" 
                           value="${escapeHtml(String(value))}"
                           placeholder="${escapeHtml(col.name)}..."
                           ${col.notnull && !col.pk ? 'required' : ''}>
                </div>`;
        });

        $formBody.innerHTML = fieldsHtml;
        $formModal.style.display = 'flex';

        // Focus on first field
        const firstInput = $formBody.querySelector('input');
        if (firstInput) { firstInput.focus(); }
    }

    function closeForm() {
        $formModal.style.display = 'none';
        state.editingId = null;
    }

    function saveForm() {
        const inputs = $formBody.querySelectorAll('input');
        const data = {};

        let hasError = false;
        inputs.forEach(input => {
            const name = input.getAttribute('name');
            let value = input.value.trim();

            // Check required
            if (input.required && !value) {
                input.style.borderColor = '#dc3545';
                hasError = true;
                return;
            }

            // Type conversion
            if (input.type === 'number' && value !== '') {
                value = value.includes('.') ? parseFloat(value) : parseInt(value, 10);
            }

            data[name] = value === '' ? null : value;
        });

        if (hasError) {
            showToast('❌ Please fill in required fields!', 'error');
            return;
        }

        if (state.editingId !== null) {
            // Update
            vscode.postMessage({
                cmd: 'update',
                table: state.currentTable,
                id: state.editingId,
                data: data
            });
        } else {
            // Add
            vscode.postMessage({
                cmd: 'insert',
                table: state.currentTable,
                data: data
            });
        }

        closeForm();
    }

    // ─── DELETE CONFIRMATION ───
    let deleteTargetId = null;

    function openConfirm(id) {
        deleteTargetId = id;
        $confirmText.textContent = `Delete record #${id} from table "${state.currentTable}"?`;
        $confirmModal.style.display = 'flex';
    }

    function closeConfirm() {
        $confirmModal.style.display = 'none';
        deleteTargetId = null;
    }

    document.getElementById('btnConfirmYes').addEventListener('click', () => {
        if (deleteTargetId !== null) {
            vscode.postMessage({
                cmd: 'delete',
                table: state.currentTable,
                id: deleteTargetId
            });
        }
        closeConfirm();
    });

    // ─── NOTIFICATIONS ───
    function showToast(message, type) {
        $toast.textContent = message;
        $toast.className = 'toast-message ' + type;
        $toast.style.display = 'block';

        setTimeout(() => {
            $toast.style.display = 'none';
        }, 3000);
    }

    // ─── UTILITIES ───
    function escapeHtml(text) {
        if (text === null || text === undefined) { return ''; }
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function getInputType(sqlType) {
        if (!sqlType) { return 'text'; }
        const t = sqlType.toUpperCase();
        if (t.includes('INT')) { return 'number'; }
        if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC')) { return 'number'; }
        return 'text';
    }

    // ─── KEYBOARD SHORTCUTS ───
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if ($formModal.style.display !== 'none') { closeForm(); }
            if ($confirmModal.style.display !== 'none') { closeConfirm(); }
        }
        // Enter to save form
        if (e.key === 'Enter' && $formModal.style.display !== 'none') {
            e.preventDefault();
            saveForm();
        }
    });

})();
