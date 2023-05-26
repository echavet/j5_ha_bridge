#!/bin/bash

if [ $# -ne 1 ]; then
  echo "Usage: $0 ENV"
  exit 1
fi

env=$1

if [ "$env" = "DEV" ]; then
  target="echavet@ha-test.local:/root/addons/configurablefirmata_hassio_bridge/"
elif [ "$env" = "PROD" ]; then
  target="echavet@homeassistant.local:/root/addons/configurablefirmata_hassio_bridge/"
else
  echo "Invalid environment"
  exit 1
fi

scp -r ./* "$target"

#for file in *; do
#  if [ ! -d "$file" ]; then
#    scp -i ./copytoHA -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$file" "$target"
#  fi
#done

echo "Done copying files to $env environment."
