IMPORT_PATH=$1

# Eğer path girilmemişse hata verip çık
if [ -z "$IMPORT_PATH" ]; then
  echo "Hata: Lütfen bir import path belirtin."
  echo "Kullanım: ./script_adi.sh ./emulator_data_load"
  exit 1
fi

echo "Sahte veri oluşturmak için scripti çalıştır!"
firebase emulators:start --export-on-exit="$IMPORT_PATH"