#!/usr/bin/env node
/**
 * Upload to GoFile.io - free, fast, reliable
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const videoPath = path.join(__dirname, '../output/caesar-resurrection/out/caesar-resurrection.mp4');

async function upload() {
  console.log('📤 Uploading to GoFile.io...\n');
  
  // Step 1: Get best server
  console.log('1️⃣  Getting upload server...');
  const serverResp = await axios.get('https://api.gofile.io/getServer');
  const server = serverResp.data.data.server;
  console.log(`   Server: ${server}\n`);
  
  // Step 2: Upload file
  console.log('2️⃣  Uploading video (31.37 MB)...');
  const form = new FormData();
  form.append('file', fs.createReadStream(videoPath));
  
  const uploadResp = await axios.post(`https://${server}.gofile.io/uploadFile`, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    onUploadProgress: (p) => {
      const pct = Math.round((p.loaded * 100) / p.total);
      process.stdout.write(`\r   Progress: ${pct}%`);
    }
  });
  
  console.log('\n\n✅ Upload successful!\n');
  console.log('🔗 DOWNLOAD LINK:', uploadResp.data.data.downloadPage);
  console.log('\n📝 Link is permanent and works unlimited times!');
  console.log('   Share it with Kareem now!\n');
  
  return uploadResp.data.data.downloadPage;
}

upload().catch(err => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
