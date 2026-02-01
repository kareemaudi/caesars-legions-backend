#!/usr/bin/env node
/**
 * Upload to catbox.moe - free, permanent, no account needed
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const videoPath = path.join(__dirname, '../output/caesar-resurrection/out/caesar-resurrection.mp4');

async function upload() {
  console.log('📤 Uploading to catbox.moe (free permanent hosting)...\n');
  
  const stats = fs.statSync(videoPath);
  console.log(`   File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB\n`);
  
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(videoPath));
  
  try {
    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        process.stdout.write(`\r   Progress: ${percent}%`);
      }
    });
    
    const url = response.data.trim();
    
    console.log('\n\n✅ Upload successful!\n');
    console.log('🔗 DOWNLOAD LINK:', url);
    console.log('\n📝 This link is PERMANENT and works unlimited times.');
    console.log('   Share it directly with Kareem!\n');
    
    return url;
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    throw error;
  }
}

upload().catch(console.error);
