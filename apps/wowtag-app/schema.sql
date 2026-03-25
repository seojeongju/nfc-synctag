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
INSERT INTO products (name, description, video_url, manual_url, image_url) 
VALUES ('프리미엄 주얼리 세트', '장인정신이 깃든 특별한 컬렉션입니다.', 'https://example.com/video', 'https://example.com/manual', '/jewelry.png');

INSERT INTO tags (tag_uid, product_id) 
VALUES ('NFC_X92K4_001', 1);
