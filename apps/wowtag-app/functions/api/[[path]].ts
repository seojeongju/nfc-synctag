import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_PASSWORD?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  KAKAO_REST_API_KEY?: string;
};

async function ensureUsersPasswordColumn(db: D1Database) {
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
  } catch (_) {}
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
  } catch (_) {}
}

async function hashUserPassword(email: string, password: string): Promise<string> {
  const base = `wowtag:v1|${email.trim().toLowerCase()}|${password}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeUserRow(u: Record<string, unknown> | null | undefined) {
  if (!u) return u;
  const { password_hash: _, ...rest } = u as Record<string, unknown>;
  return rest;
}

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
    // 자동 마이그레이션
    try {
      await c.env.DB.prepare("ALTER TABLE goldbars ADD COLUMN status TEXT DEFAULT 'CATALOG'").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN cert_url TEXT').run();
    } catch (_) {}

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
    const { serial_number, weight, purity, minted_at, tag_uid, cert_file_base64, file_name, status, cert_url } = await c.req.json();

    if (!serial_number || !weight) {
      return c.json({ error: 'Serial number and weight are required' }, 400);
    }

    // 자동 마이그레이션
    try {
      await c.env.DB.prepare("ALTER TABLE goldbars ADD COLUMN status TEXT DEFAULT 'CATALOG'").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN cert_url TEXT').run();
    } catch (_) {}

    // 1. 골드바 정보 저장
    const insertGoldbar = await c.env.DB.prepare(`
      INSERT OR REPLACE INTO goldbars (serial_number, weight, purity, minted_at, status, cert_url) 
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id
    `).bind(serial_number, weight, purity || '99.99%', minted_at, status || 'CATALOG', cert_url || '').first();

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
      await ensureGoldbarTagPoolTable(c.env.DB);
      await removeTagFromGoldbarPool(c.env.DB, String(tag_uid).trim());
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

// 골드바 출고 전: NFC UID만 자산 풀에 등록(인증서 미연결. 스캔 시에도 홈 오픈)
app.post('/goldbar-tag-pool', async (c) => {
  try {
    if (!verifyAdminToken(c)) {
      return c.json({ error: '관리자 인증이 필요합니다.' }, 401);
    }
    await ensureGoldbarTagPoolTable(c.env.DB);
    const body = await c.req.json();
    const rawUid = typeof body.tag_uid === 'string' ? body.tag_uid.trim() : '';
    if (!rawUid) {
      return c.json({ error: 'tag_uid가 필요합니다.' }, 400);
    }

    const cert = await c.env.DB.prepare('SELECT tag_uid FROM certificates WHERE tag_uid = ?').bind(rawUid).first();
    if (cert) {
      return c.json({ error: '이미 인증서와 연결된 UID입니다.' }, 400);
    }

    const inTags = await c.env.DB.prepare('SELECT tag_uid FROM tags WHERE tag_uid = ?').bind(rawUid).first();
    if (inTags) {
      return c.json({ error: '이 UID는 주얼리/제품 태그 자산에 이미 등록되어 있습니다.' }, 400);
    }

    const inPool = await c.env.DB.prepare('SELECT tag_uid FROM goldbar_tag_pool WHERE tag_uid = ?').bind(rawUid).first();
    if (inPool) {
      return c.json({ error: '이미 골드바 자산 풀에 등록된 UID입니다.' }, 400);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare('INSERT INTO goldbar_tag_pool (tag_uid, created_at) VALUES (?, ?)').bind(rawUid, now).run();
    return c.json({ success: true });
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

    // 10분간 유효한 단기 다운로드 토큰 발행
    const expiry = Date.now() + 10 * 60 * 1000;
    const downloadToken = btoa(`${tagId}:${expiry}`);

    return c.json({
      ...goldbar,
      download_token: downloadToken
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 정품인증서 파일 다운로드
app.get('/certificates/download/:tagId', async (c) => {
  try {
    const tagId = c.req.param('tagId');
    const token = c.req.query('token');

    if (!token) {
      return c.json({ error: '유효하지 않은 요청입니다. (토큰 누락)' }, 400);
    }

    try {
      const decoded = atob(token);
      const [tokenTagId, expiryStr] = decoded.split(':');
      if (tokenTagId !== tagId || Date.now() > parseInt(expiryStr)) {
        return c.json({ error: '다운로드 링크가 만료되었거나 유효하지 않습니다.' }, 403);
      }
    } catch (e) {
      return c.json({ error: '올바르지 않은 접근입니다.' }, 400);
    }

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
  const uid = c.req.param('uid');

  await ensureGoldbarTagPoolTable(c.env.DB);
  const pool = await c.env.DB.prepare('SELECT tag_uid FROM goldbar_tag_pool WHERE tag_uid = ?').bind(uid).first();
  if (pool) {
    return c.json({ message: 'goldbar_pool', reserved: true, tag_uid: uid });
  }

  const cert = await c.env.DB.prepare('SELECT tag_uid FROM certificates WHERE tag_uid = ?').bind(uid).first();
  if (cert) {
    return c.json({ message: 'goldbar_tag', reserved: true, tag_uid: uid });
  }

  const tagInfo = await c.env.DB.prepare(`
    SELECT t.*, p.name as product_name 
    FROM tags t 
    LEFT JOIN products p ON t.product_id = p.id 
    WHERE t.tag_uid = ?
  `).bind(uid).first();

  return c.json(tagInfo || { message: 'not_found' });
});

async function migrateProductsExtraColumns(db: D1Database) {
  const stmts = [
    'ALTER TABLE products ADD COLUMN options TEXT',
    'ALTER TABLE products ADD COLUMN material TEXT',
    'ALTER TABLE products ADD COLUMN purity TEXT',
    'ALTER TABLE products ADD COLUMN weight TEXT',
    'ALTER TABLE products ADD COLUMN width_mm TEXT',
    'ALTER TABLE products ADD COLUMN height_mm TEXT',
    'ALTER TABLE products ADD COLUMN price TEXT',
    'ALTER TABLE products ADD COLUMN memo TEXT',
    'ALTER TABLE products ADD COLUMN sold_at TEXT',
  ];
  for (const sql of stmts) {
    try {
      await db.prepare(sql).run();
    } catch (_) {}
  }
}

async function ensureTagUnmapProofsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tag_unmap_proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_uid TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    )
    .run();
}

/** 골드바: 인증서 연결 전 UID만 등록(자산). 스캔 시에도 홈이 열리게 함 */
async function ensureGoldbarTagPoolTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS goldbar_tag_pool (
        tag_uid TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL
      )`
    )
    .run();
}

async function removeTagFromGoldbarPool(db: D1Database, tagUid: string) {
  try {
    await db.prepare('DELETE FROM goldbar_tag_pool WHERE tag_uid = ?').bind(tagUid).run();
  } catch {
    /* 테이블 없음 등 */
  }
}

function verifyAdminToken(c: { req: { header: (name: string) => string | undefined }; env: Bindings }): boolean {
  const auth = c.req.header('Authorization');
  const alt = c.req.header('X-Admin-Token');
  const raw = auth?.startsWith('Bearer ') ? auth.slice(7) : alt;
  if (!raw) return false;
  try {
    const decoded = atob(raw);
    const validPassword = c.env.ADMIN_PASSWORD || 'wowtag2026!';
    const parts = decoded.split(':');
    if (parts.length < 3) return false;
    const [email, password] = parts;
    return email === 'admin@wowtag.com' && password === validPassword;
  } catch {
    return false;
  }
}

const UNMAP_PROOF_MAX_AGE_MIN = 15;

// 제품 등록
app.post('/products', async (c) => {
  try {
    await migrateProductsExtraColumns(c.env.DB);

    const body = await c.req.json();
    const {
      name,
      description,
      video_url,
      manual_url,
      image_url,
      tag_uid,
      options,
      image_file_base64,
      file_name,
      material,
      purity,
      weight,
      width_mm,
      height_mm,
      price,
      memo,
    } = body;

    if (!name) return c.json({ error: 'Name is required' }, 400);

    let savedImageUrl = image_url || '/jewelry.png';

    // 1. 이미지가 Base64로 전달된 경우 R2에 저장
    if (image_file_base64) {
      const base64Data = image_file_base64.split(',')[1] || image_file_base64;
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const ext = file_name ? file_name.split('.').pop() : 'png';
      const r2Path = `products/images/${Date.now()}.${ext}`;
      await c.env.BUCKET.put(r2Path, bytes.buffer, {
        httpMetadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
      });
      // 이미지 URL을 조회용 경로 또는 API 파일 다운로드 경로로 세팅 (여기선 일단 R2_PUBLIC_DOMAIN 대신 파일 자체 데이터를 추후 가져올 수 있는 endpoint 구현)
      savedImageUrl = `/api/products/image/${r2Path}`;
    }

    // 2. 제품 생성
    const productResult = await c.env.DB.prepare(
      `INSERT INTO products (
        name, description, video_url, manual_url, image_url, options,
        material, purity, weight, width_mm, height_mm, price, memo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
      .bind(
        name,
        description ?? '',
        video_url ?? '',
        manual_url ?? '',
        savedImageUrl,
        options ?? '',
        material ?? '',
        purity ?? '',
        weight ?? '',
        width_mm ?? '',
        height_mm ?? '',
        price ?? '',
        memo ?? ''
      )
      .first();

    const productId = (productResult as any).id;

    // 3. 태그 UID가 함께 전달된 경우 즉시 매핑 (덮어쓰기 허용)
    if (tag_uid) {
      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, ?)'
      ).bind(tag_uid, productId).run();
    }

    return c.json({ success: true, productId }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 제품 수정 API
app.put('/products/:id', async (c) => {
  try {
    await migrateProductsExtraColumns(c.env.DB);

    const id = c.req.param('id');
    const body = await c.req.json();
    const {
      name,
      description,
      video_url,
      manual_url,
      image_url,
      options,
      image_file_base64,
      file_name,
      material,
      purity,
      weight,
      width_mm,
      height_mm,
      price,
      memo,
      sold,
    } = body;

    if (!name) return c.json({ error: 'Name is required' }, 400);

    const soldInBody = Object.prototype.hasOwnProperty.call(body, 'sold');

    let savedImageUrl = image_url;

    if (image_file_base64) {
      const base64Data = image_file_base64.split(',')[1] || image_file_base64;
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const ext = file_name ? file_name.split('.').pop() : 'png';
      const r2Path = `products/images/${Date.now()}.${ext}`;
      await c.env.BUCKET.put(r2Path, bytes.buffer, {
        httpMetadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
      });
      savedImageUrl = `/api/products/image/${r2Path}`;
    }

    if (soldInBody && sold === true) {
      const mark = new Date().toISOString();
      await c.env.DB.prepare(`
      UPDATE products 
      SET name = ?, description = ?, video_url = ?, manual_url = ?, image_url = ?, options = ?,
          material = ?, purity = ?, weight = ?, width_mm = ?, height_mm = ?, price = ?, memo = ?,
          sold_at = COALESCE(sold_at, ?)
      WHERE id = ?
    `)
        .bind(
          name,
          description ?? '',
          video_url ?? '',
          manual_url ?? '',
          savedImageUrl,
          options ?? '',
          material ?? '',
          purity ?? '',
          weight ?? '',
          width_mm ?? '',
          height_mm ?? '',
          price ?? '',
          memo ?? '',
          mark,
          id
        )
        .run();
    } else if (soldInBody && sold === false) {
      await c.env.DB.prepare(`
      UPDATE products 
      SET name = ?, description = ?, video_url = ?, manual_url = ?, image_url = ?, options = ?,
          material = ?, purity = ?, weight = ?, width_mm = ?, height_mm = ?, price = ?, memo = ?,
          sold_at = NULL
      WHERE id = ?
    `)
        .bind(
          name,
          description ?? '',
          video_url ?? '',
          manual_url ?? '',
          savedImageUrl,
          options ?? '',
          material ?? '',
          purity ?? '',
          weight ?? '',
          width_mm ?? '',
          height_mm ?? '',
          price ?? '',
          memo ?? '',
          id
        )
        .run();
    } else {
      await c.env.DB.prepare(`
      UPDATE products 
      SET name = ?, description = ?, video_url = ?, manual_url = ?, image_url = ?, options = ?,
          material = ?, purity = ?, weight = ?, width_mm = ?, height_mm = ?, price = ?, memo = ?
      WHERE id = ?
    `)
        .bind(
          name,
          description ?? '',
          video_url ?? '',
          manual_url ?? '',
          savedImageUrl,
          options ?? '',
          material ?? '',
          purity ?? '',
          weight ?? '',
          width_mm ?? '',
          height_mm ?? '',
          price ?? '',
          memo ?? '',
          id
        )
        .run();
    }

    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 제품 삭제 API
app.delete('/products/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // 연계된 tags 데이터를 먼저 삭제
    await c.env.DB.prepare('DELETE FROM tags WHERE product_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 제품 이미지 조회 API
app.get('/products/image/products/images/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const path = `products/images/${filename}`;
    const object = await c.env.BUCKET.get(path);

    if (object === null) {
      return c.json({ error: 'Image not found in R2' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', filename.endsWith('png') ? 'image/png' : 'image/jpeg');

    return new Response(object.body, { headers });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 태그 매핑 — product_id 생략/null 이면 빈 태그 자산 등록만 (출고 시 별도 연동)
app.post('/tags', async (c) => {
  try {
    await ensureGoldbarTagPoolTable(c.env.DB);
    const body = await c.req.json();
    const rawUid = typeof body.tag_uid === 'string' ? body.tag_uid.trim() : '';
    const product_id = body.product_id;

    if (!rawUid) {
      return c.json({ error: 'tag_uid가 필요합니다.' }, 400);
    }

    const inPool = await c.env.DB.prepare('SELECT tag_uid FROM goldbar_tag_pool WHERE tag_uid = ?').bind(rawUid).first();
    if (inPool) {
      return c.json(
        { error: '이 UID는 골드바 자산 풀(인증서 연결 전)에 등록되어 있습니다. 골드바 콘솔에서 다루세요.' },
        400
      );
    }

    const cert = await c.env.DB.prepare('SELECT tag_uid FROM certificates WHERE tag_uid = ?').bind(rawUid).first();
    if (cert) {
      return c.json({ error: '이 UID는 골드바 정품 태그로 이미 사용 중입니다.' }, 400);
    }

    const hasProduct =
      product_id !== undefined && product_id !== null && product_id !== '';

    if (!hasProduct) {
      const existing = await c.env.DB.prepare('SELECT product_id FROM tags WHERE tag_uid = ?').bind(rawUid).first();
      if (existing && existing.product_id != null) {
        return c.json({ error: '이미 제품과 연결된 태그는 빈 자산으로 등록할 수 없습니다.' }, 400);
      }
      await c.env.DB.prepare('INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, NULL)').bind(rawUid).run();
      return c.json({ success: true, mode: 'asset' });
    }

    const pid = Number(product_id);
    if (!Number.isFinite(pid)) {
      return c.json({ error: '유효한 product_id가 필요합니다.' }, 400);
    }

    await c.env.DB.prepare('INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, ?)').bind(rawUid, pid).run();

    return c.json({ success: true, mode: 'mapped' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 출고 시: 자산 태그(product_id IS NULL)에 제품만 연결
app.put('/tags/link-product', async (c) => {
  try {
    const { tag_uid, product_id } = await c.req.json();
    const rawUid = typeof tag_uid === 'string' ? tag_uid.trim() : '';
    const pid = Number(product_id);
    if (!rawUid || !Number.isFinite(pid)) {
      return c.json({ error: 'tag_uid와 product_id가 필요합니다.' }, 400);
    }

    const productRow = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(pid).first();
    if (!productRow) {
      return c.json({ error: '해당 제품이 존재하지 않습니다.' }, 404);
    }

    const result = await c.env.DB.prepare(
      'UPDATE tags SET product_id = ? WHERE tag_uid = ? AND product_id IS NULL'
    )
      .bind(pid, rawUid)
      .run();

    if ((result.meta?.changes ?? 0) === 0) {
      const row = await c.env.DB.prepare('SELECT product_id FROM tags WHERE tag_uid = ?').bind(rawUid).first();
      if (!row) {
        return c.json({ error: '등록된 태그를 찾을 수 없습니다. 먼저 빈 태그 자산 등록을 해 주세요.' }, 404);
      }
      return c.json({ error: '이미 제품이 연결된 태그이거나 연동할 수 없습니다.' }, 400);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 모든 NFC 태그 목록 및 매핑 조회 API
app.get('/tags', async (c) => {
  try {
    await migrateProductsExtraColumns(c.env.DB);

    const { results: productTags } = await c.env.DB.prepare(`
      SELECT t.id, t.tag_uid, t.created_at, p.id as target_id, p.name as target_name,
             p.sold_at as product_sold_at, 'product' as target_type
      FROM tags t
      LEFT JOIN products p ON t.product_id = p.id
      ORDER BY t.created_at DESC
    `).all();

    const { results: goldbarTags } = await c.env.DB.prepare(`
      SELECT c.id, c.tag_uid, c.issued_at as created_at, g.id as target_id, g.serial_number as target_name, 'goldbar' as target_type
      FROM certificates c
      LEFT JOIN goldbars g ON c.goldbar_id = g.id
      ORDER BY c.issued_at DESC
    `).all();

    await ensureGoldbarTagPoolTable(c.env.DB);
    const { results: poolTags } = await c.env.DB.prepare(`
      SELECT NULL as id, tag_uid, created_at, NULL as target_id, NULL as target_name, 'goldbar_pool' as target_type
      FROM goldbar_tag_pool
      ORDER BY created_at DESC
    `).all();

    const allTags = [...productTags, ...goldbarTags, ...poolTags];
    return c.json(allTags);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 제품-태그 매칭 해제 (product_id → NULL, 행 유지) — 미판매는 관리자만, 판매 완료 제품은 최근 NFC 인증 필요
app.post('/tags/:uid/unmap', async (c) => {
  try {
    if (!verifyAdminToken(c)) {
      return c.json({ error: '관리자 인증이 필요합니다.' }, 401);
    }
    await migrateProductsExtraColumns(c.env.DB);
    await ensureTagUnmapProofsTable(c.env.DB);

    const uid = c.req.param('uid');
    const row = await c.env.DB.prepare(
      `
      SELECT t.tag_uid, t.product_id, p.sold_at as product_sold_at
      FROM tags t
      LEFT JOIN products p ON p.id = t.product_id
      WHERE t.tag_uid = ?
    `
    )
      .bind(uid)
      .first();

    if (!row) {
      return c.json({ error: '등록된 태그를 찾을 수 없습니다.' }, 404);
    }
    if (row.product_id == null) {
      return c.json({ error: '이미 제품과 매칭되지 않은 태그입니다.' }, 400);
    }

    const isSold = row.product_sold_at != null && String(row.product_sold_at).trim() !== '';

    if (isSold) {
      const cutoff = new Date(Date.now() - UNMAP_PROOF_MAX_AGE_MIN * 60 * 1000).toISOString();
      const proof = await c.env.DB.prepare(
        `
        SELECT id FROM tag_unmap_proofs
        WHERE tag_uid = ? AND created_at > ?
        ORDER BY id DESC
        LIMIT 1
      `
      )
        .bind(uid, cutoff)
        .first();

      if (!proof) {
        return c.json(
          {
            error: '판매 완료된 제품입니다. 실제 NFC 태그를 스캔한 뒤 다시 시도해 주세요.',
            code: 'NEEDS_NFC_SCAN',
          },
          403
        );
      }

      await c.env.DB.prepare('DELETE FROM tag_unmap_proofs WHERE id = ?').bind(proof.id).run();
    }

    await c.env.DB.prepare('UPDATE tags SET product_id = NULL WHERE tag_uid = ?').bind(uid).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 특정 NFC 태그 매핑 해제 (삭제) API
app.delete('/tags/:uid', async (c) => {
  try {
    const uid = c.req.param('uid');
    await ensureGoldbarTagPoolTable(c.env.DB);

    // 1. 일반 제품 매핑 테이블에서 삭제
    await c.env.DB.prepare('DELETE FROM tags WHERE tag_uid = ?').bind(uid).run();

    // 2. 골드바 인증서 매핑 테이블에서 삭제
    await c.env.DB.prepare('DELETE FROM certificates WHERE tag_uid = ?').bind(uid).run();

    // 3. 골드바 자산 풀
    await c.env.DB.prepare('DELETE FROM goldbar_tag_pool WHERE tag_uid = ?').bind(uid).run();

    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 특정 태그(NFC) 스캔 — 자산만 등록된 태그 / 제품 연결 태그 모두 메인 안내용 JSON (제품 상세 페이지 대신 앱 메인 유도)
// 골드바 자산 풀(goldbar_tag_pool)만 등록·인증서 미연결인 경우에도 200 + nfc_mode home → 앱 홈 오픈
app.get('/t/:tagId', async (c) => {
  const tagId = c.req.param('tagId');
  const unmapVerify = c.req.query('unmap_verify') === '1';

  await ensureGoldbarTagPoolTable(c.env.DB);

  const row = await c.env.DB.prepare(`
    SELECT t.tag_uid, t.product_id, p.id as product_pk
    FROM tags t
    LEFT JOIN products p ON p.id = t.product_id
    WHERE t.tag_uid = ?
  `)
    .bind(tagId)
    .first();

  const poolRow = !row
    ? await c.env.DB.prepare('SELECT tag_uid FROM goldbar_tag_pool WHERE tag_uid = ?').bind(tagId).first()
    : null;

  if (!row && !poolRow) {
    return c.json({ error: 'not_found' }, 404);
  }

  c.executionCtx.waitUntil(
    c.env.DB.prepare('INSERT INTO scan_logs (tag_uid, scanned_at) VALUES (?, ?)')
      .bind(tagId, new Date().toISOString())
      .run()
  );

  if (unmapVerify) {
    await ensureTagUnmapProofsTable(c.env.DB);
    const now = new Date().toISOString();
    await c.env.DB.prepare('INSERT INTO tag_unmap_proofs (tag_uid, created_at) VALUES (?, ?)').bind(tagId, now).run();
  }

  if (poolRow) {
    return c.json({
      nfc_mode: 'home',
      tag_uid: tagId,
      message:
        '등록된 NFC 태그입니다. 인증서가 연결되면 스캔 시 정품 정보를 확인할 수 있습니다.',
      goldbar_pool_only: true,
      ...(unmapVerify ? { unmap_proof_recorded: true } : {}),
    });
  }

  if (!row) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (row.product_id == null || row.product_pk == null) {
    return c.json({
      nfc_mode: 'asset',
      tag_uid: tagId,
      message: '출고 전 등록된 자산 태그입니다.',
      ...(unmapVerify ? { unmap_proof_recorded: true } : {}),
    });
  }

  return c.json({
    nfc_mode: 'home',
    tag_uid: tagId,
    message: 'Gold SyncTag 정품 NFC 태그입니다.',
    ...(unmapVerify ? { unmap_proof_recorded: true } : {}),
  });
});

// 골드바 정보 수정 API
app.put('/goldbars/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { serial_number, weight, purity, minted_at, tag_uid, cert_file_base64, file_name, status, cert_url } = await c.req.json();

    if (!serial_number || !weight) {
      return c.json({ error: 'Serial number and weight are required' }, 400);
    }

    // 자동 마이그레이션
    try {
      await c.env.DB.prepare("ALTER TABLE goldbars ADD COLUMN status TEXT DEFAULT 'CATALOG'").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN cert_url TEXT').run();
    } catch (_) {}

    // 1. 골드바 정보 갱신
    await c.env.DB.prepare(`
      UPDATE goldbars 
      SET serial_number = ?, weight = ?, purity = ?, minted_at = ?, status = ?, cert_url = ? 
      WHERE id = ?
    `).bind(serial_number, weight, purity || '99.99%', minted_at, status || 'CATALOG', cert_url || '', id).run();

    // 2. 인증서 파일이 Base64 형태로 전달된 경우 R2 버킷에 저장
    let certFilePath = `certificates/${serial_number}_cert.pdf`;
    if (file_name) {
      certFilePath = `certificates/${serial_number}_${file_name}`;
    }

    if (cert_file_base64) {
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

    // 3. 태그 및 보증서 매핑 정보 갱신
    if (tag_uid) {
      await ensureGoldbarTagPoolTable(c.env.DB);
      await removeTagFromGoldbarPool(c.env.DB, String(tag_uid).trim());
      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO certificates (goldbar_id, tag_uid, cert_file_path) 
        VALUES (?, ?, ?)
      `).bind(id, tag_uid, certFilePath).run();
    }

    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 골드바 정보 삭제 API
app.delete('/goldbars/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // 연관된 인증서와 골드바를 삭제 (ON DELETE CASCADE 처럼 개별 쿼리 실행)
    await c.env.DB.prepare('DELETE FROM certificates WHERE goldbar_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM goldbars WHERE id = ?').bind(id).run();
    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
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

    // 4. 가장 많이 스캔된 인기 골드바 Top 3 조회
    const { results: topGoldbars } = await c.env.DB.prepare(`
      SELECT g.serial_number, COUNT(l.id) as scan_count
      FROM goldbars g
      JOIN certificates c ON g.id = c.goldbar_id
      JOIN verification_logs l ON c.tag_uid = l.tag_uid
      GROUP BY g.id, g.serial_number
      ORDER BY scan_count DESC LIMIT 3
    `).all();

    return c.json({
      scanCount: (scanCount as any)?.cnt || 0,
      activeTags: (activeTags as any)?.cnt || 0,
      recentLogs,
      topGoldbars
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
// --- 전자 앨범 API ---

// 1. 특정 골드바의 전자 앨범 조회 및 자동 생성
app.get('/albums/:goldbarId', async (c) => {
  try {
    const goldbarId = c.req.param('goldbarId');
    
    // 자동 마이그레이션
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS digital_albums (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          goldbar_id INTEGER NOT NULL REFERENCES goldbars(id) ON DELETE CASCADE,
          title TEXT DEFAULT '나의 소중한 추억 앨범',
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS album_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          album_id INTEGER NOT NULL REFERENCES digital_albums(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          caption TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch (_) {}

    let album = await c.env.DB.prepare('SELECT * FROM digital_albums WHERE goldbar_id = ?').bind(goldbarId).first();
    
    if (!album) {
      await c.env.DB.prepare('INSERT INTO digital_albums (goldbar_id, title) VALUES (?, ?)')
        .bind(goldbarId, '나의 소중한 추억 앨범')
        .run();
      album = await c.env.DB.prepare('SELECT * FROM digital_albums WHERE goldbar_id = ?').bind(goldbarId).first();
    }

    const { results: images } = await c.env.DB.prepare('SELECT * FROM album_images WHERE album_id = ? ORDER BY created_at ASC')
      .bind((album as any).id)
      .all();

    return c.json({ album, images });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. 전자 앨범 사진 추가
app.post('/albums/:goldbarId/images', async (c) => {
  try {
    const goldbarId = c.req.param('goldbarId');
    const { image_file_base64, file_name, caption } = await c.req.json();

    if (!image_file_base64) {
      return c.json({ error: 'Image file is required' }, 400);
    }

    let album = await c.env.DB.prepare('SELECT * FROM digital_albums WHERE goldbar_id = ?').bind(goldbarId).first();
    if (!album) {
      await c.env.DB.prepare('INSERT INTO digital_albums (goldbar_id, title) VALUES (?, ?)')
        .bind(goldbarId, '나의 소중한 추억 앨범')
        .run();
      album = await c.env.DB.prepare('SELECT * FROM digital_albums WHERE goldbar_id = ?').bind(goldbarId).first();
    }

    // 사진 개수 제한 체크 (5장)
    const imagesCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM album_images WHERE album_id = ?')
      .bind((album as any).id)
      .first();
    if (imagesCount && (imagesCount as any).cnt >= 5) {
      return c.json({ error: '최대 5장까지만 등록 가능합니다.' }, 400);
    }

    // Base64 데이터를 ArrayBuffer로 변환 후 R2에 저장
    const base64Data = image_file_base64.split(',')[1] || image_file_base64;
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const ext = file_name ? file_name.split('.').pop() : 'png';
    const r2Path = `albums/images/${Date.now()}.${ext}`;
    await c.env.BUCKET.put(r2Path, bytes.buffer, {
      httpMetadata: { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
    });

    const savedImageUrl = `/api/albums/image/${r2Path}`;

    await c.env.DB.prepare('INSERT INTO album_images (album_id, image_url, caption) VALUES (?, ?, ?)')
      .bind((album as any).id, savedImageUrl, caption || '')
      .run();

    return c.json({ success: true, savedImageUrl });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. 앨범 사진 조회 API
app.get('/albums/image/albums/images/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const path = `albums/images/${filename}`;
    const object = await c.env.BUCKET.get(path);

    if (object === null) {
      return c.json({ error: 'Image not found in R2' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', filename.endsWith('png') ? 'image/png' : 'image/jpeg');

    return new Response(object.body, { headers });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. 전자 앨범 사진 삭제
app.delete('/albums/images/:imageId', async (c) => {
  try {
    const imageId = c.req.param('imageId');
    await c.env.DB.prepare('DELETE FROM album_images WHERE id = ?').bind(imageId).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- 일반 사용자 인증 및 동기화 API ---

// 1. 간편 회원 가입 (또는 로그인)
app.post('/user/auth', async (c) => {
  try {
    const { email, name } = await c.req.json();
    if (!email) return c.json({ error: '이메일 정보가 필요합니다.' }, 400);

    // 자동 마이그레이션
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS user_goldbars (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          goldbar_id INTEGER NOT NULL REFERENCES goldbars(id) ON DELETE CASCADE,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, goldbar_id)
        )
      `).run();
    } catch (_) {}

    // 유저 존재 여부 확인
    let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      const userId = `user_${Date.now()}`;
      await c.env.DB.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
        .bind(userId, email, name || '')
        .run();
      user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    }

    return c.json({ success: true, user });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 이메일·비밀번호 회원가입 (기존 무패스 유저는 최초 비밀번호 설정으로 업데이트)
app.post('/user/register', async (c) => {
  try {
    await ensureUsersPasswordColumn(c.env.DB);
    const { email, password, name } = await c.req.json();
    const em = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return c.json({ error: '유효한 이메일을 입력해 주세요.' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8) {
      return c.json({ error: '비밀번호는 8자 이상으로 설정해 주세요.' }, 400);
    }

    const hash = await hashUserPassword(em, password);
    const existing = (await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(em).first()) as Record<
      string,
      unknown
    > | null;

    if (existing) {
      if (existing.password_hash) {
        return c.json({ error: '이미 가입된 이메일입니다. 로그인 탭을 이용해 주세요.' }, 409);
      }
      const nextName =
        typeof name === 'string' && name.trim()
          ? name.trim()
          : ((existing.name as string) || '').trim() || '';
      await c.env.DB.prepare('UPDATE users SET password_hash = ?, name = ? WHERE email = ?')
        .bind(hash, nextName, em)
        .run();
      const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(em).first();
      return c.json({ success: true, user: sanitizeUserRow(user as any) });
    }

    const userId = `user_${Date.now()}`;
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)'
    )
      .bind(userId, em, typeof name === 'string' ? name : '', hash)
      .run();
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(em).first();
    return c.json({ success: true, user: sanitizeUserRow(user as any) }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 이메일·비밀번호 로그인
app.post('/user/login', async (c) => {
  try {
    await ensureUsersPasswordColumn(c.env.DB);
    const { email, password } = await c.req.json();
    const em = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!em || typeof password !== 'string') {
      return c.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, 400);
    }

    const user = (await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(em).first()) as Record<
      string,
      unknown
    > | null;
    if (!user || !user.password_hash) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    const hash = await hashUserPassword(em, password);
    if (hash !== user.password_hash) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    return c.json({ success: true, user: sanitizeUserRow(user) });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 소셜 로그인 연동 가능 여부 (클라이언트에서 버튼 활성화용)
app.get('/auth/providers', async (c) => {
  const google = !!(c.env as Bindings).GOOGLE_OAUTH_CLIENT_ID;
  const kakao = !!(c.env as Bindings).KAKAO_REST_API_KEY;
  return c.json({ google, kakao });
});

// 관리자: 등록된 사용자 목록 (시세 적용 시 선택용)
app.get('/admin/users', async (c) => {
  try {
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch (_) {}

    const { results } = await c.env.DB.prepare(
      `SELECT id, email, name FROM users ORDER BY LOWER(email)`
    ).all();
    return c.json(results || []);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 관리자가 특정 유저의 골드바 시세 노출 여부 및 1g당 시세를 수정하는 API
app.put('/admin/user-goldbars', async (c) => {
  try {
    const { userId, goldbarId, showMarketPrice, marketPricePerGram } = await c.req.json();
    if (!userId || !goldbarId) return c.json({ error: '유저 및 골드바 정보가 필요합니다.' }, 400);

    // 자동 마이그레이션
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_market_price INTEGER DEFAULT 0").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN market_price_per_gram REAL DEFAULT 110000").run();
    } catch (_) {}

    const result = await c.env.DB.prepare(`
      UPDATE user_goldbars 
      SET show_market_price = ?, market_price_per_gram = ?
      WHERE user_id = ? AND goldbar_id = ?
    `).bind(showMarketPrice ? 1 : 0, marketPricePerGram || 110000, userId, goldbarId).run();

    if ((result.meta?.changes ?? 0) === 0) {
      return c.json(
        { error: '해당 사용자와 골드바 연결(user_goldbars)이 없습니다. 소비자 지갑에 먼저 등록된 골드바만 시세를 설정할 수 있습니다.' },
        400
      );
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 관리자 대시보드에서 유저별 소유 골드바를 조회하는 API
app.get('/admin/user-goldbars', async (c) => {
  try {
    // DB 테이블 생성 및 마이그레이션 (실서버 D1 오류 방지용)
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch (_) {}

    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS user_goldbars (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          goldbar_id INTEGER NOT NULL,
          show_market_price INTEGER DEFAULT 0,
          market_price_per_gram REAL DEFAULT 110000,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, goldbar_id)
        )
      `).run();
    } catch (_) {}

    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_market_price INTEGER DEFAULT 0").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN market_price_per_gram REAL DEFAULT 110000").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN added_at DATETIME DEFAULT CURRENT_TIMESTAMP").run();
    } catch (_) {}

    const { results } = await c.env.DB.prepare(`
      SELECT ug.id, ug.user_id, ug.goldbar_id, ug.show_market_price, ug.market_price_per_gram, u.email as user_email, u.name as user_name, g.serial_number, g.weight, g.purity
      FROM user_goldbars ug
      LEFT JOIN users u ON ug.user_id = u.id
      LEFT JOIN goldbars g ON ug.goldbar_id = g.id
      ORDER BY ug.id DESC
    `).all();
    return c.json(results || []);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. 사용자의 소유 골드바 목록 조회 및 동기화
app.post('/user/sync', async (c) => {
  try {
    const { userId, goldbarIds } = await c.req.json();
    if (!userId) return c.json({ error: '인증이 필요합니다.' }, 401);

    // 자동 마이그레이션
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_market_price INTEGER DEFAULT 0").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN market_price_per_gram REAL DEFAULT 110000").run();
    } catch (_) {}

    // 로컬 스토리지에 담긴 골드바 ID를 서버에 동기화 (Insert Ignore)
    if (goldbarIds && Array.isArray(goldbarIds)) {
      for (const id of goldbarIds) {
        try {
          await c.env.DB.prepare('INSERT OR IGNORE INTO user_goldbars (user_id, goldbar_id) VALUES (?, ?)')
            .bind(userId, id)
            .run();
        } catch (_) {}
      }
    }

    // 최종 동기화된 모든 골드바 목록 반환
    const { results } = await c.env.DB.prepare(`
      SELECT g.*, c.tag_uid, c.cert_file_path, ug.show_market_price, ug.market_price_per_gram
      FROM user_goldbars ug
      JOIN goldbars g ON ug.goldbar_id = g.id
      LEFT JOIN certificates c ON g.id = c.goldbar_id
      WHERE ug.user_id = ?
      ORDER BY ug.id DESC
    `).bind(userId).all();

    return c.json({ success: true, syncGoldbars: results });
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
