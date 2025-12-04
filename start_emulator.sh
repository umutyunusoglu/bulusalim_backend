#!/bin/bash

# Kullanıcıdan path'i al (ilk argüman)
IMPORT_PATH=$1

# Eğer path girilmemişse hata verip çık
if [ -z "$IMPORT_PATH" ]; then
  echo "Hata: Lütfen bir import path belirtin."
  echo "Kullanım: ./script_adi.sh ./emulator_data_load"
  exit 1
fi

# functions dizinine git ve build et
cd functions || exit
npm run build || exit

# root dizine dön
cd .. || exit
ls

# Emulator'ları başlat ve verilen path'i kullan
echo "Emulator başlatılıyor, veri kaynağı: $IMPORT_PATH"
firebase emulators:start --import="$IMPORT_PATH"