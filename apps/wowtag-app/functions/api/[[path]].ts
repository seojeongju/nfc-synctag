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
  const { uid } = c.req.param();
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
  ];
  for (const sql of stmts) {
    try {
      await db.prepare(sql).run();
    } catch (_) {}
  }
}

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
    } = body;

    if (!name) return c.json({ error: 'Name is required' }, 400);

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

// 태그 매핑 (별도 수행 시 - 덮어쓰기 허용)
app.post('/tags', async (c) => {
  const { tag_uid, product_id } = await c.req.json();
  if (!tag_uid || !product_id) return c.json({ error: 'Invalid data' }, 400);

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, ?)'
  ).bind(tag_uid, product_id).run();

  return c.json({ success: true });
});

// 모든 NFC 태그 목록 및 매핑 조회 API
app.get('/tags', async (c) => {
  try {
    const { results: productTags } = await c.env.DB.prepare(`
      SELECT t.id, t.tag_uid, t.created_at, p.id as target_id, p.name as target_name, 'product' as target_type
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

    const allTags = [...productTags, ...goldbarTags];
    return c.json(allTags);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 특정 NFC 태그 매핑 해제 (삭제) API
app.delete('/tags/:uid', async (c) => {
  try {
    const uid = c.req.param('uid');
    
    // 1. 일반 제품 매핑 테이블에서 삭제
    await c.env.DB.prepare('DELETE FROM tags WHERE tag_uid = ?').bind(uid).run();

    // 2. 골드바 인증서 매핑 테이블에서 삭제
    await c.env.DB.prepare('DELETE FROM certificates WHERE tag_uid = ?').bind(uid).run();

    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
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
    return c.json({ error: 'not_found' }, 404);
  }

  c.executionCtx.waitUntil(
    c.env.DB.prepare('INSERT INTO scan_logs (tag_uid, scanned_at) VALUES (?, ?)')
      .bind(tagId, new Date().toISOString())
      .run()
  );

  return c.json(product);
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
