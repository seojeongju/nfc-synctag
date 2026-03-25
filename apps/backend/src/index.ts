import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS 설정 (프론트엔드 연동용)
app.use('/*', cors());

// 기본 루트
app.get('/', (c) => c.text('WowTag API Server is running'));

/**
 * NFC 태그 랜딩 엔드포인트
 * GET /t/:uid
 */
app.get('/t/:uid', async (c) => {
  const uid = c.req.param('uid');
  
  // TODO: D1 DB에서 UID에 매핑된 Product ID 조회 로직 추가
  // 현재는 Mockup으로 리다이렉트 (실제 운영 시 프론트엔드 URL로 이동)
  console.log(`NFC Tag Scanned: ${uid}`);
  
  // 프론트엔드 배포 후 해당 URL로 쿼리 파라미터와 함께 전송
  const frontendUrl = `http://localhost:5173?uid=${uid}`; 
  return c.redirect(frontendUrl);
});

/**
 * 제품 정보 조회 API
 * GET /api/products/:id
 */
app.get('/api/products/:id', (c) => {
  const id = c.req.param('id');
  
  // Mock Data
  const product = {
    id,
    name: "Premium Jewelry Set",
    description: "Handcrafted with 18k gold and high-quality diamonds.",
    thumbnail: "https://images.unsplash.com/photo-1515562141207-7a18b5ce7142",
    videoUrl: "https://example.com/video.mp4",
    manualUrl: "https://example.com/manual.pdf",
    tags: ["Jewelry", "Luxury", "Handmade"]
  };
  
  return c.json(product);
});

/**
 * 관리자 API (Auth 필요 로직 추가 예정)
 */
app.post('/api/admin/map', async (c) => {
  const body = await c.req.json();
  const { productId, tagUids } = body;
  
  // TODO: D1 DB에 태그 맵핑 정보 저장
  console.log(`Mapping ${tagUids.length} tags to product ${productId}`);
  
  return c.json({ success: true, message: `${tagUids.length} tags mapped.` });
});

export default app;
