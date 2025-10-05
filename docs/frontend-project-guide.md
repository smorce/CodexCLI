---
title: フロントエンドプロジェクトガイド (Next.js & Supabase)
created_at: 2025-06-21
updated_at: 2025-10-05
---

このドキュメントは、Next.js と Supabase を使用したフロントエンドプロジェクトにおける特有の注意点とベストプラクティスを提供します。

## Next.js & Supabase 開発における重要事項

### 1. ルーティング: ルートグループはURLセグメントではない
- **問題**: `/(admin)/page.tsx` を URL `/admin` と誤解。
- **要点**: `(folder)` は構造整理用で URL に影響しない。`app/(main)/page.tsx` は `/` にマッピング。`app/(admin)/page.tsx` と `app/page.tsx` の重複は競合。
- **指示**: URL を分けたいなら実際に `/admin` ルートを作成。整理だけならルートグループを使用。

### 2. データフェッチ: `useEffect` ではなくサーバーコンポーネントで（`useEffect` 最小化）
#### 2.1 原則
- App Router では **サーバーコンポーネント（SC）で取得**。クライアント JS は最小化。
- `useEffect` は **外部副作用のための最後の手段**。

#### 2.2 実装フロー
1. **DAL** を `src/lib/data-access.ts` へ集約  
2. SC で `await getData()`  
3. 必要に応じて `<Suspense fallback={<Skeleton/>}>` でストリーミング

#### 2.3 `useEffect` 回避パターン
| やりたいこと | 推奨代替策 |
|---|---|
| SSR/SSG 時点で確定する取得 | **SC から直接フェッチ** |
| クライアント状態依存の再取得 | **`use()` + Suspense** (React 18+) |
| 単純な UI イベント応答 | イベントハンドラ内で同期実行 |
| 高価な計算のキャッシュ | `useMemo` |

#### 2.4 `useEffect` を書いてよい場合
1. DOM 直接操作（フォーカス/スクロール）  
2. 外部ライブラリの初期化/破棄（Chart.js, Mapbox 等）  
3. WebSocket/サブスクリプション開始とクリーンアップ  
4. タイマー系（`setTimeout`/`setInterval`）  
5. **(React 18 未満)** クライアント API 呼び出し副作用

#### 2.5 アンチパターンと是正
| アンチパターン | 問題 | 是正 |
|---|---|---|
| 依存配列の抜け/過剰 | 無限ループ・再描画増 | ESLint `exhaustive-deps` 準拠 |
| effect 内でデータ変換 | パフォーマンス劣化 | 本体 or `useMemo` |
| 1 effect に多責務 | 可読性/テスト性低下 | 単責任に分割・カスタムフック化 |

#### 2.6 チェックリスト
- [ ] SC で取得できるか  
- [ ] 外部副作用か  
- [ ] 依存配列は最小か  
- [ ] クリーンアップを返しているか  
- [ ] 「なぜ `useEffect` 必要か」をコメントしたか

### 3. UI/UX: `Suspense` によるストリーミングとスケルトン
- **要点**: 重い取得ブロックを `React.Suspense` でラップし、`fallback` にスケルトン。準備できた部分から段階表示。
- **指示**: 「取得中はスケルトン表示、`Suspense` でストリーミング」。

### 4. データ更新: `Server Actions` を積極活用
- **要点**: クライアントのイベント + API ルートではなく **Server Actions** を直接バインド。エンドポイント別作成を削減。
- **指示**: 「フォーム処理は Server Actions で」。

### 5. 動的データ: `searchParams`/動的 `params` は非同期で受け取る
- **要点**: ページは `async` 関数。`params`/`searchParams` は非同期で渡される。
```ts
// app/blog/[id]/page.tsx
export default async function BlogPostPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const post = await getPost(params.id);
  return <div>...</div>;
}
```

* **指示**: `useSearchParams` ではなく **非同期プロップス**を使用。

### 6. Supabase: サーバー/クライアントのクライアントを使い分け

* **クライアント側**: `createClient()`（`@supabase/supabase-js`）
* **サーバ側（SC/Route/Server Actions）**: `createServerClient()`（`@supabase/ssr`）で Cookie セッションを安全に扱う
* **指示**: サーバーコンポーネントでは `createServerClient` を使用

## 7. アーキテクチャ/ホスティング

* **SPA**: **CDN + オブジェクトストレージ**。SPA ルーティングのため 404→`index.html` へリライト。CSP/HSTS/Cache-Control は CDN で。
* **SSR/Server Actions**:

  * **Node サーバ**（Vercel/ECS/EC2 等）: 柔軟・安定。長時間接続や大きな応答に強い。
  * **FaaS**（Lambda 等）: サーバーレス/従量。コールドスタート/接続制限に留意。静的資産は CDN。
* **Supabase 役割**: Auth/DB/Storage/Edge Functions。**サービスロールキーはサーバのみ**（環境変数）。クライアントに露出禁止。
* **キャッシュ**: Next の `fetch` に `cache`/`revalidate` を明示。静的化できるところは **SSG/ISR**。

## 8. レンダリング戦略

| 要件             | 推奨                                          |
| -------------- | ------------------------------------------- |
| 初回表示・SEO重視     | **SSR** + `Suspense` ストリーミング                |
| 更新頻度が低い公開ページ   | **SSG/ISR**（`export const revalidate = n;`） |
| 高インタラクション中心    | **CSR**（ただし取得は可能な限り SC）                     |
| ログイン必須/ダッシュボード | SSR（Cookie セッション）+ Server Actions           |

> SC/SSR を基本に、クライアント JS は最小に保つ。

## 9. URL/情報設計

* **命名**: リソース中心・**kebab-case**。末尾スラッシュ/拡張子は統一。
* **正規化**: 代替 URL の乱立を避け、正規 URL を 1 本化。
* **秘匿情報禁止**: セッション ID・トークン・個人情報を **URL に載せない**（Referer 漏えい対策）。
* **共有状態**: クエリ `?q=...&page=...` で表現。

## 10. バリデーション

* **二重化**: クライアントで UX、**サーバで最終防衛**。
* **共通スキーマ**: `zod` 等で定義し、**Server Actions** とクライアントで共用。
* **DB/RLS**: Supabase の RLS/制約で再防御。

## 11. 状態管理

* **最小グローバル**: まず **SC + props**、URL クエリ、ローカル state を検討。
* **永続の使い分け**: 共有→URL、端末限定→`localStorage/sessionStorage`。機密は保存しない。
* **ライブラリ基準**: キャッシュ/同期待ち/非正規化など具体課題が出てから導入。

## 12. 認証/認可（Supabase × Next.js）

* **クライアント**: `@supabase/supabase-js` の `createClient()`
* **サーバ**: `@supabase/ssr` の `createServerClient()`（Cookie 連携）
* **セッション保管**: トークンを **localStorage に保存しない**。HttpOnly Cookie。
* **RLS**: Row Level Security を前提にクエリを設計。サービスロールはサーバ側のみ。
* **ルーティング**: 認証必須ページは **サーバ側でガード**。

## 13. ブラウザサポートとテスト

* **対象**: 最新 Chrome / Safari / Edge / Firefox（必要に応じてモバイル）。
* **テスト**: 重要フローの E2E（例: Playwright）、主要画面のビューポートスナップショット。

## 14. 運用/セキュリティ

* **ヘッダ**: CSP / HSTS / Referrer-Policy を CDN/エッジで付与。
* **キャッシュ**: 静的資産は長期 + ファイル名ハッシュ、HTML は短期 or no-store。
* **ログ/監視**: サーバ/クライアントのエラーログ収集。相関 ID。
* **SPA ルーティング**: CDN で 404 → `index.html` リライト。
* **秘密情報**: URL/ログ/フロントコードに出さない。`.env` は環境毎。

## 15. ディレクトリ構成例（App Router）

```
app/
  (public)/
    layout.tsx
    page.tsx
  (auth)/
    signin/page.tsx
  dashboard/
    page.tsx
  api/
    route-handlers...
components/
  ui/...
lib/
  data-access.ts        # DAL
  auth.ts               # Supabase クライアント生成
  validation.ts         # zod スキーマ
actions/
  user.ts               # Server Actions
```

## 16. スニペット

* **Server Actions**: `"use server"` を先頭に。zod で検証 → DB → リダイレクト/再検証。
* **`fetch` キャッシュ**: `fetch(url, { cache: "no-store" })` / `export const revalidate = 60`
* **`dynamic`**: `export const dynamic = "force-static" | "force-dynamic"`