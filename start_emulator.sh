#!/bin/bash

# functions dizinine git ve build et
cd functions || exit
npm run build || exit

# root dizine dön
cd .. || exit
ls
# Emulator'ları başlat ve önceden kaydedilmiş veriyi yükle
firebase emulators:start --import=./emulator_data