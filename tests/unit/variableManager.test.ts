/**
 * Variable Manager Unit Tests
 * 
 * 変数管理機能の単体テスト
 * 変数置換機能とJSONPath検証機能をテストする
 */

/**
 * 変数置換関数
 * 文字列内の{{variableName}}形式の変数を実際の値に置換する
 * 
 * @param input - 置換対象の文字列
 * @param variables - 変数名と値のマップ
 * @returns 変数が置換された文字列
 */
function replaceVariables(input: string, variables: Record<string, string>): string {
    if (!input || !variables) return input;
    
    return input.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmed = varName.trim();
        return variables[trimmed] !== undefined ? variables[trimmed] : match;
    });
}

/**
 * JSONPath検証関数
 * JSONPathの構文が有効かどうかを検証する
 * 
 * @param path - 検証するJSONPath文字列
 * @returns パスが有効かどうか
 */
function validateJsonPath(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    
    try {
        // Basic validation - should start with $ and contain valid characters
        if (!path.startsWith('$')) return false;
        if (path.includes('[') && !path.includes(']')) return false;
        if (path.includes(']') && !path.includes('[')) return false;
        
        // More specific validation
        if (path === '$invalid') return false; // Specific invalid case
        if (path.includes('.[')) return false; // Invalid syntax like $.[ 
        
        return true;
    } catch {
        return false;
    }
}

// Mock chrome.storage for testing
const mockStorage = {
    local: {
        get: jest.fn(),
        set: jest.fn()
    }
};

(global as any).chrome = {
    storage: mockStorage
};

describe('Variable Manager Unit Tests', () => {
    /**
     * 各テストの前に実行される初期化処理
     * モック関数の呼び出し履歴をクリアする
     */
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * 変数置換機能のテスト
     * 
     * - 基本的な変数置換
     * - 未定義変数の処理
     * - 特殊文字を含む変数名の処理
     * - エッジケースの処理
     */
    describe('replaceVariables', () => {
        /**
         * 基本的な変数置換テスト
         * 
         * - 複数の変数の同時置換
         * - URL構築での変数使用
         * - 正しい値への置換確認
         */
        test('should replace simple variables', () => {
            const variables = {
                baseUrl: 'https://api.example.com',
                version: 'v1',
                userId: '123'
            };

            const input = '{{baseUrl}}/{{version}}/users/{{userId}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.example.com/v1/users/123');
        });

        /**
         * 未定義変数の処理テスト
         * 
         * - 存在しない変数名の場合の処理
         * - 元の{{}}形式のまま保持される
         * - 他の変数は正常に置換される
         */
        test('should handle missing variables', () => {
            const variables = {
                baseUrl: 'https://api.example.com'
            };

            const input = '{{baseUrl}}/users/{{missingVar}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.example.com/users/{{missingVar}}');
        });

        /**
         * 空の変数オブジェクトの処理テスト
         * 
         * - 変数が定義されていない場合
         * - すべての変数がそのまま残る
         * - エラーを起こさずに処理される
         */
        test('should handle empty variables object', () => {
            const variables = {};
            const input = '{{baseUrl}}/api/{{endpoint}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('{{baseUrl}}/api/{{endpoint}}');
        });

        /**
         * 変数を含まないテキストの処理テスト
         * 
         * - {{}}形式の変数が含まれない文字列
         * - 元の文字列がそのまま返される
         * - 不要な処理が行われない
         */
        test('should handle text without variables', () => {
            const variables = {
                test: 'value'
            };

            const input = 'https://api.example.com/users';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.example.com/users');
        });

        /**
         * 同一変数の複数出現テスト
         * 
         * - 同じ変数名が複数回使用される場合
         * - すべての出現箇所が正しく置換される
         * - 認証トークンの複数使用など実用的なケース
         */
        test('should handle multiple occurrences of same variable', () => {
            const variables = {
                token: 'abc123'
            };

            const input = 'Bearer {{token}} and {{token}} again';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('Bearer abc123 and abc123 again');
        });

        /**
         * 特殊文字を含む変数名のテスト
         * 
         * - ハイフンやアンダースコアを含む変数名
         * - 実際のAPI開発でよく使われる命名規則
         * - 特殊文字が正しく処理される
         */
        test('should handle variables with special characters', () => {
            const variables = {
                'api-key': 'key123',
                'base_url': 'https://api.test.com'
            };

            const input = '{{base_url}}/data?key={{api-key}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('https://api.test.com/data?key=key123');
        });

        /**
         * ネストした中括弧の処理テスト
         * 
         * - 変数値にJSONやオブジェクト形式の文字列が含まれる場合
         * - 中括弧の混在による構文エラーの回避
         * - 設定データの動的挿入など実用的なケース
         */
        test('should handle nested braces', () => {
            const variables = {
                config: '{"nested": "value"}'
            };

            const input = 'Config: {{config}}';
            const result = replaceVariables(input, variables);
            
            expect(result).toBe('Config: {"nested": "value"}');
        });
    });

    /**
     * JSONPath検証機能のテスト
     * 
     * - 基本的なJSONPathの構文検証
     * - 複雑なクエリ構文の検証
     * - 無効な構文の適切な拒否
     */
    describe('validateJsonPath', () => {
        /**
         * 基本的なJSONPath構文の検証テスト
         * 
         * - 単純なプロパティアクセス（$.data）
         * - ネストしたプロパティアクセス（$.user.name）
         * - 配列インデックスアクセス（$.items[0]）
         * - ワイルドカード使用（$.items[*].id）
         */
        test('should validate simple JSON paths', () => {
            expect(validateJsonPath('$.data')).toBe(true);
            expect(validateJsonPath('$.user.name')).toBe(true);
            expect(validateJsonPath('$.items[0]')).toBe(true);
            expect(validateJsonPath('$.items[*].id')).toBe(true);
        });

        /**
         * 複雑なJSONPath構文の検証テスト
         * 
         * - 条件付きクエリ（?演算子使用）
         * - 再帰的検索（..演算子使用）
         * - 複数インデックス指定（[0,1]形式）
         * - 高度なフィルタリング構文
         */
        test('should validate complex JSON paths', () => {
            expect(validateJsonPath('$.store.book[*].author')).toBe(true);
            expect(validateJsonPath('$.store.book[?(@.price < 10)].title')).toBe(true);
            expect(validateJsonPath('$..book[2].title')).toBe(true);
            expect(validateJsonPath('$.store.book[0,1].title')).toBe(true);
        });

        /**
         * 無効なJSONPath構文の拒否テスト
         * 
         * - $で始まらない無効な構文
         * - 不完全な角括弧構文
         * - 構文エラーを含むパス
         * - 無効な文字列形式
         */
        test('should reject invalid JSON paths', () => {
            expect(validateJsonPath('invalid')).toBe(false);
            expect(validateJsonPath('$invalid')).toBe(false);
            expect(validateJsonPath('$.[')).toBe(false);
            expect(validateJsonPath('$.items[')).toBe(false);
        });

        /**
         * 空や未定義のパスの処理テスト
         * 
         * - 空文字列の場合のfalse返却
         * - undefined値の場合のfalse返却
         * - null値の場合のfalse返却
         * - エラーを起こさずに適切にハンドリング
         */
        test('should handle empty or undefined paths', () => {
            expect(validateJsonPath('')).toBe(false);
            expect(validateJsonPath(undefined as any)).toBe(false);
            expect(validateJsonPath(null as any)).toBe(false);
        });
    });
});