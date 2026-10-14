import { describe, it, expect } from 'vitest';
import { CreativeStudio } from '../../../server/services/creative-studio.js';

// Captured real Gemini markdown output (LLM ignored JSON instruction).
const MARKDOWN_RAW = `# 📦 AD PACKAGE: Test Product

## 🎯 COPY VARIATIONS

### 1️⃣ P.A.S (Problem – Agitate – Solution)

**Primary Text** *(103 karakter)*
> Ngantuk, lemas, kerjaan numpuk? Tenaga habis sebelum jam 12.

**Headline** *(26 karakter)*
> Kapal Api, Ngebut Tenagamu

**CTA Button:** Beli Sekarang

---

### 2️⃣ Efek Gravitasi (Pattern Interrupt)

**Primary Text** *(112 karakter)*
> Masih dipaksa bangun? Minum Kapal Api, badan langsung ON.

**Headline** *(19 karakter)*
> Teguk. Ngebut. Gas!

**CTA Button:** Pelajari Selengkapnya

---

### 3️⃣ Hasil x3 (Result-Driven)

**Primary Text** *(106 karakter)*
> Hasil nyata: 2x lebih fokus, 3x tuntas kerjaan.

**Headline** *(28 karakter)*
> Hasil x3, Produktivitas Naik

**CTA Button:** Beli Sekarang

---

### 4️⃣ Prospects-to-Prospects (Social Proof)

**Primary Text** *(110 karakter)*
> "Awalnya cuma coba, ternyata gak ngantuk sampai pulang kerja!"

**Headline** *(24 karakter)*
> Dipercaya Jutaan Pekerja

**CTA Button:** Coba Sekarang

---

## 🖼️ IMAGE DIRECTIONS (Single Image)

**Variasi A — "Morning Hero Shot"**
- Kopi panas dengan uap, disandingkan laptop & dokumen kerja
- Background: meja kantor modern, lighting hangat pagi hari
- Text overlay: **"TENAGA NGBUT SEJAK TEGUK PERTAMA"**

**Variasi B — "Split Reality"**
- Kiri: pekerja lemas, mata mengantuk, abu-abu
- Kanan: pekerja enerjik, warna cerah, teguk kopi

---

## 🎬 VIDEO SCRIPT (Reels/Stories, 15 detik)

| Detik | Visual | Audio/Narasi |
|-------|--------|--------------|
| 0–3 | Alarm berbunyi, mata susah dibuka | *"Bangun kesiangan..."* |
| 3–6 | Tangan tuang kopi, uap panas close-up | SFX: suara tuang kopi |
| 6–10 | Teguk satu kali → wajah berubah semangat | *"Satu teguk... tenaga NGBUT!"* |
| 10–13 | Montage: ngetik cepat, meeting percaya diri | Musik upbeat |
| 13–15 | End card: logo + tagline | *"Ngebut tenagamu!"* |

---

## 🎯 TARGETING SUGGESTIONS

**Demografi:**
- Usia 22–45 tahun, semua gender
- Lokasi: Jabodetabek, kota besar

**Interest Stacking (Broad + Niche):**
- Pekerjaan: *Office worker, Kantor, LinkedIn, Professional networking*
- Gaya hidup: *Kopi sachet, Kopi, Minuman, Sarapan*
- Produktivitas: *Time management, Motivasi, Self-improvement*
`;

const JSON_RAW = JSON.stringify({
  copies: [
    { model: '1', model_name: 'P.A.S', hook: 'test hook', body: 'test body', cta: 'Beli', headline: 'Test HL', description: '' },
  ],
  imageDirections: [{ description: 'test img', layout: 'center', colors: 'warm', textOverlay: 'text', mood: 'urgent' }],
  videoScript: { duration: '15s', hook: { time: '0-3s', visual: 'scene', voiceover: 'vo', onScreen: 'text' } },
  targetingSuggestions: { interests: [{ name: 'Kopi', reason: 'relevant' }], ageRange: { min: 25, max: 45 }, locations: ['Indonesia'] },
});

describe('CreativeStudio parser', () => {
  it('parses markdown output into copies array', async () => {
    const studio = new CreativeStudio({ call: async () => MARKDOWN_RAW });
    const result = await studio.generateAdPackage('Test', 'Workers', 'Energy', 'meta', 'single_image');
    expect(result.copies).toHaveLength(4);
    expect(result.copies[0].model_name).toBe('P.A.S');
    expect(result.copies[0].body).toContain('Ngantuk');
    expect(result.copies[0].headline).toBe('Kapal Api, Ngebut Tenagamu');
    expect(result.copies[0].cta).toBe('Beli Sekarang');
    expect(result.copies[1].model_name).toBe('Efek Gravitasi');
    expect(result.copies[3].model_name).toBe('Prospects-to-Prospects');
  });

  it('extracts image directions from markdown', async () => {
    const studio = new CreativeStudio({ call: async () => MARKDOWN_RAW });
    const result = await studio.generateAdPackage('Test', 'Workers', 'Energy', 'meta', 'single_image');
    expect(result.imageDirections.length).toBeGreaterThanOrEqual(2);
    expect(result.imageDirections[0].layout).toContain('Morning');
  });

  it('extracts video script from markdown table', async () => {
    const studio = new CreativeStudio({ call: async () => MARKDOWN_RAW });
    const result = await studio.generateAdPackage('Test', 'Workers', 'Energy', 'meta', 'single_image');
    expect(result.videoScript).not.toBeNull();
    expect(result.videoScript.hook.time).toBe('0–3');
  });

  it('extracts targeting interests and age range from markdown', async () => {
    const studio = new CreativeStudio({ call: async () => MARKDOWN_RAW });
    const result = await studio.generateAdPackage('Test', 'Workers', 'Energy', 'meta', 'single_image');
    expect(result.targetingSuggestions.interests.length).toBeGreaterThan(0);
    expect(result.targetingSuggestions.interests.some((i) => i.name === 'Kopi')).toBe(true);
    expect(result.targetingSuggestions.ageRange).toEqual({ min: 22, max: 45 });
  });

  it('still parses valid JSON output correctly', async () => {
    const studio = new CreativeStudio({ call: async () => JSON_RAW });
    const result = await studio.generateAdPackage('Test', 'Workers', 'Energy', 'meta', 'single_image');
    expect(result.copies).toHaveLength(1);
    expect(result.copies[0].hook).toBe('test hook');
    expect(result.imageDirections).toHaveLength(1);
    expect(result.targetingSuggestions.interests[0].name).toBe('Kopi');
  });
});
