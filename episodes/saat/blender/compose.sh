#!/usr/bin/env bash
# compose.sh <preview_dir> <out.png> : f####_top/bot → üst+alt yığın, f####_full → olduğu gibi; hepsi 270x480 sheet
d=$1; out=$2; tmp=$(mktemp -d)
for f in $(ls $d | sed -E 's/_(full|top|bot)\.png//' | sort -u); do
  if [ -f $d/${f}_top.png ]; then
    ffmpeg -loglevel error -y -i $d/${f}_top.png -i $d/${f}_bot.png -filter_complex "[0]scale=270:240[a];[1]scale=270:240[b];[a][b]vstack" $tmp/${f}_p.png
  fi
  [ -f $d/${f}_full.png ] && ffmpeg -loglevel error -y -i $d/${f}_full.png -vf scale=270:480 $tmp/${f}_f.png
done
bin/sheet $tmp $out; rm -r $tmp
