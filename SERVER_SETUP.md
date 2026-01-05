# Setup Bot WhatsApp di Server Ubuntu

## Konfigurasi Saat Ini

WhatsApp API Anda sudah running dengan:
- Port: (perlu konfirmasi, default 3000)
- Basic Auth: `admin:04112000`
- Webhook: `http://localhost:5000/webhook` (PERLU DIUBAH)

## Langkah Setup Bot

### 1. Upload Bot ke Server

```bash
# Di komputer lokal, compress bot
cd d:\bot_wa
tar -czf bot_wa.tar.gz --exclude=node_modules .

# Upload ke server (ganti IP_SERVER)
scp bot_wa.tar.gz root@IP_SERVER:/root/

# Di server, extract
ssh root@IP_SERVER
cd /root
tar -xzf bot_wa.tar.gz -C /root/bot_wa
cd /root/bot_wa
```

### 2. Install Dependencies di Server

```bash
cd /root/bot_wa
npm install
```

### 3. Konfigurasi Environment

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
DB_PASSWORD=YOUR_MYSQL_PASSWORD

# WhatsApp API Configuration
WA_API_URL=http://localhost:3000
WA_API_USERNAME=admin
WA_API_PASSWORD=04112000

# Server Configuration
PORT=3001
TIMEZONE=Asia/Jakarta
```

### 4. Update Webhook di WhatsApp API

Edit service WhatsApp:
```bash
sudo nano /etc/systemd/system/whatsapp.service
```

Ubah baris webhook dari:
```
--webhook http://localhost:5000/webhook
```

Menjadi:
```
--webhook http://localhost:3001/webhook
```

File lengkap:
```ini
[Unit]
Description=Go WhatsApp Web Multi Device
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/whatsapp/src
ExecStart=/root/whatsapp/src/whatsapp rest --basic-auth admin:04112000 --webhook http://localhost:3001/webhook --port 3000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Reload dan restart WhatsApp service:
```bash
sudo systemctl daemon-reload
sudo systemctl restart whatsapp
sudo systemctl status whatsapp
```

### 5. Buat Systemd Service untuk Bot

```bash
sudo nano /etc/systemd/system/whatsapp-bot.service
```

Isi dengan:
```ini
[Unit]
Description=WhatsApp Bot Absensi
After=network.target whatsapp.service
Requires=whatsapp.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/bot_wa
ExecStart=/usr/bin/node /root/bot_wa/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment variables (optional, bisa pakai .env)
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 6. Enable dan Start Bot Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-bot
sudo systemctl start whatsapp-bot
sudo systemctl status whatsapp-bot
```

### 7. Verifikasi

Cek log bot:
```bash
sudo journalctl -u whatsapp-bot -f
```

Cek log WhatsApp API:
```bash
sudo journalctl -u whatsapp -f
```

Test webhook:
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

## Troubleshooting

### Bot tidak menerima webhook
```bash
# Cek bot running
sudo systemctl status whatsapp-bot

# Cek port bot
sudo netstat -tlnp | grep 3001

# Cek log
sudo journalctl -u whatsapp-bot -n 50
```

### WhatsApp API tidak kirim webhook
```bash
# Cek WhatsApp service
sudo systemctl status whatsapp

# Cek log WhatsApp
sudo journalctl -u whatsapp -n 50

# Test manual
curl -X POST http://localhost:3001/webhook -d '{"event":"message","payload":{"from":"628xxx@s.whatsapp.net","body":"test"}}'
```

### Database connection error
```bash
# Cek MySQL running
sudo systemctl status mysql

# Test koneksi
mysql -u root -p absen
```

## Perintah Berguna

```bash
# Restart semua service
sudo systemctl restart whatsapp whatsapp-bot

# Stop semua
sudo systemctl stop whatsapp whatsapp-bot

# Lihat log real-time
sudo journalctl -u whatsapp-bot -u whatsapp -f

# Cek status
sudo systemctl status whatsapp whatsapp-bot
```

## Catatan Penting

1. **Port 3001** harus terbuka jika bot di server berbeda dengan WhatsApp API
2. **Firewall** - Pastikan tidak memblokir port 3001
3. **Database** - Bot harus bisa akses database `absen`
4. **Webhook URL** - Gunakan `localhost` karena bot dan WhatsApp API di server yang sama
