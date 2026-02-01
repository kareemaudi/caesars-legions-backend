#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const videoPath = path.join(__dirname, '../output/caesar-resurrection/out/caesar-resurrection.mp4');

async function upload() {
  console.log('📤 Uploading video...\n');
  
  const form = new FormData();
  form.append('file', fs.createReadStream(videoPath));
  
  const response = await axios.post('https://file.io', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  
  console.log('\n✅ Uploaded!');
  console.log('\nFull response:', JSON.stringify(response.data, null, 2));
  
  if (response.data.success) {
    console.log('\n🔗 DOWNLOAD LINK:', response.data.link);
    console.log('\n⚠️  ONE-TIME DOWNLOAD ONLY!');
    return response.data.link;
  } else {
    throw new Error('Upload failed: ' + JSON.stringify(response.data));
  }
}

upload().catch(console.error);
