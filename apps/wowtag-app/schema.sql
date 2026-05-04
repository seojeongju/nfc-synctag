-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    manual_url TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tags Table (NFC Tag Mapping)
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_uid TEXT UNIQUE NOT NULL,
    product_id INTEGER REFERENCES products(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scan Logs Table
CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_uid TEXT NOT NULL,
    user_agent TEXT,
    ip_hash TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initial Mock Data
INSERT OR IGNORE INTO products (name, description, video_url, manual_url, image_url) 
VALUES ('프리미엄 주얼리 세트', '장인정신이 깃든 특별한 컬렉션입니다.', 'https://example.com/video', 'https://example.com/manual', '/jewelry.png');

INSERT OR IGNORE INTO tags (tag_uid, product_id) 
VALUES ('NFC_X92K4_001', 1);

-- Goldbars Table (골드바 상품 정보)
CREATE TABLE IF NOT EXISTS goldbars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT UNIQUE NOT NULL,
    weight TEXT NOT NULL,
    purity TEXT DEFAULT '99.99%',
    minted_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Certificates Table (정품인증서 및 NFC 태그 매핑)
CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goldbar_id INTEGER REFERENCES goldbars(id),
    tag_uid TEXT UNIQUE NOT NULL,
    cert_file_path TEXT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Verification Logs Table (스캔 기록)
CREATE TABLE IF NOT EXISTS verification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_uid TEXT NOT NULL,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT 1,
    ip_hash TEXT,
    user_agent TEXT
);

-- Initial Mock Data for Goldbars
INSERT OR IGNORE INTO goldbars (serial_number, weight, purity, minted_at)
VALUES ('GB2026-0001', '10g', '99.99%', '2026-05-01');

INSERT OR IGNORE INTO certificates (goldbar_id, tag_uid, cert_file_path)
VALUES (1, 'NFC_GB_TEST_001', 'certificates/GB2026-0001.pdf');

-- Digital Albums Tables
CREATE TABLE IF NOT EXISTS digital_albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goldbar_id INTEGER NOT NULL REFERENCES goldbars(id) ON DELETE CASCADE,
    title TEXT DEFAULT '나의 소중한 추억 앨범',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS album_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL REFERENCES digital_albums(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users & User Goldbars Tables
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_goldbars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goldbar_id INTEGER NOT NULL REFERENCES goldbars(id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, goldbar_id)
);
