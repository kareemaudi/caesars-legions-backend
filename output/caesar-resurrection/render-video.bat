@echo off
echo 🏛️ Rendering Caesar's Resurrection Video...
echo.

npx remotion render src/index.ts CaesarResurrection out/caesar-resurrection.mp4

echo.
echo ✅ Done! Video saved to: out\caesar-resurrection.mp4
pause
