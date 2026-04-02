import { v4 as uuid } from 'uuid';
import { hashPassword } from '../server/lib/auth.js';

export function seedDemoData(db) {
  // Seed admin user if none exists
  const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!existingUser) {
    const adminId = uuid();
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
      adminId, 'admin', hashPassword('admin123')
    );
    console.log('Seeded admin user (admin/admin123)');
  }

  // Seed demo campaigns if none exist
  const existingCampaigns = db.prepare('SELECT COUNT(*) as count FROM campaigns').get();
  if (existingCampaigns.count === 0) {
    const campaigns = [
      { platform: 'meta', campaign_id: 'meta_001', name: 'Promo Ramadan 2026', status: 'active', budget: 5000000, spend: 3200000, revenue: 12800000, impressions: 450000, clicks: 22500, conversions: 450 },
      { platform: 'meta', campaign_id: 'meta_002', name: 'Flash Sale Weekend', status: 'active', budget: 2000000, spend: 1800000, revenue: 5400000, impressions: 280000, clicks: 14000, conversions: 280 },
      { platform: 'google', campaign_id: 'gads_001', name: 'Search - Brand Keywords', status: 'active', budget: 3000000, spend: 2100000, revenue: 8400000, impressions: 180000, clicks: 9000, conversions: 180 },
      { platform: 'google', campaign_id: 'gads_002', name: 'Display - Retargeting', status: 'paused', budget: 1500000, spend: 900000, revenue: 2700000, impressions: 320000, clicks: 6400, conversions: 64 },
      { platform: 'meta', campaign_id: 'meta_003', name: 'Lookalike - High Value', status: 'active', budget: 4000000, spend: 2500000, revenue: 10000000, impressions: 520000, clicks: 26000, conversions: 520 },
    ];

    const stmt = db.prepare(`
      INSERT INTO campaigns (id, platform, campaign_id, name, status, budget, spend, revenue, impressions, clicks, conversions, roas, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const c of campaigns) {
      stmt.run(uuid(), c.platform, c.campaign_id, c.name, c.status, c.budget, c.spend, c.revenue, c.impressions, c.clicks, c.conversions, c.spend > 0 ? c.revenue / c.spend : 0);
    }
    console.log('Seeded 5 demo campaigns');
  }

  // Seed sample ads if none exist
  const existingAds = db.prepare('SELECT COUNT(*) as count FROM ads').get();
  if (existingAds.count === 0) {
    const ads = [
      { name: 'Promo Ramadan - P.A.S', product: 'Kursus Digital Marketing', target: 'Pemilik UMKM 25-45', keunggulan: 'Materi praktis, mentor berpengalaman', content_model: 'P.A.S', hook: 'Bisnis stuck di tempat?', body: 'Ribuan UMKM sudah buktikan hasilnya. Belajar dari praktisi bukan teori.', cta: 'Daftar Sekarang - Diskon 50%' },
      { name: 'Flash Sale - Efek Gravitasi', product: 'Kursus Digital Marketing', target: 'Freelancer & fresh graduate', keunggulan: 'Langsung praktek, portofolio nyata', content_model: 'Efek Gravitasi', hook: 'Tau nggak kenapa 90% freelancer gagal?', body: 'Bukan karena skill kurang, tapi strategi marketing yang salah. Kursus ini beda.', cta: 'Ambil Kuota Terakhir' },
      { name: 'Retarget - Hasil x3', product: 'Kursus Digital Marketing', target: 'Visitor yang belum checkout', keunggulan: 'ROI 3x dalam 30 hari', content_model: 'Hasil x3', hook: '3x lipat omset dalam 30 hari?', body: 'Bukan janji kosong. Lihat testimoni 500+ alumni yang sudah membuktikan.', cta: 'Buktikan Sendiri' },
    ];

    const stmt = db.prepare(`
      INSERT INTO ads (id, name, product, target, keunggulan, platform, format, content_model, hook, body, cta, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const a of ads) {
      stmt.run(uuid(), a.name, a.product, a.target, a.keunggulan, 'meta', 'single_image', a.content_model, a.hook, a.body, a.cta, '[]', 'active');
    }
    console.log('Seeded 3 demo ads');
  }
}
