# 🧹 Database Cleanup - Panduan Penggunaan

## 📋 Apa yang Sudah Dibuat?

Sistem cleanup otomatis untuk mencegah database membengkak setelah digunakan dalam jangka waktu lama.

---

## 🔧 File yang Ditambahkan

### 1. **`src/jobs/cleanupJob.js`**
Script otomatis yang membersihkan data lama:
- ✅ Hapus pesan WhatsApp yang sudah terkirim (>30 hari)
- ✅ Hapus pesan gagal (>7 hari)
- ✅ Hapus log API (>1 tahun)
- ✅ Hapus riwayat scan (>6 bulan)

### 2. **`src/index.js`** (Diupdate)
Cleanup scheduler otomatis dijalankan saat server start.

### 3. **`package.json`** (Diupdate)
Ditambahkan dependency `node-cron` untuk scheduling.

---

## 📅 Jadwal Cleanup

**Otomatis berjalan setiap hari jam 02:00 WIB**

Tidak perlu setting cron job manual, sudah terintegrasi dengan aplikasi!

---

## 🚀 Cara Menggunakan

### 1. Install Dependency Baru
```bash
npm install
```

### 2. Restart Server
```bash
npm start
```

### 3. Cleanup Akan Berjalan Otomatis
Setiap hari jam 2 pagi, sistem akan:
- Cek ukuran tabel database
- Hapus data lama
- Tampilkan laporan di console

---

## 🔍 Monitoring

### Cek Ukuran Database
Jalankan query ini di MySQL:

```sql
SELECT 
    table_name AS 'Tabel',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Ukuran (MB)',
    table_rows AS 'Jumlah Baris'
FROM information_schema.TABLES
WHERE table_schema = 'absen'
ORDER BY (data_length + index_length) DESC;
```

### Manual Cleanup (Jika Diperlukan)
Tambahkan endpoint di `routes/webhook.js`:

```javascript
const cleanupJob = require('../jobs/cleanupJob');

router.post('/admin/cleanup', async (req, res) => {
    try {
        await cleanupJob.manualCleanup();
        res.json({ success: true, message: 'Cleanup completed' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

---

## ⚙️ Konfigurasi

Jika ingin mengubah jadwal atau durasi penyimpanan, edit `src/jobs/cleanupJob.js`:

### Ubah Jadwal Cleanup
```javascript
// Baris 104: Ganti '0 2 * * *' dengan format cron yang diinginkan
cron.schedule('0 2 * * *', () => {  // 2 AM setiap hari
    runCleanup();
}, {
    timezone: 'Asia/Jakarta'
});
```

**Format Cron**:
- `0 2 * * *` = Jam 2 pagi setiap hari
- `0 */6 * * *` = Setiap 6 jam
- `0 0 * * 0` = Setiap Minggu jam 12 malam

### Ubah Durasi Penyimpanan
```javascript
// Baris 14: Pesan terkirim (default: 30 hari)
AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY)

// Baris 21: Pesan gagal (default: 7 hari)
AND updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)

// Baris 39: API logs (default: 1 tahun)
WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR)

// Baris 57: Scan history (default: 6 bulan)
WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)
```

---

## 📊 Estimasi Storage

Dengan cleanup otomatis:

| Periode | Tanpa Cleanup | Dengan Cleanup |
|---------|---------------|----------------|
| 1 Tahun | ~120 MB | ~50 MB |
| 5 Tahun | ~600 MB | ~100 MB |
| 10 Tahun | ~1.2 GB | ~150 MB |

**Kesimpulan**: Database bisa bertahan **puluhan tahun** tanpa masalah! 🎉

---

## ⚠️ Catatan Penting

1. **Backup Sebelum Cleanup Pertama**
   ```bash
   mysqldump -u root -p absen > backup_$(date +%Y%m%d).sql
   ```

2. **Log Cleanup**
   Semua aktivitas cleanup akan tercatat di console server.

3. **Data yang Dihapus**
   - ❌ Pesan WhatsApp lama (sudah terkirim)
   - ❌ Log API lama (>1 tahun)
   - ✅ Data absensi siswa **TIDAK DIHAPUS**
   - ✅ Data guru dan siswa **TETAP ADA**

---

## 🆘 Troubleshooting

### Cleanup Tidak Berjalan?
1. Cek apakah server masih running
2. Cek log console untuk error
3. Pastikan timezone server benar (Asia/Jakarta)

### Ingin Cleanup Manual?
Buat endpoint admin atau jalankan langsung:
```javascript
const cleanupJob = require('./src/jobs/cleanupJob');
cleanupJob.manualCleanup();
```

---

## 📞 Support

Jika ada pertanyaan atau masalah, hubungi developer atau cek dokumentasi lengkap di `storage_analysis.md`.
