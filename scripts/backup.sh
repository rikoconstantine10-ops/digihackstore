#!/bin/bash
# ==========================================================
# Digihackstore — Daily Backup Script
# ==========================================================
# Setup (jalankan sekali di VPS):
#   1. Buat file /home/ubuntu/.backup_env berisi:
#        GH_TOKEN=ghp_xxxxxxxxxxxxx
#   2. chmod 600 /home/ubuntu/.backup_env
#   3. chmod +x /home/ubuntu/store/scripts/backup.sh
#   4. crontab -e  →  tambahkan baris:
#        0 2 * * * /home/ubuntu/store/scripts/backup.sh >> /home/ubuntu/backup.log 2>&1
# ==========================================================

set -e

# Load GitHub token
if [ -f /home/ubuntu/.backup_env ]; then
  source /home/ubuntu/.backup_env
else
  echo "ERROR: /home/ubuntu/.backup_env tidak ditemukan."
  echo "Buat file tersebut dengan isi: GH_TOKEN=ghp_xxxxx"
  exit 1
fi

STORE_DIR="/home/ubuntu/store"
BACKUP_REPO="rikoconstantine10-ops/digihackstore_backup"
BACKUP_DIR="/home/ubuntu/digihackstore_backup"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

echo "[$TIMESTAMP] Mulai backup Digihackstore..."

# Clone atau pull backup repo
if [ ! -d "$BACKUP_DIR/.git" ]; then
  echo "  Clone backup repo..."
  git clone "https://$GH_TOKEN@github.com/$BACKUP_REPO.git" "$BACKUP_DIR"
else
  cd "$BACKUP_DIR"
  git remote set-url origin "https://$GH_TOKEN@github.com/$BACKUP_REPO.git"
  git pull origin main --rebase 2>/dev/null || true
fi

cd "$BACKUP_DIR"
git config user.email "backup@digihackstore.com"
git config user.name "Digihackstore Backup Bot"

# Backup database utama
mkdir -p database
sqlite3 "$STORE_DIR/data/store.db" ".dump" > "database/store_${DATE}.sql"
echo "  ✓ Database dump: database/store_${DATE}.sql"

# Hapus backup lebih dari 30 hari
find database/ -name "store_*.sql" -mtime +30 -delete 2>/dev/null || true

# Simpan daftar key .env (tanpa nilai sensitif)
if [ -f "$STORE_DIR/.env" ]; then
  grep -E "^[A-Z_]+=" "$STORE_DIR/.env" | sed 's/=.*/=<REDACTED>/' > env_keys.txt
  echo "  ✓ Daftar key .env disimpan (nilai disembunyikan)"
fi

# Info PM2
pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
  for p in data:
    print(f\"  {p['name']}: {p['pm2_env']['status']}\")
except: pass
" > pm2_status.txt 2>/dev/null || true

# Commit & push
git add -A
if git diff --staged --quiet; then
  echo "  - Tidak ada perubahan sejak backup terakhir"
else
  git commit -m "backup: $DATE"
  git push origin main
  echo "  ✓ Push ke GitHub berhasil"
fi

echo "[$TIMESTAMP] Backup selesai!"
