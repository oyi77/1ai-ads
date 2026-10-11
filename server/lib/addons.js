/**
 * Add-on registry — fitur di luar base manage-ads 99rb dijual terpisah.
 *
 * Base = manage ads (plan=enterprise). Add-on = tabel user_addons sendiri,
 * lifetime, grant manual via admin sebelum pay:addon:* lewat gateway.
 * Tambah add-on baru = 1 entri di sini. 403 = demand signal (log di requireAddon).
 */
export const ADDONS = {
  lp: {
    key: 'lp',
    name: 'Landing Page',
    price: 49000,
    blurb: 'Bikin + deploy landing page produk bos',
  },
  bridge: {
    key: 'bridge',
    name: 'Content + Social Bridge',
    price: 49000,
    blurb: 'Konten & sosial buat iklan bos',
  },
};

export function addonLabel(key) {
  return ADDONS[key]?.name || key;
}
