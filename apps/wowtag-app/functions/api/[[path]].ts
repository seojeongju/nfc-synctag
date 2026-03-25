
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// 모든 제품 목록 조회
app.get('/products', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  return c.json(results);
});

// 특정 태그 UID 정보 조회 (중복 체크용)
app.get('/tags/:uid', async (c) => {
  const { uid } = c.req.param();
  const tagInfo = await c.env.DB.prepare(`
    SELECT t.*, p.name as product_name 
    FROM tags t 
    LEFT JOIN products p ON t.product_id = p.id 
    WHERE t.tag_uid = ?
  `).bind(uid).first();
  
  return c.json(tagInfo || { message: 'not_found' });
});

// 제품 등록
app.post('/products', async (c) => {
  const body = await c.req.json();
  const { name, description, video_url, manual_url, image_url, tag_uid } = body;

  if (!name) return c.json({ error: 'Name is required' }, 400);

  // 1. 제품 생성
  const productResult = await c.env.DB.prepare(
    'INSERT INTO products (name, description, video_url, manual_url, image_url) VALUES (?, ?, ?, ?, ?) RETURNING id'
  ).bind(name, description, video_url, manual_url, image_url).first();

  const productId = (productResult as any).id;

  // 2. 태그 UID가 함께 전달된 경우 즉시 매핑 (덮어쓰기 허용)
  if (tag_uid) {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, ?)'
    ).bind(tag_uid, productId).run();
  }

  return c.json({ success: true, productId }, 201);
});

// 태그 매핑 (별도 수행 시 - 덮어쓰기 허용)
app.post('/tags', async (c) => {
  const { tag_uid, product_id } = await c.req.json();
  if (!tag_uid || !product_id) return c.json({ error: 'Invalid data' }, 400);

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, ?)'
  ).bind(tag_uid, product_id).run();

  return c.json({ success: true });
});

// 특정 태그(NFC)로 제품 정보 조회
app.get('/t/:tagId', async (c) => {
  const tagId = c.req.param('tagId');
  const query = `
    SELECT p.*, t.tag_uid 
    FROM products p 
    JOIN tags t ON p.id = t.product_id 
    WHERE t.tag_uid = ?
  `;
  const product = await c.env.DB.prepare(query).bind(tagId).first();
  
  if (!product) {
    return c.json({ error: 'Tag not found' }, 404);
  }

  // 스캔 로그 기록 (비동기로 실행되도록 처리하거나 일단 간단히)
  c.executionCtx.waitUntil(
    c.env.DB.prepare('INSERT INTO scan_logs (tag_uid, scanned_at) VALUES (?, ?)')
      .bind(tagId, new Date().toISOString())
      .run()
  );

  return c.json(product);
});

app.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Integrated WowTag API!',
    timestamp: new Date().toISOString()
  });
});

// 기존 backend의 로직을 여기에 추가할 수 있습니다.

export const onRequest = handle(app);
