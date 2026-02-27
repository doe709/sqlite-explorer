import * as vscode from 'vscode';
import * as path from 'path';
import { SqliteDB, setExtensionPath } from './db';

let currentDb: SqliteDB | null = null;

export function activate(context: vscode.ExtensionContext) {
    // Set extension path for sql.js WASM
    setExtensionPath(context.extensionPath);

    currentDb = new SqliteDB();

    // Register Sidebar WebviewProvider
    const provider = new SqliteExplorerProvider(context, currentDb);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('sqliteExplorer', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Command: Open DB from context menu
    context.subscriptions.push(
        vscode.commands.registerCommand('sqliteExplorer.openDb', async (uri?: vscode.Uri) => {
            if (!uri) {
                const files = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'SQLite Database': ['db', 'sqlite', 'sqlite3']
                    },
                    title: '🗄️ Select a database file'
                });
                if (!files || files.length === 0) { return; }
                uri = files[0];
            }

            try {
                await currentDb!.open(uri.fsPath);
                await vscode.commands.executeCommand('sqliteExplorer.focus');
                if (provider.currentView) {
                    provider.sendDbInfo();
                }
                vscode.window.showInformationMessage(`✅ Opened: ${currentDb!.getName()}`);
            } catch (err: any) {
                vscode.window.showErrorMessage(`❌ Error: ${err.message}`);
            }
        })
    );

    // Auto-open .db files when clicked in Explorer
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(async (doc: vscode.TextDocument) => {
            const ext = path.extname(doc.uri.fsPath).toLowerCase();
            if (['.db', '.sqlite', '.sqlite3'].includes(ext)) {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                await vscode.commands.executeCommand('sqliteExplorer.openDb', doc.uri);
            }
        })
    );

    // Close DB on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (currentDb) {
                currentDb.close();
            }
        }
    });
}

class SqliteExplorerProvider implements vscode.WebviewViewProvider {
    public currentView: vscode.WebviewView | undefined;
    
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly db: SqliteDB
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.currentView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this.getWebviewContent(webviewView.webview);

        // Handle messages from frontend
        webviewView.webview.onDidReceiveMessage(
            async (message: any) => {
                await this.handleMessage(message);
            },
            undefined,
            this.context.subscriptions
        );

        // If DB is already open — send data
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.db.isOpen()) {
                this.sendDbInfo();
            }
        });

        // If DB already open on init
        if (this.db.isOpen()) {
            setTimeout(() => this.sendDbInfo(), 300);
        }
    }

    /**
     * Send current DB info to webview
     */
    sendDbInfo(): void {
        if (!this.currentView) { return; }
        try {
            const tables = this.db.getTables();
            this.currentView.webview.postMessage({
                type: 'dbInfo',
                dbName: this.db.getName(),
                dbPath: this.db.getPath(),
                tables: tables
            });
        } catch (err: any) {
            this.postError(err.message);
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        try {
            switch (message.cmd) {
                case 'openDb': {
                    await vscode.commands.executeCommand('sqliteExplorer.openDb');
                    break;
                }
                case 'getTables': {
                    this.sendDbInfo();
                    break;
                }
                case 'getData': {
                    const data = this.db.getTableData(
                        message.table,
                        message.limit || 100,
                        message.offset || 0
                    );
                    this.currentView!.webview.postMessage({
                        type: 'tableData',
                        ...data
                    });
                    break;
                }
                case 'getColumns': {
                    const columns = this.db.getColumns(message.table);
                    const pk = this.db.getPrimaryKey(message.table);
                    this.currentView!.webview.postMessage({
                        type: 'columns',
                        table: message.table,
                        columns: columns,
                        primaryKey: pk
                    });
                    break;
                }
                case 'insert': {
                    const newId = this.db.insert(message.table, message.data);
                    this.currentView!.webview.postMessage({
                        type: 'success',
                        message: `✅ Record #${newId} added!`
                    });
                    // Refresh data
                    this.sendDbInfo();
                    const insertedData = this.db.getTableData(message.table);
                    this.currentView!.webview.postMessage({
                        type: 'tableData',
                        ...insertedData
                    });
                    break;
                }
                case 'update': {
                    this.db.update(message.table, message.id, message.data);
                    this.currentView!.webview.postMessage({
                        type: 'success',
                        message: `✅ Record #${message.id} updated!`
                    });
                    this.sendDbInfo();
                    const updatedData = this.db.getTableData(message.table);
                    this.currentView!.webview.postMessage({
                        type: 'tableData',
                        ...updatedData
                    });
                    break;
                }
                case 'delete': {
                    this.db.deleteRow(message.table, message.id);
                    this.currentView!.webview.postMessage({
                        type: 'success',
                        message: `🗑️ Record #${message.id} deleted!`
                    });
                    this.sendDbInfo();
                    const deletedData = this.db.getTableData(message.table);
                    this.currentView!.webview.postMessage({
                        type: 'tableData',
                        ...deletedData
                    });
                    break;
                }
                default:
                    console.warn('Unknown command:', message.cmd);
            }
        } catch (err: any) {
            this.postError(err.message);
        }
    }

    /**
     * Send error to webview
     */
    private postError(msg: string): void {
        if (this.currentView) {
            this.currentView.webview.postMessage({
                type: 'error',
                message: `❌ ${msg}`
            });
        }
    }

    /**
     * Generate webview HTML content
     */
    private getWebviewContent(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'style.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'app.js')
        );
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net;">
    <title>SQLite Explorer</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div id="app">
        <!-- HEADER -->
        <div class="header-bar">
            <h6 class="mb-0">🗄️ SQLite Explorer</h6>
            <span id="dbName" class="db-name">No database open</span>
        </div>

        <!-- TOOLBAR -->
        <div class="toolbar">
            <button id="btnOpenDb" class="btn btn-sm btn-primary w-100 mb-1" title="Open a database file">
                <i class="bi bi-folder-plus"></i> Open Database
            </button>
        </div>

        <!-- TABLE LIST -->
        <div id="tableList" class="table-list">
            <div class="empty-state">
                <i class="bi bi-database-slash" style="font-size: 2rem; opacity: 0.5;"></i>
                <p class="mt-2 text-muted">Open a .db file to get started</p>
            </div>
        </div>

        <!-- TABLE DATA -->
        <div id="tableView" class="table-view" style="display:none;">
            <div class="table-header">
                <button id="btnBackToList" class="btn btn-sm btn-outline-secondary" title="Back to table list">
                    <i class="bi bi-arrow-left"></i>
                </button>
                <span id="currentTableName" class="fw-bold ms-2">table</span>
                <span id="currentTableCount" class="badge bg-secondary ms-1">0</span>
            </div>
            <div class="table-actions mb-2">
                <button id="btnAdd" class="btn btn-sm btn-success" title="Add new record">
                    <i class="bi bi-plus-circle"></i> Add
                </button>
                <button id="btnRefresh" class="btn btn-sm btn-outline-info" title="Refresh table data">
                    <i class="bi bi-arrow-clockwise"></i> Refresh
                </button>
            </div>
            <div id="dataContainer" class="data-container"></div>
        </div>

        <!-- FORM MODAL -->
        <div id="formModal" class="modal-overlay" style="display:none;">
            <div class="modal-dialog-custom">
                <div class="modal-header-custom">
                    <h6 id="formTitle" class="mb-0">➕ Add Record</h6>
                    <button id="btnCloseModal" class="btn-close btn-close-white" title="Close"></button>
                </div>
                <div id="formBody" class="modal-body-custom"></div>
                <div class="modal-footer-custom">
                    <button id="btnCancelForm" class="btn btn-sm btn-secondary">Cancel</button>
                    <button id="btnSaveForm" class="btn btn-sm btn-primary">💾 Save</button>
                </div>
            </div>
        </div>

        <!-- DELETE CONFIRMATION -->
        <div id="confirmModal" class="modal-overlay" style="display:none;">
            <div class="modal-dialog-custom">
                <div class="modal-header-custom bg-danger">
                    <h6 class="mb-0">🗑️ Delete Record</h6>
                    <button id="btnCloseConfirm" class="btn-close btn-close-white" title="Close"></button>
                </div>
                <div class="modal-body-custom">
                    <p id="confirmText">Delete this record?</p>
                </div>
                <div class="modal-footer-custom">
                    <button id="btnConfirmNo" class="btn btn-sm btn-secondary">No</button>
                    <button id="btnConfirmYes" class="btn btn-sm btn-danger">🗑️ Yes, delete</button>
                </div>
            </div>
        </div>

        <!-- NOTIFICATIONS -->
        <div id="toast" class="toast-message" style="display:none;"></div>
    </div>

    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

/**
 * Generate unique nonce for CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function deactivate() {
    if (currentDb) {
        currentDb.close();
    }
}
