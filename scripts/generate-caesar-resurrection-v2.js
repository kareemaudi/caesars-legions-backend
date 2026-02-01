#!/usr/bin/env node
/**
 * Generate "Caesar's Resurrection" video frames (SAFE VERSION)
 * Artistic interpretation - Renaissance painting style
 */

require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const outputDir = path.join(__dirname, '../output/caesar-resurrection');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Key frames - artistic, safe version
const frames = [
  {
    filename: '01-fallen-caesar.png',
    prompt: `Renaissance painting style: Julius Caesar in dramatic pose lying on ornate marble floor, wearing white Roman toga, golden laurel crown beside him, dramatic chiaroscuro lighting from above, classical Greek columns in background, highly detailed oil painting aesthetic, 8K quality, Caravaggio lighting style, dignified composition`
  },
  {
    filename: '02-awakening.png',
    prompt: `Renaissance painting style: Julius Caesar's face in close-up, eyes opening with ethereal blue supernatural glow, expression of power and determination, golden light rays surrounding him, dramatic lighting, Baroque painting aesthetic, highly detailed, 8K quality, mystical atmosphere, divine resurrection theme`
  },
  {
    filename: '03-rising-power.png',
    prompt: `Renaissance painting style: Julius Caesar sitting up with powerful presence, blue mystical energy swirling around his body, white toga flowing dramatically, marble Roman architecture background, golden hour lighting, Michelangelo-inspired composition, highly detailed, 8K quality, epic resurrection scene`
  },
  {
    filename: '04-supernatural-energy.png',
    prompt: `Renaissance painting style: Julius Caesar kneeling in powerful stance, arms raised upward, blue supernatural energy and golden light emanating from his entire body, toga glowing with divine light, Roman temple columns in background, dramatic backlit composition, highly detailed, 8K quality, god-like transformation`
  },
  {
    filename: '05-standing-triumph.png',
    prompt: `Renaissance painting style: Julius Caesar standing tall in triumphant heroic pose, restored and powerful, pristine white toga, golden laurel crown, blue energy aura fading to golden divine light, Roman architecture background, dramatic cinematic lighting, Raphael-inspired composition, highly detailed, 8K quality, victorious resurrection`
  },
  {
    filename: '06-immortal-caesar.png',
    prompt: `Renaissance painting style: Fully resurrected Julius Caesar in god-like commanding pose, golden divine aura surrounding him, white toga with gold trim, laurel crown gleaming, Roman temple with marble columns background, rays of golden sunlight, majestic and powerful presence, masterpiece oil painting aesthetic, highly detailed, 8K quality, immortal emperor`
  }
];

async function generateFrame(frame, index) {
  console.log(`\n🎨 Frame ${index + 1}/${frames.length}: ${frame.filename}`);
  
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: frame.prompt,
      n: 1,
      size: '1792x1024',
      quality: 'hd'
    });
    
    const imageUrl = response.data[0].url;
    console.log(`   ✅ Generated! Downloading...`);
    
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const outputPath = path.join(outputDir, frame.filename);
    fs.writeFileSync(outputPath, imageResponse.data);
    
    console.log(`   💾 ${frame.filename}`);
    
    return { filename: frame.filename, path: outputPath, url: imageUrl };
  } catch (error) {
    console.error(`   ❌ Failed:`, error.response?.data?.error?.message || error.message);
    return null;
  }
}

async function generateAll() {
  console.log('🏛️ CAESAR\'S RESURRECTION\n');
  console.log(`Generating ${frames.length} cinematic frames...\n`);
  
  const results = [];
  
  for (let i = 0; i < frames.length; i++) {
    const result = await generateFrame(frames[i], i);
    if (result) results.push(result);
    
    if (i < frames.length - 1) {
      console.log(`\n   ⏳ 15 seconds...`);
      await new Promise(r => setTimeout(r, 15000));
    }
  }
  
  fs.writeFileSync(
    path.join(outputDir, 'frames.json'),
    JSON.stringify({
      title: "Caesar's Resurrection",
      frames: results,
      created: new Date().toISOString()
    }, null, 2)
  );
  
  console.log(`\n\n✅ Complete! ${results.length}/${frames.length} frames`);
  console.log(`📁 ${outputDir}`);
  
  return results;
}

generateAll().catch(console.error);
