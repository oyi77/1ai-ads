export async function renderMarketingLP(el) {
  el.innerHTML = `
    <div class="bg-[#0d1117] text-[#c9d1d9] min-h-screen font-sans">
      <!-- Hero Section -->
      <header class="relative py-16 sm:py-24 px-4 overflow-hidden border-b border-[#161b22]">
        <div class="max-w-7xl mx-auto text-center relative z-10">
          <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 text-white leading-tight">
            AdForge: Scale Your Ads with <span class="text-[#58a6ff]">AI Precision</span>
          </h1>
          <p class="text-xl sm:text-2xl text-slate-400 mb-10 max-w-3xl mx-auto">
            Generate high-converting landing pages and manage cross-platform ad accounts in one integrated powerhouse.
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a href="#/register" class="bg-[#58a6ff] hover:bg-[#79c0ff] text-white px-8 py-4 rounded-lg text-lg font-bold transition-all min-h-[44px] flex items-center justify-center shadow-lg shadow-sky-500/20">
              Get Started Now — Free
            </a>
            <a href="#/login" class="bg-[#161b22] hover:bg-[#21262d] text-[#c9d1d9] px-8 py-4 rounded-lg text-lg font-bold border border-[#30363d] transition-all min-h-[44px] flex items-center justify-center">
              Sign In
            </a>
          </div>
        </div>
        <!-- Background accents -->
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-20">
          <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#58a6ff] blur-[120px] rounded-full"></div>
          <div class="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-[#f78166] blur-[100px] rounded-full"></div>
        </div>
      </header>

      <!-- Features Section -->
      <section class="py-20 px-4 max-w-7xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Everything you need to dominate ads</h2>
          <p class="text-slate-400">Scale faster with AI-driven workflows.</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div class="bg-[#161b22] p-8 rounded-2xl border border-[#30363d] hover:border-[#58a6ff]/50 transition-colors">
            <div class="w-12 h-12 bg-[#58a6ff]/10 rounded-lg flex items-center justify-center mx-auto mb-6 text-[#58a6ff]">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-3">AI Ad Generation</h3>
            <p class="text-slate-400">Generate creative copies and variations for Meta, Google, and TikTok in seconds using high-performance LLMs.</p>
          </div>

          <div class="bg-[#161b22] p-8 rounded-2xl border border-[#30363d] hover:border-[#58a6ff]/50 transition-colors">
            <div class="w-12 h-12 bg-[#79c0ff]/10 rounded-lg flex items-center justify-center mx-auto mb-6 text-[#79c0ff]">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-3">Multi-Account Sync</h3>
            <p class="text-slate-400">Manage multiple business accounts per platform. One dashboard to rule them all with real-time sync.</p>
          </div>

          <div class="bg-[#161b22] p-8 rounded-2xl border border-[#30363d] hover:border-[#58a6ff]/50 transition-colors">
            <div class="w-12 h-12 bg-[#f78166]/10 rounded-lg flex items-center justify-center mx-auto mb-6 text-[#f78166]">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-3">Real-time Analytics</h3>
            <p class="text-slate-400">Deep insights into CTR, ROAS, and conversions. Track performance across all platforms instantly.</p>
          </div>
        </div>
      </section>

      <!-- Pricing Section -->
      <section class="py-20 px-4 bg-[#161b22] border-y border-[#30363d]">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Transparent Pricing</h2>
            <p class="text-slate-400">Scale your plan as your business grows.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="bg-[#0d1117] p-8 rounded-2xl border border-[#30363d] flex flex-col">
              <h3 class="text-lg font-bold text-white mb-2 text-center">Starter</h3>
              <div class="text-3xl font-extrabold text-white text-center mb-6">Free</div>
              <ul class="space-y-4 text-slate-400 mb-8 flex-1">
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> 1 Platform Account</li>
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> 5 AI Generations / month</li>
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> Basic Analytics</li>
              </ul>
              <a href="#/register" class="w-full bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff] text-white py-3 rounded-lg font-bold transition-all text-center">Get Started</a>
            </div>

            <div class="bg-[#0d1117] p-8 rounded-2xl border-2 border-[#58a6ff] flex flex-col relative scale-105 shadow-2xl shadow-[#58a6ff]/10">
              <span class="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-[#58a6ff] text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Most Popular</span>
              <h3 class="text-lg font-bold text-white mb-2 text-center">Pro</h3>
              <div class="text-3xl font-extrabold text-white text-center mb-6">$49<span class="text-sm font-normal text-slate-500">/mo</span></div>
              <ul class="space-y-4 text-slate-400 mb-8 flex-1">
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> Unlimited Accounts</li>
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> Unlimited AI Generations</li>
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> Advanced Optimization</li>
              </ul>
              <a href="#/register" class="w-full bg-[#58a6ff] hover:bg-[#79c0ff] text-white py-3 rounded-lg font-bold transition-all text-center">Go Pro</a>
            </div>

            <div class="bg-[#0d1117] p-8 rounded-2xl border border-[#30363d] flex flex-col">
              <h3 class="text-lg font-bold text-white mb-2 text-center">Agency</h3>
              <div class="text-3xl font-extrabold text-white text-center mb-6">$199<span class="text-sm font-normal text-slate-500">/mo</span></div>
              <ul class="space-y-4 text-slate-400 mb-8 flex-1">
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> Everything in Pro</li>
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> Team Collaboration</li>
                <li class="flex items-center gap-2"><svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg> API Access</li>
              </ul>
              <a href="#/register" class="w-full bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff] text-white py-3 rounded-lg font-bold transition-all text-center">Contact Sales</a>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="py-24 px-4 text-center">
        <h2 class="text-3xl sm:text-4xl font-bold text-white mb-8">Ready to transform your advertising?</h2>
        <a href="#/register" class="bg-[#58a6ff] hover:bg-[#79c0ff] text-white px-12 py-5 rounded-full text-xl font-extrabold transition-all shadow-xl shadow-sky-500/20 inline-block">
          Start Your 14-Day Free Trial
        </a>
        <p class="mt-6 text-slate-500 text-sm">No credit card required. Cancel anytime.</p>
      </section>

    </main>
  </div>
  `;
}
