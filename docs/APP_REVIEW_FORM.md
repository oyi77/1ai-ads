# Meta App Review — Permission Justification Template
# App: AdForge (ID: 704618995979962)
# Generated: 2026-05-22

---

## ads_management
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge menggunakan ads_management untuk membuat, mengelola, dan mengoptimalkan kampanye iklan atas nama pengguna yang telah memberikan otorisasi eksplisit. Pengguna menghubungkan akun Facebook dan Ad Account mereka melalui OAuth, kemudian menggunakan dashboard AdForge untuk:
- Membuat campaign, ad set, dan ad baru melalui Graph API
- Mengupdate budget, status (pause/resume), dan targeting
- Mengaplikasikan aturan otomatisasi (auto-scale, auto-pause berdasarkan ROAS/spend)

**Bagaimana ini menambahkan nilai untuk pengguna:**
Pengguna dapat mengelola multiple Facebook Ad Accounts dari satu dashboard terpusat, menghemat waktu dibanding login ke Ads Manager satu per satu. Fitur automasi (rules-based scaling) membantu UKM mengoptimalkan budget iklan tanpa perlu monitoring 24/7.

**Mengapa ini perlu untuk fungsionalitas aplikasi:**
Tanpa ads_management, AdForge tidak dapat menjalankan fungsi intinya sebagai ad management platform. Fitur campaign creation, budget adjustment, dan status control adalah core value proposition aplikasi.

---

## ads_read
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge membaca data performa iklan (insights, spend, impressions, clicks, CTR, ROAS, conversions) dari Ad Accounts pengguna melalui Graph API untuk:
- Menampilkan dashboard analytics real-time
- Mengevaluasi aturan automasi (contoh: jika ROAS < 1.5, pause campaign)
- Generate laporan harian/mingguan performa iklan

**Bagaimana ini menambahkan nilai untuk pengguna:**
Pengguna mendapat visibilitas penuh terhadap performa iklan mereka dalam satu dashboard. Data insights digunakan untuk rekomendasi optimasi berbasis AI, membantu pengguna mengambil keputusan data-driven tanpa harus menganalisis manual di Ads Manager.

**Mengapa ini perlu untuk fungsionalitas aplikasi:**
Tanpa ads_read, AdForge tidak bisa menampilkan metrik performa atau menjalankan aturan automasi berbasis data. Analytics adalah komponen esensial dari platform manajemen iklan.

---

## business_management
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge menggunakan business_management untuk:
- Membaca daftar Business Manager milik pengguna
- Mengakses Ad Accounts yang terkait dengan Business Manager tersebut
- Memungkinkan pengguna memilih Business Manager dan Ad Account mana yang ingin dikelola melalui AdForge

**Bagaimana ini menambahkan nilai untuk pengguna:**
Pengguna dengan multiple Business Managers (agensi, multiple bisnis) dapat mengelola semua aset dari satu tempat. Ini sangat bernilai untuk digital agencies dan pemilik multiple bisnis.

**Mengapa ini perlu untuk fungsionalitas aplikasi:**
Tanpa business_management, AdForge hanya bisa mengakses Ad Accounts personal user, bukan yang berada di bawah Business Manager. Banyak pengguna bisnis mengelola iklan melalui Business Manager, sehingga permission ini kritis untuk melayani segmen pengguna tersebut.

---

## pages_show_list
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge membaca daftar Facebook Pages yang dimiliki atau dikelola pengguna untuk:
- Menampilkan halaman mana yang tersedia untuk menjalankan iklan
- Memungkinkan pengguna memilih Page yang benar saat membuat campaign/ad

**Bagaimana ini menambahkan nilai untuk pengguna:**
Pengguna dapat dengan mudah memilih Facebook Page yang tepat untuk campaign mereka langsung dari AdForge, tanpa perlu mengecek manual di Facebook.

**Mengapa ini perlu untuk fungsionalitas aplikasi:**
Facebook Ads memerlukan Page ID untuk membuat ad creative (object_story_spec memerlukan page_id). Tanpa pages_show_list, pengguna harus mencari dan memasukkan Page ID secara manual, yang mempersulit workflow.

---

## pages_read_engagement
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge membaca metrik engagement dari Facebook Pages (likes, comments, shares pada post) untuk:
- Mengevaluasi performa konten organik
- Memberikan rekomendasi post mana yang sebaiknya di-boost menjadi ad

**Bagaimana ini menambahkan nilai untuk pengguna:**
Pengguna mendapat insight post organik mana yang paling engaging, sehingga bisa menggunakan konten yang sudah terbukti untuk ad campaign (proven post strategy), menghemat budget testing.

**Mengapa ini perlu untuk fungsionalitas aplikasi:**
Data engagement page membantu fitur "Creative Recommendation" dalam memilih post terbaik untuk dijadikan ad. Ini adalah fitur diferensiasi AdForge dari Ads Manager standar.

---

## pages_manage_ads
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge memerlukan pages_manage_ads untuk mengelola iklan yang berjalan atas nama Facebook Pages pengguna, termasuk membuat, mengupdate, dan menghentikan ad yang terkait dengan Page tersebut.

**Mengapa ini perlu:**
Permission ini diperlukan agar user dapat membuat iklan melalui Graph API untuk Page mereka. Tanpa ini, setiap campaign creation akan gagal karena tidak ada izin untuk mempublikasikan konten bersponsor atas nama Page.

---

## pages_manage_posts
**Bagaimana aplikasi Anda menggunakan izin ini:**
AdForge dapat membuat dan mengelola post di Facebook Pages pengguna (untuk konten organik dan dark posts untuk iklan).

**Mengapa ini perlu:**
Beberapa tipe ad creative memerlukan pembuatan post tidak terpublikasi (dark post) di Page. Permission ini memungkinkan workflow creative creation yang mulus.

---

## App Verification Details

**Business Use Case:**
AdForge adalah platform SaaS manajemen iklan multi-platform (Meta, Google, TikTok) untuk UKM dan digital agencies di Indonesia. Platform ini menyediakan:
1. Unified dashboard untuk multi-platform ad management
2. AI-powered campaign optimization dengan aturan automatis
3. Competitor ad intelligence research
4. Creative generation dengan AI

**Data Handling:**
- Semua data iklan dan insight disimpan di database lokal (SQLite) milik pengguna
- Token akses disimpan terenkripsi di server
- Tidak ada data iklan yang dibagikan ke pihak ketiga
- Pengguna dapat menghapus semua data mereka kapan saja melalui endpoint Data Deletion

**Privacy Policy URL:** https://adforge.aitradepulse.com/privacy
**Terms of Service URL:** https://adforge.aitradepulse.com/terms
**Data Deletion URL:** https://adforge.aitradepulse.com/api/auth/facebook/deauthorize

---

## Template Jawaban Cepat (Copy-Paste ke Form Meta)

### Untuk "Detailed description of how your app uses the requested permissions":

AdForge is an ad management platform that helps small businesses and digital agencies in Indonesia manage their Facebook and Instagram advertising campaigns from a single dashboard. 

**ads_management + ads_read:** Users authenticate via Facebook Login and grant AdForge permission to create, manage, and monitor their ad campaigns. AdForge reads campaign performance data (spend, impressions, clicks, CTR, ROAS) to display analytics and apply automation rules (e.g., auto-pause underperforming campaigns, auto-scale winning campaigns). All campaign creation/modification is initiated by the user through our dashboard interface.

**business_management:** For users managing ads through Business Manager, AdForge accesses their business account to list available ad accounts, enabling agencies and multi-business owners to manage everything from one place.

**pages_show_list + pages_read_engagement + pages_manage_ads + pages_manage_posts:** To create and run ads, Facebook requires a Page association. AdForge reads the user's Pages list so they can select which Page to use for their ads. We read engagement data to recommend which organic posts perform best (for proven-post ad strategy). Page ad management is required to publish sponsored content through Graph API.

**How this adds value:** Instead of logging into Facebook Ads Manager separately for each ad account, users manage everything from AdForge's unified dashboard with AI-powered optimization rules, saving hours of manual monitoring.

**Why necessary:** These permissions are the minimum required for an ad management platform to function. Without them, AdForge cannot create ads, display performance data, or provide automation features — the core value proposition of the application.
