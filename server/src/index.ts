
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();

const port = Number(process.env.PORT || 3000);
const secret = process.env.API_SECRET || '';

const ollamaUrl = (
  process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
).replace(/\/+$/, '');

const model = process.env.OLLAMA_MODEL || 'qwen2.5vl:3b';

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '12mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'VisionMate AI API',
    provider: 'Ollama (local AI)',
    aiConfigured: Boolean(ollamaUrl && model),
    model,
    port
  });
});

// Protect API endpoints
app.use('/api', (req, res, next) => {
  if (!secret || req.header('x-app-secret') !== secret) {
    res.status(401).json({
      error: 'App authentication failed. Check the app/server secret configuration.'
    });
    return;
  }

  next();
});

const instructions = `You are VisionMate, a concise, respectful, safety-first voice assistant for blind and low-vision people.

Speak in the user's requested language.
Use short, clear sentences suitable for text-to-speech.
Never claim to see or know something unless the user supplied an image or information.
For uncertain facts, say you are unsure and ask a clarifying question.
Never tell someone to cross a road based on an image or your judgement.
Do not claim to detect every obstacle or guarantee physical safety.
For medicine, chemicals, food safety, financial or other high-stakes questions, clearly state limitations and recommend checking the original label or a qualified person.
Do not pretend to be human.`;

// Common local Ollama request
async function askOllama(
  messages: Array<{
    role: 'system' | 'user';
    content: string;
    images?: string[];
  }>
): Promise<string> {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    }),
    signal: AbortSignal.timeout(300000)
  });

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error || `Ollama request failed: ${response.status}`
    );
  }

  const answer = data?.message?.content;

  if (!answer || typeof answer !== 'string') {
    throw new Error('Ollama returned an empty response.');
  }

  return answer.trim();
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const language = String(req.body?.language || 'en-IN');

    if (!message) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    if (message.length > 5000) {
      res.status(413).json({ error: 'Message is too long.' });
      return;
    }

    const answer = await askOllama([
      {
        role: 'system',
        content: `${instructions}\nRespond in language locale: ${language}.`
      },
      {
        role: 'user',
        content: message
      }
    ]);

    res.json({ answer });
  } catch (error: any) {
    console.error('chat_error:', error?.message || error);

    res.status(502).json({
      error: 'The local AI service could not complete your request. Check that Ollama is running.'
    });
  }
});

// Validate and prepare image input for Ollama
function prepareImageData(
  imageInput: unknown,
  suppliedMimeType: unknown
): { imageBase64: string; mimeType: string } {
  let imageBase64 = String(imageInput || '').trim();
  let mimeType = String(suppliedMimeType || 'image/jpeg').toLowerCase();

  // Accept a complete data URL or plain Base64
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i
    );

    if (!match) {
      throw new Error('Invalid image data URL.');
    }

    mimeType = match[1].toLowerCase();
    imageBase64 = match[2];
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error('Unsupported image format. Use JPEG, PNG or WebP.');
  }

  imageBase64 = imageBase64.replace(/\s/g, '');

  if (
    !imageBase64 ||
    imageBase64.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(imageBase64)
  ) {
    throw new Error('The image is not valid Base64 data.');
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  if (!imageBuffer.length) {
    throw new Error('The uploaded image is empty.');
  }

  if (imageBuffer.length > 7 * 1024 * 1024) {
    throw new Error('Image is too large. Please capture a smaller image.');
  }

  // Verify actual image format
  const isJpeg =
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8 &&
    imageBuffer[2] === 0xff;

  const isPng =
    imageBuffer.length >= 8 &&
    imageBuffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const isWebp =
    imageBuffer.length >= 12 &&
    imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    imageBuffer.toString('ascii', 8, 12) === 'WEBP';

  const actualMimeType = isJpeg
    ? 'image/jpeg'
    : isPng
      ? 'image/png'
      : isWebp
        ? 'image/webp'
        : null;

  if (!actualMimeType || actualMimeType !== mimeType) {
    throw new Error(
      'Image content does not match its declared image format.'
    );
  }

  return { imageBase64, mimeType };
}

// Smart Object Scanner endpoint
app.post('/api/describe-image', async (req, res) => {
  try {
    const imageInput = req.body?.imageBase64;
    const mimeType = req.body?.mimeType || 'image/jpeg';
    const language = String(req.body?.language || 'en-IN');

    if (!imageInput) {
      res.status(400).json({
        error: 'A valid image is required. Please capture an image.'
      });
      return;
    }

    const { imageBase64 } = prepareImageData(imageInput, mimeType);

    const prompt = `Describe this image for a blind or low-vision user in locale ${language}.

Start with the most likely main object or scene.
Explain what it is and its likely purpose.
Read clearly visible text only when legible.
Mention useful details such as colour, shape, labels and nearby objects.
If the object is unclear, explicitly say you are unsure.
Do not guess brand, ingredients, expiry date, medicine identity or safety-critical information.
Keep the spoken response concise and practical.
Never claim the image can establish whether an area is safe to walk through.`;

    const description = await askOllama([
      {
        role: 'system',
        content: instructions
      },
      {
        role: 'user',
        content: prompt,
        images: [imageBase64]
      }
    ]);

    res.json({ description });
  } catch (error: any) {
    console.error('vision_error:', error?.message || error);

    const message = String(error?.message || '');

    if (
      message.includes('Invalid image') ||
      message.includes('Base64') ||
      message.includes('Unsupported image') ||
      message.includes('Image content') ||
      message.includes('too large') ||
      message.includes('empty')
    ) {
      res.status(400).json({ error: message });
      return;
    }

    res.status(502).json({
      error: 'Image analysis failed. Check that Ollama is running and the model is available.'
    });
  }
});

// NEW: Read Text / OCR endpoint
app.post('/api/read-text', async (req, res) => {
  try {
    const imageInput = req.body?.imageBase64;
    const mimeType = req.body?.mimeType || 'image/jpeg';
    const language = String(req.body?.language || 'en-IN');

    if (!imageInput) {
      res.status(400).json({
        error: 'Please capture an image containing text.'
      });
      return;
    }

    const { imageBase64 } = prepareImageData(imageInput, mimeType);

    const prompt = `You are an OCR transcription system for a blind or low-vision user.

Task: Extract and transcribe the visible text in this image.

Requested language/locale: ${language}.

Rules:
- Return only the text that is actually visible in the image.
- Preserve the original language and wording. Do not translate.
- Preserve paragraph breaks and useful line breaks.
- Include headings, labels, numbers and punctuation when legible.
- Do not describe the image, page, objects, colours or layout.
- Do not summarize, explain, correct or rewrite the text.
- Never invent words or guess unclear characters.
- If a small portion is unreadable, write [unclear] at that position.
- If no readable text is visible, return exactly: NO_READABLE_TEXT
- Do not add an introduction or a conclusion.`;

    const extractedText = await askOllama([
      {
        role: 'system',
        content: 'You accurately transcribe text from supplied images. Never invent missing text.'
      },
      {
        role: 'user',
        content: prompt,
        images: [imageBase64]
      }
    ]);

    const cleanedText = extractedText
      .replace(/^```(?:text)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    if (
      !cleanedText ||
      cleanedText.toUpperCase() === 'NO_READABLE_TEXT'
    ) {
      res.json({
        text: '',
        message: 'No readable text was found. Try capturing the page again with better lighting and focus.'
      });
      return;
    }

    res.json({ text: cleanedText });
  } catch (error: any) {
    console.error('ocr_error:', error?.message || error);

    const message = String(error?.message || '');

    if (
      message.includes('Invalid image') ||
      message.includes('Base64') ||
      message.includes('Unsupported image') ||
      message.includes('Image content') ||
      message.includes('too large') ||
      message.includes('empty')
    ) {
      res.status(400).json({ error: message });
      return;
    }

    res.status(502).json({
      error: 'Text extraction failed. Check that Ollama is running and the vision model is available.'
    });
  }
});

app.listen(port, () => {
  console.log(`VisionMate API listening on port ${port}`);
  console.log('AI provider: Ollama');
  console.log(`AI model: ${model}`);
  console.log(`Ollama URL: ${ollamaUrl}`);
});
