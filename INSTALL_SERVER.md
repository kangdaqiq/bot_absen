# Panduan Install Bot WhatsApp di Server Ubuntu

Panduan lengkap untuk install bot di server yang sama dengan WhatsApp API.

## Prasyarat

- Server Ubuntu dengan WhatsApp API sudah running
- MySQL/MariaDB sudah terinstall dengan database `absen`
- Node.js sudah terinstall (minimal v14)
- Akses SSH ke server

---

## Langkah 1: Persiapan File Bot

### Di Komputer Windows:

```powershell
# Buka PowerShell di folder bot
cd d:\bot_wa

# Buat archive (tanpa node_modules untuk menghemat ukuran)
tar -czf bot_wa.tar.gz --exclude=node_modules --exclude=.git .
```

---

## Langkah 2: Upload ke Server

### Opsi A: Menggunakan WinSCP (GUI)
1. Download WinSCP: https://winscp.net/
2. Connect ke server (IP: 192.168.1.197, User: root)
3. Upload file `bot_wa.tar.gz` ke `/root/`

### Opsi B: Menggunakan SCP (Command Line)
```powershell
# Di PowerShell
scp bot_wa.tar.gz root@192.168.1.197:/root/
```

---

## Langkah 3: Extract dan Setup di Server

SSH ke server:
```bash
ssh root@192.168.1.197
```

Extract dan setup:
```bash
# Buat folder untuk bot
mkdir -p /root/bot_wa
cd /root/bot_wa

# Extract file
tar -xzf /root/bot_wa.tar.gz

# Install dependencies
npm install

# Cek instalasi berhasil
ls -la
```

---

## Langkah 4: Konfigurasi Environment

Buat file `.env`:
```bash
cd /root/bot_wa
nano .env
```

Isi dengan:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=absen
DB_USER=root
DB_PASSWORD=04112000

# WhatsApp API Configuration
WA_API_URL=http://localhost:3000
WA_API_USERNAME=admin
WA_API_PASSWORD=04112000

# Server Configuration
PORT=3001
TIMEZONE=Asia/Jakarta
```

Simpan: `Ctrl+O`, Enter, `Ctrl+X`

---

## Langkah 5: Test Bot Manual

Test bot sebelum setup service:
```bash
cd /root/bot_wa
npm start
```

Output yang diharapkan:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 WhatsApp Bot Absensi
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Database connected successfully
✅ Server running on port 3001
📡 Webhook URL: http://localhost:3001/webhook
🌐 Health check: http://localhost:3001/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Jika ada error database, cek password MySQL di `.env`

Test selesai, stop dengan `Ctrl+C`

---

## Langkah 6: Update WhatsApp Service

Edit service WhatsApp:
```bash
sudo nano /etc/systemd/system/whatsapp.service
```

Ubah baris webhook:
```ini
[Unit]
Description=Go WhatsApp Web Multi Device
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/whatsapp/src
ExecStart=/root/whatsapp/src/whatsapp rest --basic-auth admin:04112000 --webhook http://localhost:3001/webhook --webhook-events message --port 3000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Simpan dan restart WhatsApp:
```bash
sudo systemctl daemon-reload
sudo systemctl restart whatsapp
sudo systemctl status whatsapp
```

---

## Langkah 7: Buat Service untuk Bot

Buat file service:
```bash
sudo nano /etc/systemd/system/whatsapp-bot.service
```

Isi dengan:
```ini
[Unit]
Description=WhatsApp Bot Absensi
After=network.target mysql.service whatsapp.service
Requires=mysql.service
Wants=whatsapp.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/bot_wa
ExecStart=/usr/bin/node /root/bot_wa/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Simpan: `Ctrl+O`, Enter, `Ctrl+X`

---

## Langkah 8: Enable dan Start Bot Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable bot (auto start saat boot)
sudo systemctl enable whatsapp-bot

# Start bot
sudo systemctl start whatsapp-bot

# Cek status
sudo systemctl status whatsapp-bot
```

Output yang diharapkan:
```
● whatsapp-bot.service - WhatsApp Bot Absensi
   Loaded: loaded (/etc/systemd/system/whatsapp-bot.service; enabled)
   Active: active (running) since ...
```

---

## Langkah 9: Verifikasi

### Cek Log Bot:
```bash
sudo journalctl -u whatsapp-bot -f
```

Tekan `Ctrl+C` untuk keluar

### Cek Log WhatsApp API:
```bash
sudo journalctl -u whatsapp -f
```

### Test Webhook Manual:
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
      "timestamp": "2025-12-29T08:00:00Z"
    }
  }'
```

Response yang diharapkan:
```json
{
  "success": true,
  "message": "Response sent",
  "student": "Nama Siswa",
  "command": "help"
}
```

---

## Langkah 10: Test dari WhatsApp

1. Pastikan WhatsApp API sudah terscan QR code
2. Kirim pesan "menu" dari nomor WA siswa yang terdaftar di database
3. Bot harus membalas dengan menu bantuan

---

## Perintah Berguna

### Monitoring:
```bash
# Lihat log real-time (kedua service)
sudo journalctl -u whatsapp-bot -u whatsapp -f

# Lihat log 50 baris terakhir
sudo journalctl -u whatsapp-bot -n 50

# Cek status semua service
sudo systemctl status whatsapp whatsapp-bot mysql
```

### Restart Services:
```bash
# Restart bot saja
sudo systemctl restart whatsapp-bot

# Restart WhatsApp API saja
sudo systemctl restart whatsapp

# Restart semua
sudo systemctl restart whatsapp whatsapp-bot
```

### Stop Services:
```bash
# Stop bot
sudo systemctl stop whatsapp-bot

# Stop semua
sudo systemctl stop whatsapp whatsapp-bot
```

### Disable Auto-start:
```bash
# Disable bot
sudo systemctl disable whatsapp-bot
```

---

## Troubleshooting

### Bot tidak start:
```bash
# Cek log error
sudo journalctl -u whatsapp-bot -n 100

# Cek file .env
cat /root/bot_wa/.env

# Test manual
cd /root/bot_wa
npm start
```

### Database connection error:
```bash
# Cek MySQL running
sudo systemctl status mysql

# Test koneksi
mysql -u root -p04112000 absen

# Cek user MySQL
mysql -u root -p04112000 -e "SELECT user, host FROM mysql.user;"
```

### Webhook tidak diterima:
```bash
# Cek port 3001 listening
sudo netstat -tlnp | grep 3001

# Cek WhatsApp service webhook config
sudo systemctl cat whatsapp | grep webhook

# Test webhook manual
curl http://localhost:3001/webhook
```

### Bot tidak balas pesan:
```bash
# Cek log bot saat ada pesan masuk
sudo journalctl -u whatsapp-bot -f

# Cek nomor WA terdaftar di database
mysql -u root -p04112000 absen -e "SELECT nama, no_wa FROM siswa WHERE no_wa IS NOT NULL;"

# Cek WhatsApp API kirim webhook
sudo journalctl -u whatsapp | grep webhook
```

---

## Update Bot

Jika ada perubahan kode:

```bash
# Di Windows, buat archive baru
cd d:\bot_wa
tar -czf bot_wa.tar.gz --exclude=node_modules .

# Upload ke server (via WinSCP atau scp)

# Di server
sudo systemctl stop whatsapp-bot
cd /root/bot_wa
tar -xzf /root/bot_wa.tar.gz
npm install
sudo systemctl start whatsapp-bot
sudo systemctl status whatsapp-bot
```

---

## Uninstall

Jika ingin hapus bot:

```bash
# Stop dan disable service
sudo systemctl stop whatsapp-bot
sudo systemctl disable whatsapp-bot

# Hapus service file
sudo rm /etc/systemd/system/whatsapp-bot.service
sudo systemctl daemon-reload

# Hapus folder bot
rm -rf /root/bot_wa

# Hapus archive
rm /root/bot_wa.tar.gz
```

---

## Keamanan

### Ganti Password MySQL:
```bash
mysql -u root -p
ALTER USER 'root'@'localhost' IDENTIFIED BY 'PasswordBaru123!';
FLUSH PRIVILEGES;
EXIT;

# Update .env
nano /root/bot_wa/.env
# Ubah DB_PASSWORD

# Restart bot
sudo systemctl restart whatsapp-bot
```

### Backup Database:
```bash
# Backup otomatis setiap hari
crontab -e

# Tambahkan:
0 2 * * * mysqldump -u root -p04112000 absen > /root/backup/absen_$(date +\%Y\%m\%d).sql
```

---

## Selesai! 🎉

Bot WhatsApp sudah running di server dan siap menerima pesan dari siswa!

**Checklist:**
- ✅ Bot running di port 3001
- ✅ WhatsApp API running di port 3000
- ✅ Webhook configured: http://localhost:3001/webhook
- ✅ Database connected
- ✅ Auto-start enabled

**Test:**
Kirim "menu" dari nomor WA siswa yang terdaftar!
