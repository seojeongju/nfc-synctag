import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_PASSWORD?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// --- 관리자 로그인 API ---
app.post('/admin/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    const validPassword = c.env.ADMIN_PASSWORD || 'wowtag2026!';

    if (email === 'admin@wowtag.com' && password === validPassword) {
      // Base64 토큰 생성으로 보안 강화
      const token = btoa(`${email}:${validPassword}:${Date.now()}`);
      return c.json({ success: true, token }, 200);
    }
    return c.json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' }, 401);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- 골드바 및 보증서 관리 API ---

// 모든 골드바 목록 조회
app.get('/goldbars', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT g.*, c.tag_uid, c.cert_file_path 
      FROM goldbars g
      LEFT JOIN certificates c ON g.id = c.goldbar_id
      ORDER BY g.created_at DESC
    `).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 골드바 및 보증서 등록
app.post('/goldbars', async (c) => {
  try {
    const { serial_number, weight, purity, minted_at, tag_uid, cert_file_base64, file_name } = await c.req.json();

    if (!serial_number || !weight) {
      return c.json({ error: 'Serial number and weight are required' }, 400);
    }

    // 1. 골드바 정보 저장
    const insertGoldbar = await c.env.DB.prepare(`
      INSERT OR REPLACE INTO goldbars (serial_number, weight, purity, minted_at) 
      VALUES (?, ?, ?, ?) RETURNING id
    `).bind(serial_number, weight, purity || '99.99%', minted_at).first();

    const goldbarId = (insertGoldbar as any).id;

    // 2. 인증서 파일이 Base64 형태로 함께 전달된 경우 R2 버킷에 저장
    let certFilePath = `certificates/${serial_number}_cert.pdf`;
    if (file_name) {
      certFilePath = `certificates/${serial_number}_${file_name}`;
    }

    if (cert_file_base64) {
      // Base64를 ArrayBuffer로 변환하여 R2에 저장
      const base64Data = cert_file_base64.split(',')[1] || cert_file_base64;
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      await c.env.BUCKET.put(certFilePath, bytes.buffer, {
        httpMetadata: { contentType: 'application/pdf' },
      });
    }

    // 3. 태그 및 보증서 매핑 정보 저장
    if (tag_uid) {
      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO certificates (goldbar_id, tag_uid, cert_file_path) 
        VALUES (?, ?, ?)
      `).bind(goldbarId, tag_uid, certFilePath).run();
    }

    return c.json({ success: true, goldbarId }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 특정 NFC 태그로 골드바 정품인증 정보 조회
app.get('/goldbars/t/:tagId', async (c) => {
  try {
    const tagId = c.req.param('tagId');
    const query = `
      SELECT g.*, c.tag_uid, c.cert_file_path 
      FROM goldbars g
      JOIN certificates c ON g.id = c.goldbar_id
      WHERE c.tag_uid = ?
    `;
    const goldbar = await c.env.DB.prepare(query).bind(tagId).first();

    if (!goldbar) {
      return c.json({ error: 'not_found' }, 404);
    }

    // 스캔 로그 기록
    c.executionCtx.waitUntil(
      c.env.DB.prepare('INSERT INTO verification_logs (tag_uid, scanned_at, is_valid) VALUES (?, ?, ?)')
        .bind(tagId, new Date().toISOString(), 1)
        .run()
    );

    return c.json(goldbar);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 정품인증서 파일 다운로드
app.get('/certificates/download/:tagId', async (c) => {
  try {
    const tagId = c.req.param('tagId');
    const query = 'SELECT cert_file_path FROM certificates WHERE tag_uid = ?';
    const cert = await c.env.DB.prepare(query).bind(tagId).first();

    if (!cert || !cert.cert_file_path) {
      return c.json({ error: 'Certificate not found' }, 404);
    }

    const object = await c.env.BUCKET.get(cert.cert_file_path as string);

    if (object === null) {
      return c.json({ error: 'Object not found in R2' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Disposition', `attachment; filename="${cert.cert_file_path.split('/').pop()}"`);

    return new Response(object.body, { headers });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 제품 목록 조회
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
    // 404 대신 200에 빈 데이터 혹은 에러 메시지를 보낼 수 있지만, 
    // 여기서는 404를 유지하되 JSON 포맷을 확실히 합니다.
    return c.json({ error: 'not_found' }, 404);
  }

  // 스캔 로그 기록 (비동기로 실행되도록 처리하거나 일단 간단히)
  c.executionCtx.waitUntil(
    c.env.DB.prepare('INSERT INTO scan_logs (tag_uid, scanned_at) VALUES (?, ?)')
      .bind(tagId, new Date().toISOString())
      .run()
  );

  return c.json(product);
});

app.get('/admin/stats', async (c) => {
  try {
    // 1. 누적 스캔 수
    const scanCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM verification_logs').first();
    
    // 2. 활성 태그 수 (중복 제거)
    const activeTags = await c.env.DB.prepare('SELECT COUNT(DISTINCT tag_uid) as cnt FROM verification_logs').first();

    // 3. 최근 스캔 로그 리스트
    const { results: recentLogs } = await c.env.DB.prepare(`
      SELECT l.*, g.serial_number 
      FROM verification_logs l
      LEFT JOIN certificates c ON l.tag_uid = c.tag_uid
      LEFT JOIN goldbars g ON c.goldbar_id = g.id
      ORDER BY l.scanned_at DESC LIMIT 5
    `).all();

    return c.json({
      scanCount: (scanCount as any)?.cnt || 0,
      activeTags: (activeTags as any)?.cnt || 0,
      recentLogs
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Integrated WowTag API!',
    timestamp: new Date().toISOString()
  });
});

export const onRequest = handle(app);
