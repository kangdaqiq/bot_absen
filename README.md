# Bot WhatsApp Absensi Siswa

Bot WhatsApp untuk mengecek absensi dan rekap absensi siswa berdasarkan nomor WhatsApp yang terdaftar di database.

## 🚀 Fitur

- ✅ Cek absensi hari ini
- 📊 Rekap absensi harian
- 📈 Rekap absensi mingguan
- 📅 Rekap absensi bulanan
- 🔐 Autentikasi berdasarkan nomor WA terdaftar

## 📋 Prasyarat

- Node.js v14 atau lebih tinggi
- MySQL/MariaDB dengan database `absen`
- WhatsApp API (go-whatsapp-web-multidevice) yang sudah berjalan

## 🛠️ Instalasi

1. **Clone atau copy project ini**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Konfigurasi environment**
   
   Copy file `.env.example` menjadi `.env`:
   ```bash
   copy .env.example .env
   ```
   
   Edit file `.env` dan sesuaikan dengan konfigurasi Anda:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=absen
   DB_USER=root
   DB_PASSWORD=your_password

   # WhatsApp API Configuration
   WA_API_URL=http://localhost:3000
   WA_API_USERNAME=admin
   WA_API_PASSWORD=admin

   # Server Configuration
   PORT=3001
   TIMEZONE=Asia/Jakarta
   ```

4. **Jalankan bot**
   ```bash
   npm start
   ```
   
   Atau untuk development dengan auto-reload:
   ```bash
   npm run dev
   ```

## 🔧 Konfigurasi WhatsApp API

Setelah bot berjalan, Anda perlu mengkonfigurasi webhook di WhatsApp API:

### Setup Webhook

1. **Set Webhook URL**
   
   Gunakan endpoint API untuk set webhook:
   ```bash
   curl -X POST http://localhost:3000/app/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "url": "http://your-bot-server:3001/webhook",
       "events": ["message"]
     }'
   ```

2. **Atau via Environment Variable**
   
   Tambahkan di file konfigurasi WhatsApp API:
   ```env
   WEBHOOK_URL=http://your-bot-server:3001/webhook
   WEBHOOK_EVENTS=message
   ```

3. **Format Webhook yang Diterima**
   
   Bot akan menerima webhook dengan format:
   ```json
   {
     "event": "message",
     "device_id": "628987654321@s.whatsapp.net",
     "payload": {
       "id": "3EB0C127D7BACC83D6A1",
       "chat_id": "628987654321@s.whatsapp.net",
       "from": "628123456789@s.whatsapp.net",
       "from_name": "John Doe",
       "timestamp": "2023-10-15T10:30:00Z",
       "body": "absen"
     }
   }
   ```

### Catatan Penting

- Bot hanya memproses event `message` (pesan teks)
- Pesan dari grup akan diabaikan
- Hanya pesan dari chat pribadi yang diproses

## 💬 Cara Penggunaan

Siswa dapat mengirim pesan WhatsApp dengan perintah berikut:

### 1. Menu Bantuan
```
menu
help
bantuan
```

### 2. Cek Absensi Hari Ini
```
absen
cek absen
absensi
```

### 3. Rekap Harian
```
rekap
rekap hari ini
```

### 4. Rekap Mingguan
```
rekap minggu
rekap minggu ini
```

### 5. Rekap Bulanan
```
rekap bulan
rekap bulan ini
```

## 📱 Format Nomor WhatsApp

Nomor WhatsApp di database (`siswa.no_wa`) harus dalam format:
- `081234567890` (dengan 0 di depan)
- `6281234567890` (dengan kode negara)
- `81234567890` (tanpa 0 dan kode negara)

Bot akan otomatis mencocokkan berbagai format nomor.

## 🗂️ Struktur Project

```
bot_wa/
├── src/
│   ├── config/
│   │   ├── database.js      # Konfigurasi database
│   │   └── whatsapp.js      # Konfigurasi WhatsApp API
│   ├── services/
│   │   ├── attendanceService.js  # Logic absensi
│   │   └── messageService.js     # Logic pesan
│   ├── handlers/
│   │   └── messageHandler.js     # Handler pesan masuk
│   ├── routes/
│   │   └── webhook.js            # Routes webhook
│   └── index.js             # Entry point
├── .env                     # Konfigurasi (jangan commit!)
├── .env.example             # Template konfigurasi
├── .gitignore
├── package.json
└── README.md
```

## 🔍 Troubleshooting

### Bot tidak merespons
1. Pastikan bot sudah running (`npm start`)
2. Cek koneksi database berhasil
3. Pastikan webhook sudah dikonfigurasi dengan benar di WhatsApp API
4. Cek log bot untuk melihat apakah webhook diterima
5. Test webhook dengan curl:
   ```bash
   curl -X POST http://localhost:3001/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "event": "message",
       "device_id": "628987654321@s.whatsapp.net",
       "payload": {
         "from": "6281234567890@s.whatsapp.net",
         "from_name": "Test User",
         "chat_id": "6281234567890@s.whatsapp.net",
         "body": "menu",
         "timestamp": "2025-12-29T07:00:00Z"
       }
     }'
   ```

### Nomor tidak terdaftar
1. Pastikan nomor WA siswa sudah ada di database (`siswa.no_wa`)
2. Cek format nomor di database
3. Pastikan nomor WA yang digunakan sama dengan yang terdaftar

### Database connection error
1. Cek kredensial database di file `.env`
2. Pastikan MySQL/MariaDB sudah running
3. Pastikan database `absen` sudah ada

### Webhook tidak diterima
1. Cek URL webhook sudah benar di WhatsApp API
2. Pastikan bot dapat diakses dari server WhatsApp API
3. Cek firewall tidak memblokir koneksi
4. Lihat log WhatsApp API untuk error webhook

## 📝 Catatan

- Bot hanya merespons siswa yang nomor WA-nya terdaftar di database
- Timezone default adalah Asia/Jakarta
- Bot menggunakan connection pooling untuk performa optimal
- Semua perintah case-insensitive (tidak peduli huruf besar/kecil)

## 🤝 Support

Jika ada pertanyaan atau masalah, silakan hubungi admin sistem.

## 📄 License

ISC
