import { describe, it, expect } from 'vitest';
import {
  parseAudienceText,
  MIN_DAILY_BUDGET_IDR,
} from '../../../server/bot/scenes/create-campaign.js';

describe('create-campaign — ramah pemula', () => {
  it('lantai budget ikut minimal Facebook', () => {
    expect(MIN_DAILY_BUDGET_IDR).toBe(17500);
  });

  it('ngerti bahasa santai: negara, umur, gender, minat', () => {
    const got = parseAudienceText('Indonesia, umur 20-35, cewek, suka fashion dan skincare');
    expect(got.countries).toEqual(['ID']);
    expect(got.ageMin).toBe(20);
    expect(got.ageMax).toBe(35);
    expect(got.gender).toBe(2);
    expect(got.interests).toEqual(['fashion', 'skincare']);
  });

  it('ngerti jawaban pendek cowok + umur', () => {
    const got = parseAudienceText('cowok 25-40');
    expect(got.ageMin).toBe(25);
    expect(got.ageMax).toBe(40);
    expect(got.gender).toBe(1);
  });

  it('format lama Country:/Age: tetap jalan', () => {
    const got = parseAudienceText('Country: MY\nAge: 30-45\nGender: male\nInterests: kuliner, travel');
    expect(got.countries).toEqual(['MY']);
    expect(got.ageMin).toBe(30);
    expect(got.ageMax).toBe(45);
    expect(got.gender).toBe(1);
    expect(got.interests).toEqual(['kuliner', 'travel']);
  });
});
