import { esc } from '../lib/escape.js';

const platforms = ['Meta', 'TikTok', 'Google', 'X'];
const industries = ['E-commerce', 'Finance', 'Education', 'Health', 'Travel', 'Gaming'];

const sampleAds = [
  { id: 1, brand: 'Nike', platform: 'Meta', industry: 'E-commerce', engagement: '12.5%', spend: 'Rp 45M', image: 'https://via.placeholder.com/300x200/1a1f2e/58a6ff?text=Nike+Ad' },
  { id: 2, brand: 'Gojek', platform: 'TikTok', industry: 'Travel', engagement: '18.2%', spend: 'Rp 89M', image: 'https://via.placeholder.com/300x200/1a1f2e/79c0ff?text=Gojek' },
  { id: 3, brand: 'Bank BCA', platform: 'Google', industry: 'Finance', engagement: '8.7%', spend: 'Rp 120M', image: 'https://via.placeholder.com/300x200/1a1f2e/3fb950?text=BCA' },
  { id: 4, brand: 'Tokopedia', platform: 'Meta', industry: 'E-commerce', engagement: '15.3%', spend: 'Rp 200M', image: 'https://via.placeholder.com/300x200/1a1f2e/f78166?text=Tokopedia' },
  { id: 5, brand: 'Ruangguru', platform: 'TikTok', industry: 'Education', engagement: '22.1%', spend: 'Rp 67M', image: 'https://via.placeholder.com/300x200/1a1f2e/a371f7?text=Ruangguru' },
  { id: 6, brand: 'Halodoc', platform: 'Google', industry: 'Health', engagement: '11.4%', spend: 'Rp 34M', image: 'https://via.placeholder.com/300x200/1a1f2e/58a6ff?text=Halodoc' },
  { id: 7, brand: 'Shopee', platform: 'Meta', industry: 'E-commerce', engagement: '19.8%', spend: 'Rp 310M', image: 'https://via.placeholder.com/300x200/1a1f2e/f78166?text=Shopee' },
  { id: 8, brand: 'Grab', platform: 'X', industry: 'Travel', engagement: '7.2%', spend: 'Rp 78M', image: 'https://via.placeholder.com/300x200/1a1f2e/3fb950?text=Grab' },
  { id: 9, brand: 'Zenius', platform: 'TikTok', industry: 'Education', engagement: '14.6%', spend: 'Rp 52M', image: 'https://via.placeholder.com/300x200/1a1f2e/a371f7?text=Zenius' },
  { id: 10, brand: 'OVO', platform: 'Meta', industry: 'Finance', engagement: '9.3%', spend: 'Rp 95M', image: 'https://via.placeholder.com/300x200/1a1f2e/79c0ff?text=OVO' },
  { id: 11, brand: 'Traveloka', platform: 'Google', industry: 'Travel', engagement: '13.7%', spend: 'Rp 143M', image: 'https://via.placeholder.com/300x200/1a1f2e/58a6ff?text=Traveloka' },
  { id: 12, brand: 'Lazada', platform: 'Meta', industry: 'E-commerce', engagement: '16.9%', spend: 'Rp 188M', image: 'https://via.placeholder.com/300x200/1a1f2e/f78166?text=Lazada' },
];

export async function renderGlobalAds(el) {
  let filteredAds = [...sampleAds];
  let activePlatform = 'All';
  let activeIndustry = 'All';
  let activeTimeframe = '30d';

  const render = () => {
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold">Trending Ads</h1>
            <p class="text-slate-400 mt-1">Discover top-performing ads across platforms</p>
          </div>
        </div>

        <!-- Filters -->
        <div class="bg-slate-800 p-4 rounded-lg mb-6">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm text-slate-400 mb-2">Platform</label>
              <select id="platform-filter" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500">
                <option value="All">All Platforms</option>
                ${platforms.map(p => `<option value="${p}">${p}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-2">Industry</label>
              <select id="industry-filter" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500">
                <option value="All">All Industries</option>
                ${industries.map(i => `<option value="${i}">${i}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-2">Timeframe</label>
              <div class="flex gap-2">
                ${['7d', '30d', '90d'].map(t => `
                  <button data-timeframe="${t}" class="timeframe-btn flex-1 py-2 px-3 rounded-lg text-sm border ${activeTimeframe === t ? 'bg-sky-600 border-sky-600 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'}">
                    ${t}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-xs">Total Ads</div>
            <div class="text-xl sm:text-2xl font-bold">${filteredAds.length}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-xs">Avg Engagement</div>
            <div class="text-xl sm:text-2xl font-bold text-sky-400">${(filteredAds.reduce((a, b) => a + parseFloat(b.engagement), 0) / filteredAds.length || 0).toFixed(1)}%</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-xs">Top Platform</div>
            <div class="text-xl sm:text-2xl font-bold text-emerald-400">${getTopPlatform()}</div>
          </div>
          <div class="bg-slate-800 p-4 rounded-lg">
            <div class="text-slate-400 text-xs">Trending</div>
            <div class="text-xl sm:text-2xl font-bold text-orange-400">+24%</div>
          </div>
        </div>

        <!-- Ads Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          ${filteredAds.map(ad => `
            <div class="bg-slate-800 rounded-lg overflow-hidden group hover:ring-2 hover:ring-sky-500 transition-all cursor-pointer">
              <div class="relative aspect-video bg-slate-900">
                <img src="${esc(ad.image)}" alt="${esc(ad.brand)}" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">
                <div class="absolute top-2 right-2 bg-slate-900/90 backdrop-blur px-2 py-1 rounded text-xs font-medium">
                  ${esc(ad.platform)}
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60"></div>
              </div>
              <div class="p-4">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="font-semibold text-lg">${esc(ad.brand)}</h3>
                  <span class="text-xs px-2 py-1 bg-slate-700 rounded">${esc(ad.industry)}</span>
                </div>
                <div class="flex items-center gap-4 text-sm text-slate-400">
                  <div class="flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    <span class="text-emerald-400 font-medium">${esc(ad.engagement)}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span>${esc(ad.spend)}</span>
                  </div>
                </div>
                <div class="mt-4 flex gap-2">
                  <button class="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                    Preview
                  </button>
                  <button class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                    Save
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    attachListeners();
  };

  const getTopPlatform = () => {
    const counts = {};
    filteredAds.forEach(ad => { counts[ad.platform] = (counts[ad.platform] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
  };

  const attachListeners = () => {
    el.querySelector('#platform-filter')?.addEventListener('change', (e) => {
      activePlatform = e.target.value;
      filterAds();
    });

    el.querySelector('#industry-filter')?.addEventListener('change', (e) => {
      activeIndustry = e.target.value;
      filterAds();
    });

    el.querySelectorAll('.timeframe-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTimeframe = btn.dataset.timeframe;
        render();
      });
    });
  };

  const filterAds = () => {
    filteredAds = sampleAds.filter(ad => {
      const platformMatch = activePlatform === 'All' || ad.platform === activePlatform;
      const industryMatch = activeIndustry === 'All' || ad.industry === activeIndustry;
      return platformMatch && industryMatch;
    });
    render();
  };

  render();
}
