# Changelog — Digihackstore

Semua perubahan penting pada web dicatat di sini.

---

## [2026-06-29]

### Responsive Design Overhaul
- Rebuild penuh tampilan mobile/tablet/desktop untuk semua halaman storefront
- Breakpoint utama: 1024px (hamburger menu), 640px (2-kolom grid), 400px (1-kolom)

### Perbaikan Hamburger Menu (Mobile Nav)
- **Root cause**: `style.css` lazy-load override inline CSS mobile rules → gap 24px tetap terapply ke mobile menu
- **Solusi**: Pisahkan mobile menu ke `<div id="mobileMenu">` tersendiri dengan link bersih (tanpa class `.btn-nav`/`.btn-lang`) — tidak ada konflik cascade sama sekali
- Diterapkan ke: `index.ejs`, `catalog.ejs`, `product.ejs`, `checkout.ejs`, `order-status.ejs`, `payment-method.ejs`, `wishlist.ejs`
- Menu menutup otomatis saat klik di luar atau scroll

### Catalog Filter Layout (Mobile)
- Category filter buttons (All, Lainnya, dll) sekarang horizontal scroll `.category-bar` — tidak lagi tumpuk vertikal
- Search + Reset button berjejer side-by-side dalam `.search-btn-row`

### Product Image
- Gambar produk kini square (aspect-ratio 1:1, object-fit contain, background #f7f8fc)
- Gambar tampil penuh tanpa terpotong

### Backup System
- Ditambah `scripts/backup.sh` — cron harian backup SQLite ke repo private
- Ditambah `scripts/restore.sh` — restore database dari backup kapan saja
- Backup repo: `rikoconstantine10-ops/digihackstore_backup` (private)

---

## [Sebelum 2026-06-29] — Fitur yang Sudah Ada

### Slot-Based Product
- Kolom `max_slots` dan `sold_slots` di tabel products
- Checkout diblokir kalau slot penuh
- Progress bar slot di halaman produk

### Catalog Sort & Filter
- Sort: terbaru / harga naik / harga turun / terpopuler
- Filter harga: min_price, max_price
- Pagination mempertahankan semua filter aktif

### Multi-Bahasa ID/EN
- Toggle bahasa via `?lang=en` / `?lang=id`
- Tersimpan di session, fallback ke Accept-Language header
- Semua string UI menggunakan `t.*` dari `locales/translations.js`

### Lainnya
- Meta Pixel + GA4 tracking
- Wishlist berbasis localStorage
- Timer sesi checkout 15 menit
- Admin notifikasi WA untuk order pending >2 jam
- Trust proxy fix untuk rate limiter di balik Cloudflare/Nginx
