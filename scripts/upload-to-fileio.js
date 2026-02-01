#!/usr/bin/env node
/**
 * Upload video to file.io (temporary file hosting)
 * Free, no account needed, 14-day expiry
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const videoPath = path.join(__dirname, '../output/caesar-resurrection/out/caesar-resurrection.mp4');

async function uploadVideo() {
  console.log('📤 Uploading Caesar\'s Resurrection video to file.io...\n');
  
  const stats = fs.statSync(videoPath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`📁 File size: ${fileSizeMB} MB`);
  console.log(`📂 Path: ${videoPath}\n`);
  
  const form = new FormData();
  form.append('file', fs.createReadStream(videoPath));
  form.append('expires', '7d'); // 7 day expiry
  
  try {
    console.log('⏳ Uploading (this may take 1-2 minutes)...\n');
    
    const response = await axios.post('https://file.io', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        process.stdout.write(`\r   Progress: ${percentCompleted}%`);
      }
    });
    
    console.log('\n\n✅ Upload complete!\n');
    console.log('🔗 Download link:', response.data.link);
    console.log('⏰ Expires in: 7 days');
    console.log('📝 Note: Link works ONE TIME ONLY - download it once!\n');
    
    return response.data.link;
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

uploadVideo()
  .then(link => {
    console.log('Done! Send this link to Kareem.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
