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

/** NFC 미연결 시에도 제품–보증서 연결을 위해 사용하는 예약 tag_uid (certificate 행 id 유지) */
function pendingCertificateTagUid(goldbarId: number): string {
  return `__PENDING_GB_${goldbarId}__`;
}

/** 휴대폰/라우터마다 UID 표기(콜론·대소문자)가 달라 DB `tag_uid`와 불일치할 수 있어 후보 생성 */
function nfcTagUidLookupVariants(param: string): string[] {
  const raw = decodeURIComponent(String(param || '')).trim();
  if (!raw) return [];
  const out = new Set<string>();
  out.add(raw);
  out.add(raw.toLowerCase());
  out.add(raw.toUpperCase());
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length >= 8) {
    out.add(hex.toLowerCase());
    out.add(hex.toUpperCase());
    const pairs = hex.match(/.{1,2}/g);
    if (pairs) {
      out.add(pairs.join(':'));
      out.add(pairs.join(':').toLowerCase());
    }
  }
  return [...out].filter(Boolean);
}

async function ensureGoldbarsDisplayNameColumn(db: D1Database) {
  try {
    await db.prepare('ALTER TABLE goldbars ADD COLUMN display_name TEXT').run();
  } catch (_) {}
}

/**
 * certificates 행이 하나도 없는 골드바에 대해 placeholder 행을 넣어 제품 연결 목록에 나오게 함
 * (과거: 보증서 PDF만 등록하고 NFC를 안 연결한 경우 테이블에 행이 없었음)
 */
async function ensureCertificateRowsForGoldbarsWithoutAny(db: D1Database) {
  await ensureGoldbarsDisplayNameColumn(db);
  try {
    await db.prepare(`
      INSERT INTO certificates (goldbar_id, tag_uid, cert_file_path)
      SELECT
        g.id,
        '__PENDING_GB_' || g.id || '__',
        'certificates/' || REPLACE(g.serial_number, '/', '_') || '_cert.pdf'
      FROM goldbars g
      WHERE NOT EXISTS (SELECT 1 FROM certificates c WHERE c.goldbar_id = g.id)
    `).run();
  } catch (_) {
    /* 동시 요청 등으로 실패해도 무시 */
  }
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
      SELECT g.*,
        (SELECT c2.tag_uid FROM certificates c2 WHERE c2.goldbar_id = g.id ORDER BY c2.issued_at DESC, c2.id DESC LIMIT 1) AS tag_uid,
        (SELECT c2f.cert_file_path FROM certificates c2f WHERE c2f.goldbar_id = g.id ORDER BY c2f.issued_at DESC, c2f.id DESC LIMIT 1) AS cert_file_path,
        (SELECT COUNT(*) FROM certificates c3 WHERE c3.goldbar_id = g.id) AS cert_count
      FROM goldbars g
      ORDER BY g.created_at DESC
    `).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 골드바별 인증서(보증서)에 매칭된 NFC UID 전체 목록 (관리자)
app.get('/goldbars/:id/tag-uids', async (c) => {
  try {
    if (!verifyAdminToken(c)) {
      return c.json({ error: '관리자 인증이 필요합니다.' }, 401);
    }
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      `SELECT tag_uid FROM certificates WHERE goldbar_id = ? ORDER BY issued_at DESC, id DESC`
    )
      .bind(id)
      .all();
    const tag_uids = (results as { tag_uid: string }[]).map((r) => r.tag_uid);
    return c.json({ tag_uids });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 골드바 및 보증서 등록
app.post('/goldbars', async (c) => {
  try {
    const body = await c.req.json();
    const {
      serial_number,
      weight,
      purity,
      minted_at,
      tag_uid,
      cert_file_base64,
      file_name,
      status,
      cert_url,
      display_name,
    } = body;

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
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN display_name TEXT').run();
    } catch (_) {}

    // 1. 골드바 정보 저장
    const insertGoldbar = await c.env.DB.prepare(`
      INSERT OR REPLACE INTO goldbars (serial_number, weight, purity, minted_at, status, cert_url, display_name)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
    `)
      .bind(
        serial_number,
        weight,
        purity || '99.99%',
        minted_at ?? '',
        status || 'CATALOG',
        cert_url || '',
        typeof display_name === 'string' ? display_name : ''
      )
      .first();

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
    } else if (cert_file_base64) {
      // 보증서 파일만 올리고 NFC는 나중에 연결하는 경우 — 제품 연결용 certificate 행 필요
      const synthetic = pendingCertificateTagUid(goldbarId);
      await c.env.DB.prepare(
        `INSERT INTO certificates (goldbar_id, tag_uid, cert_file_path) VALUES (?, ?, ?)`
      )
        .bind(goldbarId, synthetic, certFilePath)
        .run();
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

// 특정 NFC 태그로 골드바 정품인증 정보 조회 — (1) 인증서 연결 골드바 (2) tags·카탈로그 제품 매칭
app.get('/goldbars/t/:tagId', async (c) => {
  try {
    const param = c.req.param('tagId');
    const variants = nfcTagUidLookupVariants(param);
    if (variants.length === 0) {
      return c.json({ error: 'not_found' }, 404);
    }

    const certQuery = `
      SELECT 
        g.*, c.tag_uid, c.cert_file_path,
        CASE 
          WHEN g.show_market_price = 1 
               AND (g.show_start_at IS NULL OR g.show_start_at = '' OR g.show_start_at <= ?)
               AND (g.show_end_at IS NULL OR g.show_end_at = '' OR g.show_end_at >= ?)
          THEN 1 
          ELSE 0 
        END as show_market_price,
        g.market_price_per_gram
      FROM goldbars g
      JOIN certificates c ON g.id = c.goldbar_id
      WHERE c.tag_uid = ?
    `;

    let matchedUid: string | null = null;
    let goldbar: Record<string, unknown> | null = null;
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    for (const v of variants) {
      const row = await c.env.DB.prepare(certQuery).bind(now, now, v).first();
      if (row) {
        goldbar = row as Record<string, unknown>;
        matchedUid = v;
        break;
      }
    }

    if (goldbar && matchedUid) {
      c.executionCtx.waitUntil(
        c.env.DB
          .prepare('INSERT INTO verification_logs (tag_uid, scanned_at, is_valid) VALUES (?, ?, ?)')
          .bind(matchedUid, new Date().toISOString(), 1)
          .run()
      );
      const expiry = Date.now() + 10 * 60 * 1000;
      const downloadToken = btoa(`${matchedUid}:${expiry}`);
      return c.json({
        ...goldbar,
        wallet_source: 'goldbar_cert',
        download_token: downloadToken
      });
    }

    const productQuery = `
      SELECT p.*, t.tag_uid AS mapped_tag_uid
      FROM tags t
      INNER JOIN products p ON p.id = t.product_id
      WHERE t.tag_uid = ?
    `;
    let productRow: Record<string, unknown> | null = null;
    for (const v of variants) {
      const row = await c.env.DB.prepare(productQuery).bind(v).first();
      if (row) {
        productRow = row as Record<string, unknown>;
        matchedUid = v;
        break;
      }
    }

    if (productRow && matchedUid) {
      const pid = Number(productRow.id);
      c.executionCtx.waitUntil(
        c.env.DB
          .prepare('INSERT INTO verification_logs (tag_uid, scanned_at, is_valid) VALUES (?, ?, ?)')
          .bind(matchedUid, new Date().toISOString(), 1)
          .run()
      );
      return c.json({
        id: `product_${pid}`,
        wallet_source: 'catalog_product',
        name: (productRow.name as string) || '',
        description: (productRow.description as string) || '',
        options: (productRow.options as string) || '',
        material: (productRow.material as string) || '',
        video_url: (productRow.video_url as string) || '',
        manual_url: (productRow.manual_url as string) || '',
        serial_number: (productRow.name as string) || String(matchedUid),
        weight: (productRow.weight as string) || '',
        purity: (productRow.purity as string) || '',
        minted_at: '',
        image_url: (productRow.image_url as string) || '',
        product_id: pid,
        mapped_tag_uid: matchedUid,
        tag_uid: matchedUid,
        show_market_price: 0,
        cert_url: null,
        download_token: null
      });
    }

    return c.json({ error: 'not_found' }, 404);
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
    const certPath = String(cert.cert_file_path);
    headers.set('Content-Disposition', `attachment; filename="${certPath.split('/').pop()}"`);

    return new Response(object.body, { headers });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 등록된 정품인증서(보증서) 행 목록 — 제품 등록 시 선택용 (골드바 일련번호 + 표시명 + NFC UID)
app.get('/certificates', async (c) => {
  try {
    await ensureGoldbarsDisplayNameColumn(c.env.DB);
    await ensureCertificateRowsForGoldbarsWithoutAny(c.env.DB);

    const rawQ = (c.req.query('q') || '').trim();
    const q = rawQ.length > 0 ? rawQ : '';

    let sql = `
      SELECT c.id, c.goldbar_id, c.tag_uid, c.cert_file_path, g.serial_number, g.display_name
      FROM certificates c
      JOIN goldbars g ON g.id = c.goldbar_id
    `;
    const binds: string[] = [];
    if (q) {
      const needle = q.toLowerCase();
      sql += `
      WHERE
        INSTR(LOWER(IFNULL(g.serial_number, '')), ?) > 0
        OR INSTR(LOWER(IFNULL(g.display_name, '')), ?) > 0
        OR INSTR(LOWER(IFNULL(c.tag_uid, '')), ?) > 0
      `;
      binds.push(needle, needle, needle);
    }
    sql += ` ORDER BY c.issued_at DESC, c.id DESC`;

    const stmt = binds.length ? c.env.DB.prepare(sql).bind(...binds) : c.env.DB.prepare(sql);
    const { results } = await stmt.all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 제품 목록 조회
app.get('/products', async (c) => {
  try {
    await migrateProductsExtraColumns(c.env.DB);
    const { results } = await c.env.DB.prepare(`
      SELECT
        p.*,
        c.tag_uid AS cert_tag_uid,
        g.serial_number AS cert_serial_number,
        g.display_name AS cert_display_name
      FROM products p
      LEFT JOIN certificates c ON p.certificate_id = c.id
      LEFT JOIN goldbars g ON c.goldbar_id = g.id
      ORDER BY p.created_at DESC
    `).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
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
    'ALTER TABLE products ADD COLUMN certificate_id INTEGER',
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

async function ensureGoldbarsAssetColumns(db: D1Database) {
  const stmts = [
    "ALTER TABLE goldbars ADD COLUMN status TEXT DEFAULT 'TAGGED'",
    "ALTER TABLE goldbars ADD COLUMN display_name TEXT",
    "ALTER TABLE goldbars ADD COLUMN show_market_price INTEGER DEFAULT 0",
    "ALTER TABLE goldbars ADD COLUMN market_price_per_gram REAL",
    "ALTER TABLE goldbars ADD COLUMN show_start_at TEXT",
    "ALTER TABLE goldbars ADD COLUMN show_end_at TEXT"
  ];
  for (const sql of stmts) {
    try {
      await db.prepare(sql).run();
    } catch (_) {}
  }
}

/**
 * [신규] 태그 매칭(제품 연동) 시 해당 태그를 위한 자산(Goldbar) 레코드를 보장합니다.
 * '태그가 매칭되었다는 것은 자산이 생성되었다'는 원칙을 구현하며, 제품에 연결된 보증서 템플릿이 있다면 이를 자동 상속합니다.
 */
async function ensureAssetForTag(db: D1Database, tagUid: string, productId?: number | null) {
  // 스키마 보장
  await ensureGoldbarsAssetColumns(db);

  // 1. 이미 certificates에 연결된 goldbar가 있는지 확인
  const existing = await db.prepare(`
    SELECT g.id, g.status FROM goldbars g
    INNER JOIN certificates c ON g.id = c.goldbar_id
    WHERE c.tag_uid = ?
    LIMIT 1
  `).bind(tagUid).first();

  // 이미 보증서가 발행된(CERTIFIED) 상태라면 기존 ID 반환
  if (existing) return (existing as any).id;

  let name = "";
  let weight = "0";
  let purity = "24K";
  let templateCertPath = "";

  if (productId) {
    // 제품 정보 및 카탈로그 보증서 템플릿 정보 조회
    const product = await db.prepare(`
      SELECT p.name, p.weight, p.purity,
             c.cert_file_path as template_cert_path,
             g.weight as template_weight,
             g.purity as template_purity
      FROM products p
      LEFT JOIN certificates c ON p.certificate_id = c.id
      LEFT JOIN goldbars g ON c.goldbar_id = g.id
      WHERE p.id = ?
    `).bind(productId).first();

    if (product) {
      const p = product as any;
      name = p.name;
      // 제품 자체 정보 우선, 없으면 템플릿(카탈로그) 정보 사용
      weight = p.weight || p.template_weight || "0";
      purity = p.purity || p.template_purity || "24K";
      templateCertPath = p.template_cert_path || "";
    }
  }

  // 2. 새로운 goldbar 생성 (자산화)
  // 제품과 매칭된 상태이므로 상태를 'SHIPPED'(출고/정품인증)로 설정합니다.
  const serial = `ASSET-${tagUid.slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
  
  const result = await db.prepare(`
    INSERT INTO goldbars (serial_number, weight, purity, status, display_name)
    VALUES (?, ?, ?, ?, ?)
  `)
  .bind(
    serial,
    weight,
    purity,
    'SHIPPED', // 제품 매칭 시 즉시 출고/인증 상태로 전환
    name || '신규 매칭 자산'
  )
  .run();

  const newGoldbarId = result.meta.last_row_id;

  // 3. certificates 테이블에 연결 (자동 발행)
  // 템플릿 보증서 파일이 있다면 해당 경로를 사용하고, 없으면 기본 경로를 생성합니다.
  const certFilePath = templateCertPath || `certificates/auto_${serial}.pdf`;

  await db.prepare(`
    INSERT OR REPLACE INTO certificates (goldbar_id, tag_uid, issued_at, cert_file_path)
    VALUES (?, ?, ?, ?)
  `)
  .bind(newGoldbarId, tagUid, new Date().toISOString(), certFilePath)
  .run();

  // 골드바 자산 풀에서 해당 태그 제거 (풀에 있었을 경우)
  await removeTagFromGoldbarPool(db, tagUid);

  return newGoldbarId;
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
      certificate_id,
    } = body;

    if (!name) return c.json({ error: 'Name is required' }, 400);

    let certId: number | null = null;
    if (certificate_id !== undefined && certificate_id !== null && certificate_id !== '') {
      const n = Number(certificate_id);
      if (!Number.isFinite(n) || n <= 0) {
        return c.json({ error: '유효하지 않은 certificate_id 입니다.' }, 400);
      }
      const row = await c.env.DB.prepare('SELECT id FROM certificates WHERE id = ?').bind(n).first();
      if (!row) {
        return c.json({ error: '존재하지 않는 인증서입니다.' }, 400);
      }
      certId = n;
    }

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
        material, purity, weight, width_mm, height_mm, price, memo, certificate_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
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
        memo ?? '',
        certId
      )
      .first();

    const productId = (productResult as any).id;

    // 3. 태그 UID가 함께 전달된 경우 즉시 매핑 (덮어쓰기 허용)
    if (tag_uid) {
      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO tags (tag_uid, product_id) VALUES (?, ?)'
      ).bind(tag_uid, productId).run();
      
      // 자산 생성 보장
      await ensureAssetForTag(c.env.DB, tag_uid, productId);
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

    const rawId = c.req.param('id');
    const idMatch = String(rawId).match(/^(?:product_)?(\d+)$/);
    if (!idMatch) {
      return c.json({ error: '유효하지 않은 제품 ID입니다.' }, 400);
    }
    const id = idMatch[1];
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

    let certIdPut: number | null = null;
    const rawCert = body.certificate_id;
    if (rawCert !== undefined && rawCert !== null && rawCert !== '') {
      const n = Number(rawCert);
      if (!Number.isFinite(n) || n <= 0) {
        return c.json({ error: '유효하지 않은 certificate_id 입니다.' }, 400);
      }
      const row = await c.env.DB.prepare('SELECT id FROM certificates WHERE id = ?').bind(n).first();
      if (!row) {
        return c.json({ error: '존재하지 않는 인증서입니다.' }, 400);
      }
      certIdPut = n;
    }

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

    let updateResult: D1Result<unknown> | null = null;

    if (soldInBody && sold === true) {
      const mark = new Date().toISOString();
      updateResult = await c.env.DB.prepare(`
      UPDATE products 
      SET name = ?, description = ?, video_url = ?, manual_url = ?, image_url = ?, options = ?,
          material = ?, purity = ?, weight = ?, width_mm = ?, height_mm = ?, price = ?, memo = ?,
          certificate_id = ?,
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
          certIdPut,
          mark,
          id
        )
        .run();
    } else if (soldInBody && sold === false) {
      updateResult = await c.env.DB.prepare(`
      UPDATE products 
      SET name = ?, description = ?, video_url = ?, manual_url = ?, image_url = ?, options = ?,
          material = ?, purity = ?, weight = ?, width_mm = ?, height_mm = ?, price = ?, memo = ?,
          certificate_id = ?,
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
          certIdPut,
          id
        )
        .run();
    } else {
      updateResult = await c.env.DB.prepare(`
      UPDATE products 
      SET name = ?, description = ?, video_url = ?, manual_url = ?, image_url = ?, options = ?,
          material = ?, purity = ?, weight = ?, width_mm = ?, height_mm = ?, price = ?, memo = ?,
          certificate_id = ?
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
          certIdPut,
          id
        )
        .run();
    }

    if ((updateResult?.meta?.changes ?? 0) === 0) {
      return c.json({ error: '수정할 제품을 찾지 못했습니다.' }, 404);
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

    // 자산 생성 보장 (매칭 = 자산 생성)
    await ensureAssetForTag(c.env.DB, rawUid, pid);

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

    // 자산 생성 보장 (매칭 = 자산 생성)
    await ensureAssetForTag(c.env.DB, rawUid, pid);

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
  const param = c.req.param('tagId');
  const unmapVerify = c.req.query('unmap_verify') === '1';

  await ensureGoldbarTagPoolTable(c.env.DB);

  const variants = nfcTagUidLookupVariants(param);
  if (variants.length === 0) {
    return c.json({ error: 'not_found' }, 404);
  }

  const tagSql = `
    SELECT t.tag_uid, t.product_id, p.id as product_pk
    FROM tags t
    LEFT JOIN products p ON p.id = t.product_id
    WHERE t.tag_uid = ?
  `;

  let row: {
    tag_uid: string;
    product_id: any;
    product_pk: any;
  } | null = null;
  for (const v of variants) {
    const r = (await c.env.DB.prepare(tagSql).bind(v).first()) as any;
    if (r) {
      row = {
        tag_uid: String(r.tag_uid),
        product_id: r.product_id,
        product_pk: r.product_pk
      };
      break;
    }
  }

  let poolRow: { tag_uid: string } | null = null;
  if (!row) {
    for (const v of variants) {
      const p = await c.env.DB.prepare('SELECT tag_uid FROM goldbar_tag_pool WHERE tag_uid = ?').bind(v).first();
      if (p) {
        poolRow = p as { tag_uid: string };
        break;
      }
    }
  }

  /** tags/풀에 없고 골드바 인증서(certificates)에만 연결된 실제 NFC UID */
  let certOnlyUid: string | null = null;
  if (!row && !poolRow) {
    for (const v of variants) {
      const cr = await c.env.DB
        .prepare(
          `SELECT c.tag_uid FROM certificates c
           WHERE c.tag_uid = ? AND c.tag_uid NOT LIKE '__PENDING%'
           LIMIT 1`
        )
        .bind(v)
        .first();
      if (cr && (cr as { tag_uid: string }).tag_uid) {
        certOnlyUid = (cr as { tag_uid: string }).tag_uid;
        break;
      }
    }
  }

  if (!row && !poolRow && !certOnlyUid) {
    return c.json({ error: 'not_found' }, 404);
  }

  const canonicalUid: string = (row?.tag_uid || poolRow?.tag_uid || certOnlyUid || param) as string;

  c.executionCtx.waitUntil(
    c.env.DB
      .prepare('INSERT INTO scan_logs (tag_uid, scanned_at) VALUES (?, ?)')
      .bind(canonicalUid, new Date().toISOString())
      .run()
  );

  if (unmapVerify) {
    await ensureTagUnmapProofsTable(c.env.DB);
    const now = new Date().toISOString();
    await c.env.DB.prepare('INSERT INTO tag_unmap_proofs (tag_uid, created_at) VALUES (?, ?)').bind(canonicalUid, now).run();
  }

  if (poolRow) {
    return c.json({
      nfc_mode: 'home',
      tag_uid: canonicalUid,
      message:
        '등록된 NFC 태그입니다. 인증서가 연결되면 스캔 시 정품 정보를 확인할 수 있습니다.',
      goldbar_pool_only: true,
      ...(unmapVerify ? { unmap_proof_recorded: true } : {}),
    });
  }

  if (!row) {
    if (certOnlyUid) {
      return c.json({
        nfc_mode: 'home',
        tag_uid: canonicalUid,
        message: 'Gold SyncTag 정품 NFC 태그입니다.',
        goldbar_cert_linked: true,
        ...(unmapVerify ? { unmap_proof_recorded: true } : {})
      });
    }
    return c.json({ error: 'not_found' }, 404);
  }

  // row가 존재하는 경우 (위에서 !row 체크로 걸러짐)
  const activeRow = row!;
  if (activeRow.product_id == null || activeRow.product_pk == null) {
    return c.json({
      nfc_mode: 'asset',
      tag_uid: canonicalUid,
      message: '출고 전 등록된 자산 태그입니다.',
      ...(unmapVerify ? { unmap_proof_recorded: true } : {}),
    });
  }

  return c.json({
    nfc_mode: 'home',
    tag_uid: canonicalUid,
    message: 'Gold SyncTag 정품 NFC 태그입니다.',
    ...(unmapVerify ? { unmap_proof_recorded: true } : {}),
  });
});

// 골드바 정보 수정 API
app.put('/goldbars/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const {
      serial_number,
      weight,
      purity,
      minted_at,
      tag_uid,
      cert_file_base64,
      file_name,
      status,
      cert_url,
      display_name,
      show_market_price,
      market_price_per_gram,
      show_start_at,
      show_end_at,
    } = body;

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
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN display_name TEXT').run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN show_market_price INTEGER DEFAULT 0').run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN market_price_per_gram REAL').run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN show_start_at TEXT').run();
    } catch (_) {}
    try {
      await c.env.DB.prepare('ALTER TABLE goldbars ADD COLUMN show_end_at TEXT').run();
    } catch (_) {}

    // 1. 골드바 정보 갱신
    await c.env.DB.prepare(`
      UPDATE goldbars 
      SET serial_number = ?, weight = ?, purity = ?, minted_at = ?, status = ?, cert_url = ?, display_name = ?,
          show_market_price = ?, market_price_per_gram = ?, show_start_at = ?, show_end_at = ?
      WHERE id = ?
    `)
      .bind(
        serial_number,
        weight,
        purity || '99.99%',
        minted_at ?? '',
        status || 'CATALOG',
        cert_url || '',
        typeof display_name === 'string' ? display_name : '',
        show_market_price ? 1 : 0,
        market_price_per_gram || null,
        show_start_at || null,
        show_end_at || null,
        id
      )
      .run();

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
    } else {
      const existingPath = await c.env.DB.prepare(
        'SELECT cert_file_path FROM certificates WHERE goldbar_id = ? ORDER BY issued_at DESC, id DESC LIMIT 1'
      )
        .bind(id)
        .first();
      if (existingPath && (existingPath as { cert_file_path: string }).cert_file_path) {
        certFilePath = (existingPath as { cert_file_path: string }).cert_file_path;
      }
    }

    const idNum = Number(id);
    const pendingUid = pendingCertificateTagUid(idNum);
    const trimmedTag = tag_uid && String(tag_uid).trim() ? String(tag_uid).trim() : '';

    // 3. 태그 및 보증서 매핑 정보 갱신
    if (trimmedTag) {
      await ensureGoldbarTagPoolTable(c.env.DB);
      await removeTagFromGoldbarPool(c.env.DB, trimmedTag);
      const pendingRow = await c.env.DB.prepare('SELECT id FROM certificates WHERE goldbar_id = ? AND tag_uid = ?')
        .bind(id, pendingUid)
        .first();
      if (pendingRow) {
        await c.env.DB.prepare('UPDATE certificates SET tag_uid = ?, cert_file_path = ? WHERE id = ?')
          .bind(trimmedTag, certFilePath, (pendingRow as { id: number }).id)
          .run();
      } else {
        await c.env.DB
          .prepare(
            `INSERT INTO certificates (goldbar_id, tag_uid, cert_file_path) VALUES (?, ?, ?)`
          )
          .bind(id, trimmedTag, certFilePath)
          .run();
      }
    } else if (cert_file_base64) {
      const pendingRow = await c.env.DB.prepare('SELECT id FROM certificates WHERE goldbar_id = ? AND tag_uid = ?')
        .bind(id, pendingUid)
        .first();
      if (pendingRow) {
        await c.env.DB.prepare('UPDATE certificates SET cert_file_path = ? WHERE id = ?')
          .bind(certFilePath, (pendingRow as { id: number }).id)
          .run();
      } else {
        const latest = await c.env.DB.prepare(
          'SELECT id FROM certificates WHERE goldbar_id = ? ORDER BY issued_at DESC, id DESC LIMIT 1'
        )
          .bind(id)
          .first();
        if (latest) {
          await c.env.DB.prepare('UPDATE certificates SET cert_file_path = ? WHERE id = ?')
            .bind(certFilePath, (latest as { id: number }).id)
            .run();
        } else {
          await c.env.DB
            .prepare(`INSERT INTO certificates (goldbar_id, tag_uid, cert_file_path) VALUES (?, ?, ?)`)
            .bind(id, pendingUid, certFilePath)
            .run();
        }
      }
    }

    return c.json({ success: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 특정 태그(NFC)를 기반으로 자산(Goldbar) 레코드 생성 또는 연결 API
app.post('/goldbars/by-tag/:tagUid', async (c) => {
  try {
    if (!verifyAdminToken(c)) {
      return c.json({ error: '관리자 인증이 필요합니다.' }, 401);
    }
    const tagUid = c.req.param('tagUid');
    const body = await c.req.json();
    const {
      market_price_per_gram,
      show_market_price,
      show_start_at,
      show_end_at,
      serial_number,
      weight,
      purity,
      display_name
    } = body;

    // 1. 이미 해당 태그에 연결된 goldbar가 있는지 확인
    const existing = await c.env.DB.prepare(`
      SELECT g.id FROM goldbars g
      INNER JOIN certificates c ON g.id = c.goldbar_id
      WHERE c.tag_uid = ?
      LIMIT 1
    `).bind(tagUid).first();

    if (existing) {
      // 이미 있으면 업데이트로 전환 (또는 오류 반환)
      // 여기서는 편의상 업데이트 수행
      await c.env.DB.prepare(`
        UPDATE goldbars 
        SET market_price_per_gram = ?, show_market_price = ?, show_start_at = ?, show_end_at = ?
        WHERE id = ?
      `)
      .bind(market_price_per_gram || null, show_market_price ? 1 : 0, show_start_at || null, show_end_at || null, (existing as any).id)
      .run();
      return c.json({ success: true, id: (existing as any).id });
    }

    // 2. 새로운 goldbar 생성
    const result = await c.env.DB.prepare(`
      INSERT INTO goldbars (serial_number, weight, purity, status, display_name, market_price_per_gram, show_market_price, show_start_at, show_end_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      serial_number || `AUTO-${Date.now()}`,
      weight || '0',
      purity || '24K',
      'TAGGED',
      display_name || '',
      market_price_per_gram || null,
      show_market_price ? 1 : 0,
      show_start_at || null,
      show_end_at || null
    )
    .run();

    const newGoldbarId = result.meta.last_row_id;

    // 3. certificates 테이블에 연결
    await c.env.DB.prepare(`
      INSERT INTO certificates (goldbar_id, tag_uid, issued_at)
      VALUES (?, ?, ?)
    `)
    .bind(newGoldbarId, tagUid, new Date().toISOString())
    .run();

    return c.json({ success: true, id: newGoldbarId }, 201);
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
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS verification_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tag_uid TEXT NOT NULL,
          scanned_at TEXT NOT NULL,
          is_valid INTEGER DEFAULT 1
        )
      `).run();
    } catch (_) {}

    const scanCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM verification_logs').first();

    const scanToday = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM verification_logs WHERE date(scanned_at) = date('now')`
    ).first();

    const activeTags = await c.env.DB.prepare('SELECT COUNT(DISTINCT tag_uid) as cnt FROM verification_logs').first();

    let tagsRegistered: { cnt?: number } = { cnt: 0 };
    let tagsLinked: { cnt?: number } = { cnt: 0 };
    try {
      tagsRegistered =
        (await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM tags').first()) || tagsRegistered;
      tagsLinked =
        (await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM tags WHERE product_id IS NOT NULL').first()) ||
        tagsLinked;
    } catch (_) {
      /* tags 미마이그레이션 */
    }

    let userCount: { cnt?: number } = { cnt: 0 };
    try {
      await c.env.DB
        .prepare(
          `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
        )
        .run();
      userCount = (await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first()) || userCount;
    } catch (_) {
      /* users 테이블 없음 */
    }

    const logsLimit = Number(c.req.query('logsLimit')) || 12;
    const logsOffset = Number(c.req.query('logsOffset')) || 0;

    const recentLogsRaw = await c.env.DB.prepare(`
      SELECT
        l.id,
        l.tag_uid,
        l.scanned_at,
        l.is_valid,
        COALESCE(
          (SELECT g.serial_number FROM certificates c
           INNER JOIN goldbars g ON g.id = c.goldbar_id
           WHERE c.tag_uid = l.tag_uid LIMIT 1),
          (SELECT p.name FROM tags t
           INNER JOIN products p ON p.id = t.product_id
           WHERE t.tag_uid = l.tag_uid LIMIT 1),
          l.tag_uid
        ) AS display_label
      FROM verification_logs l
      ORDER BY l.scanned_at DESC
      LIMIT ? OFFSET ?
    `).bind(logsLimit, logsOffset).all();

    const topScanned = await c.env.DB.prepare(`
      WITH tag_cnt AS (
        SELECT tag_uid, COUNT(*) AS scan_count
        FROM verification_logs
        GROUP BY tag_uid
      )
      SELECT
        tag_cnt.tag_uid AS tag_uid,
        tag_cnt.scan_count AS scan_count,
        COALESCE(
          (SELECT g.serial_number FROM certificates c
           INNER JOIN goldbars g ON g.id = c.goldbar_id
           WHERE c.tag_uid = tag_cnt.tag_uid LIMIT 1),
          (SELECT p.name FROM tags t
           INNER JOIN products p ON p.id = t.product_id
           WHERE t.tag_uid = tag_cnt.tag_uid LIMIT 1),
          tag_cnt.tag_uid
        ) AS display_label
      FROM tag_cnt
      ORDER BY tag_cnt.scan_count DESC
      LIMIT 3
    `).all();

    const recentLogs = (recentLogsRaw.results || []).map((row: Record<string, unknown>) => ({
      ...row,
      serial_number: row.display_label
    }));

    const topRows = topScanned.results || [];
    const topGoldbars = topRows.map((r: Record<string, unknown>) => ({
      serial_number: r.display_label,
      scan_count: r.scan_count,
      tag_uid: r.tag_uid
    }));

    return c.json({
      scanCount: Number((scanCount as any)?.cnt || 0),
      scanCountToday: Number((scanToday as any)?.cnt || 0),
      activeTags: Number((activeTags as any)?.cnt || 0),
      tagsRegistered: Number((tagsRegistered as any)?.cnt || 0),
      tagsLinked: Number((tagsLinked as any)?.cnt || 0),
      userCount: Number((userCount as any)?.cnt ?? 0),
      recentLogs,
      topGoldbars,
      topScanned: topRows
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 관리자: 자산(태그+보증서+매칭제품) 통합 조회 API
app.get('/admin/assets', async (c) => {
  try {
    if (!verifyAdminToken(c)) {
      return c.json({ error: '관리자 인증이 필요합니다.' }, 401);
    }
    // 스키마 보장
    await ensureGoldbarsAssetColumns(c.env.DB);

    // 자산 중심 조회: 골드바(보증서) 기준 + 보증서가 없더라도 제품과 매칭된 태그를 모두 포함
    const { results } = await c.env.DB.prepare(`
      SELECT 
        g.id, g.serial_number, g.weight, g.purity, g.status, g.display_name,
        g.market_price_per_gram, g.show_market_price, g.show_start_at, g.show_end_at,
        c.tag_uid,
        COALESCE(t.created_at, g.created_at) as matching_date,
        COALESCE(p.name, g.display_name, g.serial_number) as product_name
      FROM goldbars g
      LEFT JOIN certificates c ON g.id = c.goldbar_id
      LEFT JOIN tags t ON c.tag_uid = t.tag_uid
      LEFT JOIN products p ON t.product_id = p.id
      
      UNION ALL
      
      SELECT 
        null as id, null as serial_number, p.weight, p.purity, 'TAGGED' as status, null as display_name,
        null as market_price_per_gram, 0 as show_market_price, null as show_start_at, null as show_end_at,
        t.tag_uid,
        t.created_at as matching_date,
        p.name as product_name
      FROM tags t
      JOIN products p ON t.product_id = p.id
      WHERE t.product_id IS NOT NULL 
        AND t.tag_uid NOT IN (SELECT tag_uid FROM certificates WHERE tag_uid IS NOT NULL)
      
      ORDER BY matching_date DESC
    `).all();

    return c.json(results);
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
    const { userId, goldbarId, showMarketPrice, marketPricePerGram, showStart, showEnd } = await c.req.json();
    if (!userId || !goldbarId) return c.json({ error: '유저 및 골드바 정보가 필요합니다.' }, 400);

    // 자동 마이그레이션
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_market_price INTEGER DEFAULT 0").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN market_price_per_gram REAL DEFAULT 110000").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_start_at TEXT").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_end_at TEXT").run();
    } catch (_) {}

    const result = await c.env.DB.prepare(`
      UPDATE user_goldbars 
      SET show_market_price = ?, market_price_per_gram = ?, show_start_at = ?, show_end_at = ?
      WHERE user_id = ? AND goldbar_id = ?
    `).bind(
      showMarketPrice ? 1 : 0, 
      marketPricePerGram || 110000, 
      showStart || null, 
      showEnd || null, 
      userId, 
      goldbarId
    ).run();

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

/** [신규] 관리자: 소유권 해지 요청 목록 조회 */
app.get('/admin/release-requests', async (c) => {
  try {
    // 자동 마이그레이션
    try {
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS ownership_release_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          goldbar_id INTEGER NOT NULL,
          status TEXT DEFAULT 'PENDING',
          message TEXT,
          requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          handled_at DATETIME
        )
      `).run();
    } catch (_) {}

    const { results } = await c.env.DB.prepare(`
      SELECT 
        orr.*, u.email as user_email, u.name as user_name, 
        g.serial_number, g.weight
      FROM ownership_release_requests orr
      JOIN users u ON orr.user_id = u.id
      JOIN goldbars g ON orr.goldbar_id = g.id
      WHERE orr.status = 'PENDING'
      ORDER BY orr.requested_at DESC
    `).all();

    return c.json(results || []);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** [신규] 관리자: 소유권 해지 요청 승인 또는 반려 */
app.put('/admin/release-requests/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { action } = await c.req.json(); // 'APPROVE' or 'REJECT'

    const request = await c.env.DB.prepare('SELECT * FROM ownership_release_requests WHERE id = ?')
      .bind(id)
      .first() as any;

    if (!request) return c.json({ error: '요청을 찾을 수 없습니다.' }, 404);

    const now = new Date().toISOString();

    if (action === 'APPROVE') {
      // 1. 실제 소유권 데이터 삭제 (user_goldbars)
      await c.env.DB.prepare('DELETE FROM user_goldbars WHERE user_id = ? AND goldbar_id = ?')
        .bind(request.user_id, request.goldbar_id)
        .run();
      
      // 2. 요청 상태 업데이트
      await c.env.DB.prepare('UPDATE ownership_release_requests SET status = ?, handled_at = ? WHERE id = ?')
        .bind('APPROVED', now, id)
        .run();
    } else {
      // 반려
      await c.env.DB.prepare('UPDATE ownership_release_requests SET status = ?, handled_at = ? WHERE id = ?')
        .bind('REJECTED', now, id)
        .run();
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
          show_start_at TEXT,
          show_end_at TEXT,
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
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_start_at TEXT").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN show_end_at TEXT").run();
    } catch (_) {}
    try {
      await c.env.DB.prepare("ALTER TABLE user_goldbars ADD COLUMN added_at DATETIME DEFAULT CURRENT_TIMESTAMP").run();
    } catch (_) {}

    const { results } = await c.env.DB.prepare(`
      SELECT 
        ug.id, ug.user_id, ug.goldbar_id, ug.show_market_price, ug.market_price_per_gram, 
        ug.show_start_at, ug.show_end_at,
        u.email as user_email, u.name as user_name, g.serial_number, g.weight, g.purity
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

    // 최종 동기화된 모든 골드바 목록 반환 (시세 노출 날짜 조건 추가 및 해지 요청 상태 JOIN)
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { results } = await c.env.DB.prepare(`
      SELECT 
        g.*, c.tag_uid, c.cert_file_path, 
        CASE 
          WHEN ug.show_market_price = 1 
               AND (ug.show_start_at IS NULL OR ug.show_start_at <= ?)
               AND (ug.show_end_at IS NULL OR ug.show_end_at >= ?)
          THEN 1 
          ELSE 0 
        END as show_market_price,
        ug.market_price_per_gram,
        (SELECT status FROM ownership_release_requests WHERE user_id = ug.user_id AND goldbar_id = ug.goldbar_id AND status = 'PENDING' LIMIT 1) as release_status
      FROM user_goldbars ug
      JOIN goldbars g ON ug.goldbar_id = g.id
      LEFT JOIN certificates c ON g.id = c.goldbar_id
      WHERE ug.user_id = ?
      ORDER BY ug.id DESC
    `).bind(now, now, userId).all();

    return c.json({ success: true, syncGoldbars: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/** [신규] 사용자: 소유권 해지 요청 전송 */
app.post('/user/goldbars/release-request', async (c) => {
  try {
    const { userId, goldbarId, message } = await c.req.json();
    if (!userId || !goldbarId) return c.json({ error: '필수 정보가 누락되었습니다.' }, 400);

    // 중복 요청 확인
    const existing = await c.env.DB.prepare('SELECT id FROM ownership_release_requests WHERE user_id = ? AND goldbar_id = ? AND status = ?')
      .bind(userId, goldbarId, 'PENDING')
      .first();
    
    if (existing) {
      return c.json({ error: '이미 처리 대기 중인 해지 요청이 있습니다.' }, 400);
    }

    await c.env.DB.prepare(`
      INSERT INTO ownership_release_requests (user_id, goldbar_id, message)
      VALUES (?, ?, ?)
    `).bind(userId, goldbarId, message || '').run();

    return c.json({ success: true });
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
