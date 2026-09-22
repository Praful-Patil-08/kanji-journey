const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GEMINI_API_KEY || "test-only-not-a-secret";
let genAI;
if (API_KEY !== "test-only-not-a-secret") {
  try {
    genAI = new GoogleGenerativeAI(API_KEY);
  } catch (error) {
    console.warn("Failed to initialize GoogleGenerativeAI with provided API key:", error.message);
    genAI = null;
  }
} else {
  console.warn("GEMINI_API_KEY not set - using fallback mode. AI features will be limited.");
  genAI = null;
}

// Step 5: Simple In-Memory LRU Cache with TTL (Time To Live)
class SimpleCache {
  constructor(ttlMs = 3600000, maxSize = 200) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const { val, expiry } = this.cache.get(key);
    if (Date.now() > expiry) {
      this.cache.delete(key);
      return null;
    }
    return val;
  }

  set(key, val) {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest (first inserted key)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { val, expiry: Date.now() + this.ttlMs });
  }

  clear() {
    this.cache.clear();
  }
}

const chatResponseCache = new SimpleCache();

// Step 6: Tool/Static Routing for FAQ, book recommendations, and JLPT exam dates
function getStaticRoute(message) {
  const cleanMsg = message.trim().toLowerCase();
  
  // JLPT exam dates intent
  if (/\b(?:jlpt|exam|test)\b.*\b(?:date|when|schedule|closest|next)\b/i.test(cleanMsg) || 
      /closest jlpt/i.test(cleanMsg)) {
    return `The JLPT (Japanese-Language Proficiency Test) is held worldwide twice a year: on the first Sunday of July and the first Sunday of December.

- **Next upcoming JLPT exam:** Sunday, July 5, 2026.
- **Following JLPT exam:** Sunday, December 6, 2026.

*Tip: Registration usually opens 3-4 months prior. Please check the official JLPT website (jlpt.jp) or your local host institution for exact regional registration deadlines.*`;
  }

  // Book recommendations intent
  if (/\b(?:book|textbook|resource|read|refer)\b.*\b(?:recommend|suggest|best|refer|buy|learn)\b/i.test(cleanMsg) ||
      /which book/i.test(cleanMsg) || 
      /kanji book/i.test(cleanMsg) || 
      /grammar resource/i.test(cleanMsg)) {
    return `Here are the highly recommended textbooks and resources for Japanese learners:

1. **Comprehensive Textbooks**:
   - **Genki I & II**: The standard choice for beginners. Excellent grammar explanations and well-structured dialogues.
   - **Minna no Nihongo**: Immersive series entirely in Japanese (with separate translation books). Great for intensive practice.

2. **Kanji Learning**:
   - **Remembering the Kanji (RTK) by James Heisig**: Highly popular for learning kanji using mnemonic stories.
   - **Basic Kanji Book**: Offers systematic practice with reading and writing exercises.

3. **JLPT Prep & Grammar**:
   - **Shin Kanzen Master**: The gold standard for N3-N1 JLPT prep. Rigorous reading, grammar, and listening exercises.
   - **Nihongo Sou Matome**: A lighter, structured 8-week program ideal for quick reviews.`;
  }

  // SRS FAQ
  if (/\b(?:srs|flashcard|spaced repetition|algorithm)\b/i.test(cleanMsg)) {
    return `SRS stands for Spaced Repetition System. The app automatically schedules flashcards based on how well you remember them:
- **Grade 1 (Again):** Resets the interval to 1 day.
- **Grade 3 (Good):** Progressively increases intervals (e.g., 1 day -> 6 days -> multi-day multiplication).
- **Grade 4 (Easy):** Multiplies current intervals significantly, pushing cards further out so you focus on harder kanji while keeping mastered words in long-term memory.`;
  }

  // Reset progress FAQ
  if (/\b(?:reset|delete|wipe|erase|restart)\b.*\b(?:progress|history|streak|flashcard)\b/i.test(cleanMsg)) {
    return `To reset your learning progress:
1. Navigate to your Profile settings screen.
2. Under 'Manage Data', select 'Reset Progress'.
*Warning: This action resets your daily streak and SRS flashcard intervals, but preserves custom vocabulary folders.*`;
  }

  // Free/pricing FAQ
  if (/is (?:this|the|site|app) free/i.test(cleanMsg) || /pricing|cost/i.test(cleanMsg)) {
    return `Yes! The core learning tools, grammar lessons, and SRS flashcards on Kanji Journey are entirely free to use. We offer guest access as well as registered user accounts to keep your progress synchronized across all your devices.`;
  }

  return null;
}

// Step 3: Check if the user message requires personalized application context
function requiresContext(message) {
  const cleanMsg = message.trim().toLowerCase();
  const patterns = [
    /\b(?:my|i|me|we)\b.*\b(?:weak|mistake|progress|streak|level|lesson|module|readiness|score)\b/i,
    /what should i revise/i,
    /my weak topics/i,
    /how am i doing/i,
    /my current lesson/i,
    /what to learn next/i
  ];
  return patterns.some(pattern => pattern.test(cleanMsg));
}

// Preservation of existing getWordData fallback lookup function
async function getWordData(word, level = "N5") {
  // If we don't have a valid AI model, return mock data
  if (!genAI) {
    return {
      word: word,
      reading: "（みっ）", // placeholder
      meaning: "placeholder meaning",
      example: `${word}は例文です。`,
      exampleMeaning: "This is an example sentence."
    };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
   
  const prompt = `Give me information about the Japanese word "${word}" at JLPT level ${level}. 
  Return ONLY a JSON object with this structure:
  {
    "word": "word",
    "reading": "hiragana reading",
    "meaning": "english meaning",
    "example": "example sentence in Japanese",
    "exampleMeaning": "english translation of example sentence"
  }`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
   
  // Basic cleaning if Gemini returns markdown code blocks
  const cleanJson = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Gemini JSON Parse Error:", e, text);
    throw new Error("Failed to parse AI response");
  }
}

// Step 8: Hierarchical Fallback model provider
async function tryFallbackProviders(message, history, systemInstruction) {
  const messagesPayload = [
    { role: "system", content: systemInstruction },
    ...history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts[0].text
    })),
    { role: "user", content: message }
  ];

  // 1. OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3-8b-instruct:free",
          messages: messagesPayload
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (e) {
      console.warn("[Fallback Provider] OpenRouter failed:", e);
    }
  }

  // 2. Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: messagesPayload,
          max_tokens: 500
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (e) {
      console.warn("[Fallback Provider] Groq failed:", e);
    }
  }

  // 3. Claude (Anthropic API)
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (claudeKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 500,
          system: systemInstruction,
          messages: [
            ...history.map(h => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.parts[0].text
            })),
            { role: "user", content: message }
          ]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.content?.[0]?.text;
        if (content) return content;
      }
    } catch (e) {
      console.warn("[Fallback Provider] Claude failed:", e);
    }
  }

  // 4. Graceful educational mock fallback (Absolute fallback with high-utility guidance)
  return `Konnichiwa! Our advanced language models are currently experiencing high traffic. Here is a curated study recommendation to assist your path:

- **Keep it steady:** Just 10-15 minutes of scheduled review each day yields better memory retention than sporadic multi-hour cramming sessions.
- **Utilize SRS Cards:** Review your active cards daily to reinforce spelling, readings, and word meanings.
- **Focus on Core Particles:** Mastery of the particles (**wa, ga, wo, ni, de, no**) serves as the bedrock of JLPT N5 comprehension.

*Tip: For book recommendations or JLPT schedules, search those exact keywords to get immediate responses offline.*`;
}

// Step 1 & 2 & 7: Core Optimized generateChatReply
async function generateChatReply(message, history = [], context = null) {
  // Step 7: Token Guard - protect API from massive input messages
  const truncatedMessage = (message || "").toString().slice(0, 400);

  // Step 6: Tool/Static routing lookup first
  const staticResult = getStaticRoute(truncatedMessage);
  if (staticResult) {
    return staticResult;
  }

  // Step 5: Cache Lookup
  const cacheKey = truncatedMessage.toLowerCase().trim();
  const cachedVal = chatResponseCache.get(cacheKey);
  if (cachedVal) {
    return cachedVal;
  }

  // If we don't have a valid AI model, use fallback providers directly
  if (!genAI) {
    console.warn("Gemini AI not available, using fallback providers");
    // Step 1: Short-term memory (Only send last 8 messages)
    const conversationWindow = (history || []).slice(-8).map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: (msg.content || "").toString() }]
    }));

    // Step 2: Fixed system prompt
    let systemInstruction = "You are a Japanese learning assistant. Answer only Japanese-learning-related questions. Be concise, practical, and accurate. If unsure, say you don't know instead of guessing.";
    
    if (context) {
      systemInstruction += `\n\nUser current learning status (ONLY use this to personalize answers if asked about their progress/weak areas):\n${context}`;
    }

    return await tryFallbackProviders(truncatedMessage, conversationWindow, systemInstruction);
  }

  // Step 1: Short-term memory (Only send last 8 messages)
  const conversationWindow = (history || []).slice(-8).map(msg => ({
    role: msg.role === 'ai' ? 'model' : 'user',
    parts: [{ text: (msg.content || "").toString() }]
  }));

  // Step 2: Fixed system prompt
  let systemInstruction = "You are a Japanese learning assistant. Answer only Japanese-learning-related questions. Be concise, practical, and accurate. If unsure, say you don't know instead of guessing.";
  
  if (context) {
    systemInstruction += `\n\nUser current learning status (ONLY use this to personalize answers if asked about their progress/weak areas):\n${context}`;
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7
    }
  });

  let replyText = "";
  try {
    const chat = model.startChat({
      history: conversationWindow
    });

    // Step 7: Enforce maxOutputTokens guard
    const result = await chat.sendMessage(truncatedMessage);
    const response = await result.response;
    replyText = response.text();
  } catch (err) {
    console.warn("[Gemini Chat API Error] Rate limit or connection failed. Proceeding with fallback...", err);
    replyText = await tryFallbackProviders(truncatedMessage, conversationWindow, systemInstruction);
  }

  // Save to cache if reply was successful and valid
  if (replyText) {
    chatResponseCache.set(cacheKey, replyText);
  }

  return replyText;
}

module.exports = {
  getWordData,
  generateChatReply,
  SimpleCache,
  getStaticRoute,
  requiresContext,
  chatResponseCache
};
