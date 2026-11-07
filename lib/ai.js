const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const { uploadBufferToMega, listMegaFiles } = require('./mega');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1. Process Text & Interactive Commands
async function processUserMessage(userMessage, callbackData = null) {
  const query = callbackData || userMessage;
  const lowerQuery = query.toLowerCase();

  try {
    // Menu Trigger
    if (lowerQuery.includes('menu') || lowerQuery.includes('මෙනු') || lowerQuery.includes('help')) {
      return {
        type: 'list',
        headerText: 'Mastermind Hub 🚀',
        bodyText: 'Select an option / පහත මෙනුවෙන් අවශ්‍ය සේවාව තෝරන්න:',
        buttonText: 'Open Menu 📋',
        sections: [
          {
            title: 'AI & Web Features 🌐',
            rows: [
              { id: 'feat_search', title: 'Live Web Search 🔍', description: 'Search latest news & internet data' },
              { id: 'feat_image', title: 'Generate Photo 🖼️', description: 'Get high quality pictures via keywords' }
            ]
          },
          {
            title: 'Cloud Storage 📦',
            rows: [
              { id: 'feat_megalist', title: 'List Mega Files 📂', description: 'View files stored in Mega cloud' }
            ]
          }
        ]
      };
    }

    // Web Search Feature
    if (callbackData === 'feat_search' || lowerQuery.startsWith('search:')) {
      const searchQuery = lowerQuery.replace('search:', '').trim();
      if (!searchQuery || searchQuery === 'feat_search') {
        return { type: 'text', content: '🌐 Please type your search query like: `search: latest tech news`' };
      }
      
      const searchResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `Find current details about: ${searchQuery}`,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: "Provide concise, accurate answers in Sinhala or English depending on user input."
        }
      });
      return { type: 'text', content: `🌐 **Web Search Results:**\n\n${searchResponse.text}` };
    }

    // Image Generator / Fetcher
    if (callbackData === 'feat_image' || lowerQuery.startsWith('image:') || lowerQuery.startsWith('පින්තූරය:')) {
      const parts = query.split(':');
      const imgKeyword = parts[1] ? parts[1].trim() : 'nature scenic';
      const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(imgKeyword)}/1200/800`;
      
      return {
        type: 'image',
        url: imageUrl,
        caption: `🖼️ Photo for keyword: "${imgKeyword}"`
      };
    }

    // List Mega Files
    if (callbackData === 'feat_megalist') {
      const res = await listMegaFiles();
      if (!res.success) return { type: 'text', content: '❌ Error connecting to Mega storage.' };
      
      const fileListStr = res.files.length > 0 
        ? res.files.map(f => `• ${f.name} (${Math.round(f.size/1024)} KB)`).join('\n')
        : 'No files found in Mega storage.';
        
      return { type: 'text', content: `📦 **Your Mega Cloud Files:**\n\n${fileListStr}` };
    }

    // General Conversational AI (Sinhala & English)
    const chatResponse = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: query,
      config: {
        systemInstruction: "You are Mastermind AI, an advanced WhatsApp assistant built for Nipuna. You fluently understand and reply in both Sinhala and English naturally. Be sharp, friendly, and helpful."
      }
    });

    return { type: 'text', content: chatResponse.text };

  } catch (error) {
    console.error('AI Processing Error:', error);
    return { type: 'text', content: '⚠️ An error occurred while processing your request.' };
  }
}

// 2. Process Incoming Documents & Media (Upload only if "only" or "upload" is specified)
async function handleIncomingMediaOrDocument(message) {
  try {
    let mediaId, defaultName;
    const caption = message.caption ? message.caption.toLowerCase() : '';

    if (message.type === 'document') {
      mediaId = message.document.id;
      defaultName = message.document.filename || `document_${Date.now()}`;
      if (!caption.includes('only') && !caption.includes('පමණයි') && !caption.includes('upload')) {
        return { type: 'text', content: `📄 Received *"${defaultName}"*. Add **"only"** or **"upload"** in the caption if you want me to backup it to Mega! ☁️` };
      }
    } else if (message.type === 'image' || message.type === 'video') {
      const ext = message.type === 'image' ? 'jpg' : 'mp4';
      mediaId = message.type === 'image' ? message.image.id : message.video.id;
      defaultName = `${message.type}_${Date.now()}.${ext}`;
      
      if (!caption.includes('upload')) {
        return { type: 'text', content: `📸 Media received! Reply with **"upload"** in the caption to store it in Mega. 🚀` };
      }
    } else {
      return null;
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const mediaMetaRes = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const fileDownloadUrl = mediaMetaRes.data.url;
    const fileResponse = await axios.get(fileDownloadUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      responseType: 'arraybuffer'
    });
    
    const fileBuffer = Buffer.from(fileResponse.data);
    const uploadResult = await uploadBufferToMega(defaultName, fileBuffer);

    if (uploadResult.success) {
      return {
        type: 'text',
        content: `✅ **Successfully Backed Up to Mega!**\n\n📁 File: *${defaultName}*\n☁️ Link: ${uploadResult.link}`
      };
    } else {
      return { type: 'text', content: `❌ Mega upload failed: ${uploadResult.error}` };
    }

  } catch (err) {
    console.error('Media/Doc Error:', err);
    return { type: 'text', content: '⚠️ Error downloading or backing up file.' };
  }
}

module.exports = { processUserMessage, handleIncomingMediaOrDocument };
