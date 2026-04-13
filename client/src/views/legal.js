export async function renderPrivacyPolicy(el) {
  el.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 py-12 pb-20">
      <h1 class="text-3xl font-bold mb-6 text-white">Privacy Policy</h1>
      <div class="prose prose-invert max-w-none text-slate-300">
        <p class="mb-4">Last updated: 2026</p>
        <p class="mb-4">At AdForge, we are committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information and advertising data.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">1. Data Collection</h2>
        <p class="mb-4">We collect information that you provide directly to us, such as your account details, ad campaign data, and platform integrations (Meta, Google, TikTok).</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">2. Data Usage</h2>
        <p class="mb-4">We use your data to provide and improve our advertising management and optimization services, including AI-driven insights and automated actions.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">3. Data Security</h2>
        <p class="mb-4">We implement industry-standard security measures to protect your data against unauthorized access, alteration, disclosure, or destruction.</p>
        <div class="mt-12 text-center">
           <a href="#/" class="text-sky-400 hover:text-sky-300 font-bold transition-colors">Back to Home</a>
        </div>
      </div>
    </div>
  `;
}

export async function renderTermsService(el) {
  el.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 py-12 pb-20">
      <h1 class="text-3xl font-bold mb-6 text-white">Terms of Service</h1>
      <div class="prose prose-invert max-w-none text-slate-300">
        <p class="mb-4">Last updated: 2026</p>
        <p class="mb-4">Welcome to AdForge. By using our platform, you agree to these terms of service. Please read them carefully.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">1. Acceptance of Terms</h2>
        <p class="mb-4">By accessing and using our services, you accept and agree to be bound by the terms and provision of this agreement.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">2. Service Usage</h2>
        <p class="mb-4">AdForge provides an AI-powered advertising management platform. You are responsible for maintaining the confidentiality of your account and API keys.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">3. Limitation of Liability</h2>
        <p class="mb-4">AdForge shall not be liable for any indirect, incidental, special, consequential or punitive damages, or any loss of profits or revenues resulting from your ad campaigns.</p>
        <div class="mt-12 text-center">
           <a href="#/" class="text-sky-400 hover:text-sky-300 font-bold transition-colors">Back to Home</a>
        </div>
      </div>
    </div>
  `;
}

export async function renderGDPR(el) {
  el.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 py-12 pb-20">
      <h1 class="text-3xl font-bold mb-6 text-white">GDPR Compliance</h1>
      <div class="prose prose-invert max-w-none text-slate-300">
        <p class="mb-4">Last updated: 2026</p>
        <p class="mb-4">AdForge is fully committed to compliance with the General Data Protection Regulation (GDPR) to protect the data privacy of our European Union users.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">1. Your Rights</h2>
        <p class="mb-4">Under GDPR, you have the right to access, rectify, port, and erase your data. You also have the right to restrict and object to certain processing of your data.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">2. Data Processing</h2>
        <p class="mb-4">We process personal data only when we have a lawful basis to do so. We act as a data processor for the advertising data you connect to our platform.</p>
        <h2 class="text-xl font-bold text-white mt-8 mb-4">3. Contact our DPO</h2>
        <p class="mb-4">If you have any questions or requests regarding your data privacy, please contact our Data Protection Officer at privacy@adforge.aitradepulse.com.</p>
        <div class="mt-12 text-center">
           <a href="#/" class="text-sky-400 hover:text-sky-300 font-bold transition-colors">Back to Home</a>
        </div>
      </div>
    </div>
  `;
}
