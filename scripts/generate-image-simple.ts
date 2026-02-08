/**
 * 简化版 Gemini 图像生成脚本 - 单次请求，不重试
 */

import * as fs from 'fs';
import * as path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ 错误：请设置 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

async function generateImage(): Promise<void> {
  const prompt = `A cute cartoon fox sitting under a cherry blossom tree, watercolor style, soft pink and orange colors`;
  
  console.log('🎨 正在生成图片（单次请求）...');
  console.log(`📝 提示词: ${prompt}`);
  
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${API_KEY}`;
  
  const requestBody = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE']
    }
  };
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ 请求失败:', response.status);
      console.error('错误详情:', responseText);
      return;
    }
    
    const data = JSON.parse(responseText);
    
    if (data.candidates?.[0]?.content?.parts) {
      const outputDir = path.join(process.cwd(), 'generated-images');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          const filename = `fox_illustration_${Date.now()}.png`;
          const filepath = path.join(outputDir, filename);
          fs.writeFileSync(filepath, imageBuffer);
          console.log(`✅ 图片已保存: ${filepath}`);
        } else if (part.text) {
          console.log('📝 模型回复:', part.text);
        }
      }
    } else {
      console.log('⚠️ 响应中没有图片');
      console.log('响应内容:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ 出错:', error);
  }
}

generateImage();
