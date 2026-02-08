/**
 * 使用 Gemini API (Imagen 3) 生成图片
 */

import * as fs from 'fs';
import * as path from 'path';

// 从环境变量获取 API 密钥
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ 错误：请设置 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

interface ImageGenerationRequest {
  prompt: string;
  numberOfImages?: number;
  aspectRatio?: '1:1' | '3:4' | '4:3' | '16:9' | '9:16';
}

interface ImageGenerationResponse {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
}

async function generateImage(options: ImageGenerationRequest): Promise<void> {
  const { prompt, numberOfImages = 1, aspectRatio = '1:1' } = options;
  
  console.log('🎨 正在生成图片...');
  console.log(`📝 提示词: ${prompt}`);
  console.log(`📐 宽高比: ${aspectRatio}`);
  console.log(`🔢 生成数量: ${numberOfImages}`);
  
  // 使用 Imagen 3 模型
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;
  
  const requestBody = {
    instances: [
      {
        prompt: prompt
      }
    ],
    parameters: {
      sampleCount: numberOfImages,
      aspectRatio: aspectRatio,
      // 添加安全设置
      safetyFilterLevel: 'block_some',
      personGeneration: 'allow_adult'
    }
  };
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 请求失败:', response.status, response.statusText);
      console.error('错误详情:', errorText);
      
      // 尝试备用方案：使用 Gemini 2.0 Flash 模型（支持图像生成）
      console.log('\n🔄 尝试使用 Gemini 2.0 Flash 模型生成图片...');
      await generateWithGeminiFlash(prompt);
      return;
    }
    
    const data: ImageGenerationResponse = await response.json();
    
    if (data.predictions && data.predictions.length > 0) {
      const outputDir = path.join(process.cwd(), 'generated-images');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      for (let i = 0; i < data.predictions.length; i++) {
        const prediction = data.predictions[i];
        const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
        const ext = prediction.mimeType === 'image/png' ? 'png' : 'jpg';
        const filename = `illustration_${Date.now()}_${i + 1}.${ext}`;
        const filepath = path.join(outputDir, filename);
        
        fs.writeFileSync(filepath, imageBuffer);
        console.log(`✅ 图片已保存: ${filepath}`);
      }
    } else {
      console.log('⚠️ 没有生成图片');
    }
  } catch (error) {
    console.error('❌ 生成图片时出错:', error);
    // 尝试备用方案
    console.log('\n🔄 尝试使用 Gemini 2.0 Flash 模型生成图片...');
    await generateWithGeminiFlash(prompt);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateWithGeminiFlash(prompt: string, retryCount = 0): Promise<void> {
  const maxRetries = 3;
  
  // 使用 Gemini 3 Pro Image Preview 模型
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`;
  
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE']
    }
  };
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini Flash API 请求失败:', response.status, response.statusText);
      console.error('错误详情:', errorText);
      
      // 检查是否是配额限制错误，如果是则重试
      if (errorText.includes('retryDelay') || errorText.includes('RESOURCE_EXHAUSTED')) {
        const delayMatch = errorText.match(/"retryDelay":\s*"(\d+)s"/);
        const delay = delayMatch ? parseInt(delayMatch[1]) * 1000 : 30000;
        
        if (retryCount < maxRetries) {
          console.log(`⏳ 遇到配额限制，等待 ${delay / 1000} 秒后重试... (${retryCount + 1}/${maxRetries})`);
          await sleep(delay + 1000); // 多等待1秒确保配额恢复
          return generateWithGeminiFlash(prompt, retryCount + 1);
        }
      }
      return;
    }
    
    const data = await response.json();
    console.log('📋 API 响应:', JSON.stringify(data, null, 2));
    
    // 解析响应并保存图片
    if (data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content?.parts || [];
      const outputDir = path.join(process.cwd(), 'generated-images');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      let imageCount = 0;
      for (const part of parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          const mimeType = part.inlineData.mimeType || 'image/png';
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const filename = `illustration_${Date.now()}_${++imageCount}.${ext}`;
          const filepath = path.join(outputDir, filename);
          
          fs.writeFileSync(filepath, imageBuffer);
          console.log(`✅ 图片已保存: ${filepath}`);
        } else if (part.text) {
          console.log('📝 模型回复:', part.text);
        }
      }
      
      if (imageCount === 0) {
        console.log('⚠️ 响应中没有找到图片数据');
      }
    }
  } catch (error) {
    console.error('❌ Gemini Flash 生成图片时出错:', error);
  }
}

// 执行生成
const illustrationPrompt = `A whimsical digital illustration of a cute fox sitting under a cherry blossom tree at sunset. 
The scene features soft pastel colors with pink, orange and purple hues in the sky. 
Petals are gently falling around the fox. 
The atmosphere is dreamy and peaceful. 
Style: watercolor with clean lines, high quality illustration suitable for children's book or greeting card.
The fox has big expressive eyes and fluffy orange fur.`;

generateImage({
  prompt: illustrationPrompt,
  numberOfImages: 1,
  aspectRatio: '1:1'
});
