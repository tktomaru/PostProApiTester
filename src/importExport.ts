// importExport.ts
// ───────────────────────────────────────────────────────────────────────────────
// Import / Export 処理をまとめる

import type { Collection, RequestData, Scenario, Environment, AuthConfig } from './types';
import {
    saveCollectionsToStorage,
    saveVariablesToStorage,
    saveEnvironmentsToStorage,
    saveScenariosToStorage,
    state
} from './state';
import { renderCollectionsTree } from './collectionManager';
import { renderEnvironmentSelector, renderAllVariables, updateCollectionVarSelector } from './variableManager';
import { showSuccess, showError, renderAuthDetails, updateAuthData } from './utils';
import { 
    sampleTestScript, 
    sampleCollections, 
    sampleScenarios, 
    sampleGlobalVariables, 
    sampleEnvironments, 
    sampleEnvironmentVariables, 
    sampleCollectionVariables 
} from './defaultData';
import { addKeyValueRow, handleBodyTypeChange } from './utils';
import { renderScenarioList } from './scenarioManager';

interface PostmanVariable {
    key: string;
    value: string;
    description?: string;
    disabled?: boolean;
}

interface PostmanAuth {
    type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2';
    basic?: Array<{ key: string; value: string }>;
    bearer?: Array<{ key: string; value: string }>;
    apikey?: Array<{ key: string; value: string }>;
}

interface PostmanHeader {
    key: string;
    value: string;
    disabled?: boolean;
}

interface PostmanQuery {
    key: string;
    value: string;
    disabled?: boolean;
}

interface PostmanBody {
    mode: string;
    raw?: string;
    formdata?: Array<{ key: string; value: string; disabled?: boolean }>;
}

interface PostmanUrl {
    raw?: string;
    query?: PostmanQuery[];
}

interface PostmanRequest {
    method: string;
    url: string | PostmanUrl;
    header?: PostmanHeader[];
    body?: PostmanBody;
    auth?: PostmanAuth;
}

interface PostmanItem {
    name?: string;
    request?: PostmanRequest;
    item?: PostmanItem[];
}

interface PostmanCollection {
    info?: {
        name?: string;
        description?: string;
    };
    item?: PostmanItem[];
    variable?: PostmanVariable[];
}

interface TalendEntity {
    id: string;
    name: string;
    type: string;
    method?: { name: string };
    uri?: { path: string };
    headers?: Array<{ name: string; value: string; enabled: boolean }>;
    body?: { textBody?: string };
}

interface TalendChild {
    entity: TalendEntity;
    children?: TalendChild[];
}

interface TalendEnvironment {
    id: string;
    name: string;
    variables?: Record<string, {
        name: string;
        value: string;
        enabled: boolean;
        createdAt?: string;
    }>;
}

interface TalendData {
    entities: Array<{ entity: TalendEntity; children?: TalendChild[] }>;
    environments?: TalendEnvironment[];
}

interface OpenApiInfo {
    title?: string;
    description?: string;
}

interface OpenApiParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    example?: any;
}

interface OpenApiRequestBody {
    content?: {
        'application/json'?: {
            example?: any;
            schema?: { example?: any };
        };
    };
}

interface OpenApiOperation {
    summary?: string;
    description?: string;
    parameters?: OpenApiParameter[];
    requestBody?: OpenApiRequestBody;
}

interface OpenApiPath {
    [method: string]: OpenApiOperation;
}

interface OpenApiSpec {
    info?: OpenApiInfo;
    servers?: Array<{ url: string }>;
    paths?: Record<string, OpenApiPath>;
}

interface HarHeader {
    name: string;
    value: string;
}

interface HarQueryString {
    name: string;
    value: string;
}

interface HarPostData {
    text?: string;
}

interface HarRequest {
    method: string;
    url: string;
    headers?: HarHeader[];
    queryString?: HarQueryString[];
    postData?: HarPostData;
}

interface HarEntry {
    request?: HarRequest;
}

interface HarData {
    log?: {
        entries?: HarEntry[];
    };
}

interface ExportData {
    version: string;
    exportDate: string;
    collections: Collection[];
    variables: {
        global: Record<string, any>;
        collection: Record<string, any>;
    };
    environments: Environment[];
    currentEnvironment: string | null;
    history: any[];
}

/** initializeTestScript：ページ上にある TestScript 欄にサンプルを反映 */
export function initializeTestScript(): void {
    const testTextarea = document.getElementById('testScript') as HTMLTextAreaElement;
    if (testTextarea && !testTextarea.value.trim()) {
        testTextarea.value = sampleTestScript;
    }
}

/** openImportModal */
export function openImportModal(): void {
    const modal = document.getElementById('importExportModal') as HTMLElement;
    const title = document.getElementById('modalTitle') as HTMLElement;
    modal.classList.add('active');
    title.textContent = 'Import Data';
}

/** handleFileSelect */
export function handleFileSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const importText = document.getElementById('importText') as HTMLTextAreaElement;
        importText.value = e.target?.result as string;
    };
    reader.readAsText(file);
}

/** handleImport */
export async function handleImport(): Promise<void> {
    const importTypeSelect = document.getElementById('importType') as HTMLSelectElement;
    const importTextarea = document.getElementById('importText') as HTMLTextAreaElement;
    const importType = importTypeSelect.value;
    const importText = importTextarea.value.trim();

    if (!importText && importType !== 'sample') {
        showError('Please select a file or paste content to import');
        return;
    }

    try {
        let data: any;
        if (importType !== 'sample') {
            try {
                data = JSON.parse(importText);
            } catch (e) {
                if (importType === 'curl') {
                    data = parseCurlCommand(importText);
                } else {
                    throw new Error('Invalid JSON format');
                }
            }
        }

        switch (importType) {
            case 'postman':
                await importPostmanCollection(data);
                break;
            case 'apitester':
                await importApiTesterData(data);
                break;
            case 'openapi':
                await importOpenApiSpec(data);
                break;
            case 'har':
                await importHarFile(data);
                break;
            case 'curl':
                importCurlCommand(data);
                break;
            case 'talentedapitester':
                await importTalendData(data);
                break;
            case 'sample':
                await importSampleData();
                break;
        }

        const modal = document.getElementById('importExportModal') as HTMLElement;
        modal.classList.remove('active');
        showSuccess('Import completed successfully');
    } catch (error: any) {
        showError('Import failed: ' + error.message);
    }
}

function convertPostmanAuth(postmanAuth: PostmanAuth): AuthConfig {
    const auth: AuthConfig = { type: postmanAuth.type || 'none' };

    switch (postmanAuth.type) {
        case 'basic':
            const basicAuth = postmanAuth.basic?.reduce((acc: Record<string, string>, item) => {
                acc[item.key] = item.value;
                return acc;
            }, {});
            auth.username = basicAuth?.username || '';
            auth.password = basicAuth?.password || '';
            break;

        case 'bearer':
            const bearerAuth = postmanAuth.bearer?.reduce((acc: Record<string, string>, item) => {
                acc[item.key] = item.value;
                return acc;
            }, {});
            auth.token = bearerAuth?.token || '';
            break;

        case 'apikey':
            const apikeyAuth = postmanAuth.apikey?.reduce((acc: Record<string, string>, item) => {
                acc[item.key] = item.value;
                return acc;
            }, {});
            auth.key = apikeyAuth?.key || '';
            auth.value = apikeyAuth?.value || '';
            auth.addTo = apikeyAuth?.in === 'query' ? 'query' : 'header';
            break;
    }

    return auth;
}

function extractPostmanRequests(items: PostmanItem[], folder: string = ''): RequestData[] {
    const requests: RequestData[] = [];

    items.forEach(item => {
        if (item.request) {
            const request: RequestData = {
                id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                name: item.name || 'Untitled Request',
                method: item.request.method || 'GET',
                url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '',
                headers: {},
                params: {},
                body: null,
                bodyType: "none",
                auth: { type: 'none' },
                preRequestScript: ""
            };

            // Extract headers
            if (item.request.header) {
                item.request.header.forEach(header => {
                    if (!header.disabled) {
                        request.headers[header.key] = header.value;
                    }
                });
            }

            // Extract query parameters
            if (typeof item.request.url === 'object' && item.request.url.query) {
                item.request.url.query.forEach(param => {
                    if (!param.disabled) {
                        request.params[param.key] = param.value;
                    }
                });
            }

            // Extract body
            if (item.request.body) {
                switch (item.request.body.mode) {
                    case 'raw':
                        request.body = item.request.body.raw || null;
                        break;
                    case 'formdata':
                        const formData: Record<string, string> = {};
                        item.request.body.formdata?.forEach(field => {
                            if (!field.disabled) {
                                formData[field.key] = field.value;
                            }
                        });
                        request.body = formData;
                        break;
                }
            }

            // Extract auth
            if (item.request.auth) {
                request.auth = convertPostmanAuth(item.request.auth);
            }

            requests.push(request);
        } else if (item.item) {
            // Folder with sub-items
            const folderName = folder ? `${folder}/${item.name}` : item.name || '';
            requests.push(...extractPostmanRequests(item.item, folderName));
        }
    });

    return requests;
}

/** importPostmanCollection */
async function importPostmanCollection(data: PostmanCollection): Promise<void> {
    const collection: Collection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: data.info?.name || 'Imported Collection',
        requests: []
    };

    if (data.item) {
        collection.requests = extractPostmanRequests(data.item);
    }

    // 変数読み込み
    if (data.variable) {
        data.variable.forEach(v => {
            if (v.key && !v.disabled) {
                (state as any).variables.global[v.key] = { value: v.value || '', description: v.description || '' };
            }
        });
        await saveVariablesToStorage();
    }

    state.collections.push(collection);
    await saveCollectionsToStorage();

    updateCollectionVarSelector();
    renderCollectionsTree();
}

/**
 * importTalendData（修正版）
 *  - service → state.collections に追加
 *  - scenario → state.scenarios に追加
 *  - environment → state.environments に追加し、同時に state.variables.environment にも格納
 */
export async function importTalendData(talend: TalendData): Promise<void> {
    // ① Project ノードを探す
    const projectNode = talend.entities.find(e => e.entity.type === 'Project');
    if (!projectNode) {
        throw new Error('Talend JSON に Project が見つかりません');
    }

    const projectChildren = projectNode.children || [];

    // 追加用バッファ
    const collectionsToAdd: Collection[] = [];
    const scenariosToAdd: Scenario[] = [];
    const environmentsToAdd: Environment[] = [];

    // ② 各 Service/Scenario をパースして配列を作成
    projectChildren.forEach(child => {
        const { entity, children } = child;

        // ──────────────
        // (A) Service → Collections にマッピング
        // ──────────────
        if (entity.type === 'Service') {
            const svc = entity;
            const requests: RequestData[] = (children || [])
                .filter(r => r.entity.type === 'Request')
                .map(rNode => {
                    const e = rNode.entity;
                    return {
                        id: e.id,
                        name: e.name,
                        method: e.method?.name || 'GET',
                        url: e.uri?.path || '',
                        headers: (e.headers || [])
                            .filter(h => h.enabled)
                            .reduce((acc: Record<string, string>, h) => {
                                acc[h.name] = h.value;
                                return acc;
                            }, {}),
                        params: {},
                        body: (e.body && e.body.textBody) || null,
                        bodyType: "none",
                        auth: { type: 'none' },
                        preRequestScript: ""
                    };
                });

            collectionsToAdd.push({
                id: svc.id,
                name: svc.name,
                requests
            });
        }

        // ──────────────
        // (B) Scenario → Scenarios にマッピング
        // ──────────────
        else if (entity.type === 'Scenario') {
            const sce = entity;
            const scenarioRequests: RequestData[] = (children || [])
                .filter(r => r.entity.type === 'Request')
                .map(rNode => {
                    const e = rNode.entity;
                    return {
                        id: e.id,
                        name: e.name,
                        method: e.method?.name || 'GET',
                        url: e.uri?.path || '',
                        headers: (e.headers || [])
                            .filter(h => h.enabled)
                            .reduce((acc: Record<string, string>, h) => {
                                acc[h.name] = h.value;
                                return acc;
                            }, {}),
                        params: {},
                        body: (e.body && e.body.textBody) || null,
                        bodyType: "none",
                        auth: { type: 'none' },
                        preRequestScript: ""
                    };
                });

            scenariosToAdd.push({
                id: sce.id,
                name: sce.name,
                requests: scenarioRequests
            });
        }
    });

    // ③ Talend environments 配列をパースして { id, name, variables } の形にマッピング
    const talendEnvs = talend.environments || [];
    talendEnvs.forEach(envNode => {
        const e = envNode;
        // e.variables は { uuid: { createdAt, name, value, enabled, ... }, ... } という構造
        const vars: Record<string, { value: string; description: string }> = {};
        Object.values(e.variables || {}).forEach(v => {
            if (v.enabled) {
                vars[v.name] = {
                    value: v.value,
                    description: '' // 説明がなければ空文字
                };
            }
        });
        environmentsToAdd.push({
            id: e.id,
            name: e.name,
            variables: vars,
            created: new Date().toISOString()
        });
    });

    // ─────────────────────────────────────────────────────────────
    // ④ state.collections に Collections を追加し、ストレージ保存
    if (collectionsToAdd.length > 0) {
        state.collections.push(...collectionsToAdd);
        await saveCollectionsToStorage();
    }

    // ⑤ state.scenarios に Scenarios を追加し、ストレージ保存
    if (!Array.isArray(state.scenarios)) {
        state.scenarios = [];
    }
    if (scenariosToAdd.length > 0) {
        state.scenarios.push(...scenariosToAdd);
        await saveScenariosToStorage();
    }

    // ⑥ state.environments と state.variables.environment に環境変数を追加
    if (!Array.isArray(state.environments)) {
        state.environments = [];
    }
    if (!(state as any).variables.environment) {
        (state as any).variables.environment = {};
    }

    for (const envObj of environmentsToAdd) {
        // (1) state.environments に追加
        state.environments.push({
            id: envObj.id,
            name: envObj.name,
            variables: { ...envObj.variables },
            created: envObj.created
        });

        // (2) state.variables.environment[env.id] に変数オブジェクトを追加
        (state as any).variables.environment[envObj.id] = envObj.variables;
        await chrome.storage.local.set({ [`env_${envObj.id}`]: envObj.variables });
    }

    if (environmentsToAdd.length > 0) {
        // 環境一覧と変数ストレージの両方を更新
        await saveEnvironmentsToStorage();
        await saveVariablesToStorage();
    }
    // ─────────────────────────────────────────────────────────────

    // ⑦ 画面表示を更新
    updateCollectionVarSelector();
    renderEnvironmentSelector();
    renderAllVariables();
    renderCollectionsTree();
    renderScenarioList(); // シナリオ一覧を再描画する関数
}

/** importApiTesterData */
async function importApiTesterData(data: any): Promise<void> {
    if (data.collections) {
        state.collections.push(...data.collections);
    }
    if (data.variables) {
        Object.assign((state as any).variables.global, data.variables.global || {});
        Object.assign((state as any).variables.collection, data.variables.collection || {});
    }
    if (data.environments) {
        state.environments.push(...data.environments);
    }

    await saveCollectionsToStorage();
    await saveVariablesToStorage();
    await saveEnvironmentsToStorage();

    renderEnvironmentSelector();
    updateCollectionVarSelector();
    renderAllVariables();
    renderCollectionsTree();
}

function getOpenApiBaseUrl(data: OpenApiSpec): string {
    if (data.servers && data.servers.length > 0) {
        return data.servers[0].url;
    }
    return '';
}

/** importOpenApiSpec */
async function importOpenApiSpec(data: OpenApiSpec): Promise<void> {
    const collection: Collection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: data.info?.title || 'OpenAPI Import',
        requests: []
    };
    const baseUrl = getOpenApiBaseUrl(data);

    if (data.paths) {
        Object.entries(data.paths).forEach(([path, pathItem]) => {
            Object.entries(pathItem).forEach(([method, operation]) => {
                if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
                    const request: RequestData = {
                        id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                        name: operation.summary || `${method.toUpperCase()} ${path}`,
                        method: method.toUpperCase(),
                        url: baseUrl + path,
                        headers: {},
                        params: {},
                        body: null,
                        bodyType: "none",
                        auth: { type: 'none' },
                        preRequestScript: ""
                    };
                    // パラメータ抽出
                    if (operation.parameters) {
                        operation.parameters.forEach(param => {
                            if (param.in === 'query') {
                                request.params[param.name] = param.example || '';
                            } else if (param.in === 'header') {
                                request.headers[param.name] = param.example || '';
                            }
                        });
                    }
                    // リクエストボディ例
                    if (operation.requestBody?.content) {
                        const jsonContent = operation.requestBody.content['application/json'];
                        if (jsonContent?.example) {
                            request.body = JSON.stringify(jsonContent.example, null, 2);
                        } else if (jsonContent?.schema?.example) {
                            request.body = JSON.stringify(jsonContent.schema.example, null, 2);
                        }
                    }
                    collection.requests.push(request);
                }
            });
        });
    }

    state.collections.push(collection);
    await saveCollectionsToStorage();

    updateCollectionVarSelector();
    renderCollectionsTree();
}

/** importHarFile */
async function importHarFile(data: HarData): Promise<void> {
    const collection: Collection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: 'HAR Import - ' + new Date().toLocaleString(),
        requests: []
    };

    if (data.log && data.log.entries) {
        data.log.entries.forEach(entry => {
            const request = entry.request;
            if (request) {
                const importedRequest: RequestData = {
                    id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                    name: `${request.method} ${new URL(request.url).pathname}`,
                    method: request.method,
                    url: request.url,
                    headers: {},
                    params: {},
                    body: null,
                    bodyType: "none",
                    auth: { type: 'none' },
                    preRequestScript: ""
                };
                // ヘッダ抽出
                if (request.headers) {
                    request.headers.forEach(header => {
                        importedRequest.headers[header.name] = header.value;
                    });
                }
                // クエリパラメータ抽出
                if (request.queryString) {
                    request.queryString.forEach(param => {
                        importedRequest.params[param.name] = param.value;
                    });
                }
                // ボディ抽出
                if (request.postData) {
                    importedRequest.body = request.postData.text || null;
                }
                collection.requests.push(importedRequest);
            }
        });
    }

    state.collections.push(collection);
    await saveCollectionsToStorage();

    updateCollectionVarSelector();
    renderCollectionsTree();
}

/** parseCurlCommand */
export function parseCurlCommand(curlString: string): RequestData {
    const request: RequestData = {
        id: `curl_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: 'Curl Import',
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        bodyType: "none",
        auth: { type: 'none' },
        preRequestScript: ""
    };

    // 改行・余分なスペース除去
    const normalized = curlString.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();
    // URL 抽出
    const urlMatch = normalized.match(/curl\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (urlMatch) {
        request.url = urlMatch[1] || urlMatch[2] || urlMatch[3];
    }
    // メソッド抽出
    const methodMatch = normalized.match(/-X\s+(\w+)/);
    if (methodMatch) {
        request.method = methodMatch[1].toUpperCase();
    }
    // ヘッダ抽出
    const headerRegex = /-H\s+(?:'([^']+)'|"([^"]+)")/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(normalized))) {
        const header = headerMatch[1] || headerMatch[2];
        const [key, ...valueParts] = header.split(':');
        if (key && valueParts.length) {
            request.headers[key.trim()] = valueParts.join(':').trim();
        }
    }
    // データ抽出
    const dataMatch = normalized.match(/(?:-d|--data)\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (dataMatch) {
        request.body = dataMatch[1] || dataMatch[2] || dataMatch[3];
    }
    // Basic Auth 抽出
    const authMatch = normalized.match(/-u\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (authMatch) {
        const authString = authMatch[1] || authMatch[2] || authMatch[3];
        const [username, password] = authString.split(':');
        if (username) {
            request.auth = {
                type: 'basic',
                username: username,
                password: password || ''
            };
        }
    }
    return request;
}

/** importCurlCommand */
export function importCurlCommand(request: RequestData): void {
    //state.currentRequest を更新
    if (!state.currentRequest) {
        state.currentRequest = {
            id: '',
            name: '',
            method: 'GET',
            url: '',
            headers: {},
            params: {},
            body: null,
            bodyType: 'none',
            auth: { type: 'none' },
            preRequestScript: ''
        };
    }
    state.currentRequest.method = request.method;
    state.currentRequest.url = request.url;
    state.currentRequest.headers = { ...request.headers };
    state.currentRequest.params = {};
    state.currentRequest.body = request.body || null;
    state.currentRequest.auth = request.auth || { type: 'none' };

    // ヘッダをセット
    const headersContainer = document.getElementById('headersContainer') as HTMLElement;
    headersContainer.innerHTML = '';
    Object.entries(request.headers).forEach(([key, value]) => {
        addKeyValueRow(headersContainer, 'header');
        const rows = headersContainer.querySelectorAll('.key-value-row');
        const lastRow = rows[rows.length - 1] as HTMLElement;
        const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
        const valueInput = lastRow.querySelector('.value-input') as HTMLInputElement;
        keyInput.value = key;
        valueInput.value = value;
    });
    if (Object.keys(request.headers).length === 0) {
        addKeyValueRow(headersContainer, 'header');
    }

    // ボディをセット
    if (request.body) {
        const rawRadio = document.querySelector('input[name="bodyType"][value="raw"]') as HTMLInputElement;
        rawRadio.checked = true;
        handleBodyTypeChange({ target: { value: 'raw' } } as any);
        const rawBody = document.getElementById('rawBody') as HTMLTextAreaElement;
        rawBody.value = request.body.toString();
    }

    // 認証をセット
    if (request.auth && request.auth.type !== 'none') {
        const authType = document.getElementById('authType') as HTMLSelectElement;
        authType.value = request.auth.type;
        renderAuthDetails(request.auth.type);
        updateAuthData();
    }

    const modal = document.getElementById('importExportModal') as HTMLElement;
    modal.classList.remove('active');
}

/** exportData */
export async function exportData(): Promise<void> {
    const dataToExport: ExportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        collections: state.collections,
        variables: {
            global: (state as any).variables.global,
            collection: (state as any).variables.collection
        },
        environments: state.environments,
        currentEnvironment: state.currentEnvironment,
        history: state.history.slice(0, 50)
    };

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-tester-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess('Data exported successfully');
}

/** importSampleData - サンプルデータのインポート */
export async function importSampleData(): Promise<void> {
    try {
        // 1. サンプルコレクションを追加
        const existingCollectionIds = state.collections.map(c => c.id);
        const newCollections = sampleCollections.filter(c => !existingCollectionIds.includes(c.id));
        if (newCollections.length > 0) {
            state.collections.push(...newCollections);
            await saveCollectionsToStorage();
        }

        // 2. サンプルシナリオを追加
        if (!Array.isArray(state.scenarios)) {
            state.scenarios = [];
        }
        const existingScenarioIds = state.scenarios.map(s => s.id);
        const newScenarios = sampleScenarios.filter(s => !existingScenarioIds.includes(s.id));
        if (newScenarios.length > 0) {
            state.scenarios.push(...newScenarios);
            await saveScenariosToStorage();
        }

        // 3. サンプルグローバル変数を追加
        if (!(state as any).variables) {
            (state as any).variables = { global: {}, collection: {}, environment: {} };
        }
        if (!(state as any).variables.global) {
            (state as any).variables.global = {};
        }
        Object.assign((state as any).variables.global, sampleGlobalVariables);

        // 4. サンプル環境を追加
        if (!Array.isArray(state.environments)) {
            state.environments = [];
        }
        const existingEnvIds = state.environments.map(e => e.id);
        const newEnvironments = sampleEnvironments.filter(e => !existingEnvIds.includes(e.id));
        if (newEnvironments.length > 0) {
            state.environments.push(...newEnvironments);
            await saveEnvironmentsToStorage();
        }

        // 5. サンプル環境変数を追加
        if (!(state as any).variables.environment) {
            (state as any).variables.environment = {};
        }
        Object.assign((state as any).variables.environment, sampleEnvironmentVariables);

        // 6. サンプルコレクション変数を追加
        if (!(state as any).variables.collection) {
            (state as any).variables.collection = {};
        }
        Object.assign((state as any).variables.collection, sampleCollectionVariables);

        // 変数保存
        await saveVariablesToStorage();

        // UI更新
        updateCollectionVarSelector();
        renderEnvironmentSelector();
        renderAllVariables();
        renderCollectionsTree();
        renderScenarioList();
        
        // サイドバーのシナリオツリーも更新
        const { renderScenariosTree } = await import('./collectionManager');
        renderScenariosTree();

        showSuccess('Sample data imported successfully');
    } catch (error: any) {
        showError('Failed to import sample data: ' + error.message);
    }
}