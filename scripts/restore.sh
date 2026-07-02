#!/bin/bash
# ==========================================================
# Digihackstore — Restore dari Backup
# ==========================================================
# Usage:
#   ./restore.sh              → restore backup terbaru
#   ./restore.sh 2026-06-29   → restore backup tanggal tertentu
# ==========================================================

set -e

STORE_DIR="/home/ubuntu/store"
BACKUP_DIR="/home/ubuntu/digihackstore_backup"

# Cari tanggal backup
if [ -n "$1" ]; then
  DATE="$1"
else
  DATE=$(ls "$BACKUP_DIR/database/" 2>/dev/null | grep "store_" | sort | tail -1 | sed 's/store_//' | sed 's/\.sql//')
fi

if [ -z "$DATE" ]; then
  echo "ERROR: Tidak ada backup ditemukan di $BACKUP_DIR/database/"
  exit 1
fi

SQL_FILE="$BACKUP_DIR/database/store_${DATE}.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: File backup tidak ditemukan: $SQL_FILE"
  echo "Backup tersedia:"
  ls "$BACKUP_DIR/database/" 2>/dev/null | grep "store_" | sort
  exit 1
fi

echo "=========================================="
echo "  Digihackstore — Restore Database"
echo "=========================================="
echo "  Tanggal backup : $DATE"
echo "  File           : $SQL_FILE"
echo "  Target         : $STORE_DIR/data/store.db"
echo "=========================================="
echo ""
read -p "Lanjutkan restore? Database saat ini akan ditimpa. (ketik 'ya' untuk lanjut): " confirm

if [ "$confirm" != "ya" ]; then
  echo "Restore dibatalkan."
  exit 0
fi

# Stop server
echo ""
echo "Menghentikan server..."
pm2 stop digihack-store 2>/dev/null || true

# Backup database saat ini sebelum ditimpa
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [ -f "$STORE_DIR/data/store.db" ]; then
  cp "$STORE_DIR/data/store.db" "$STORE_DIR/data/store.db.pre_restore_${TIMESTAMP}"
  echo "✓ Database lama di-backup ke: store.db.pre_restore_${TIMESTAMP}"
fi

# Restore
rm -f "$STORE_DIR/data/store.db"
sqlite3 "$STORE_DIR/data/store.db" < "$SQL_FILE"
echo "✓ Database di-restore dari backup $DATE"

# Start server kembali
pm2 start digihack-store
echo "✓ Server kembali online"
echo ""
echo "Restore selesai! Cek web untuk memastikan berjalan normal."
