'use strict';

const express = require('express');
const router = express.Router();
const { generateChatReply, getWordData, requiresContext, getStaticRoute } = require('../lib/gemini.cjs');
const { connectDB } = require('../db.cjs');
const { ObjectId } = require('mongodb');

/**
 * Enhanced chat endpoint with context awareness and conversation persistence
 * POST /api/chat/enhanced
 */
router.post('/enhanced', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message || !userId) {
      return res.status(400).json({ 
        error: 'Message and userId are required' 
      });
    }

    // Fetch user profile and learning context from database
    const db = await connectDB();
    const userContext = await fetchUserContext(db, userId);
    
    // Check for static routes first (FAQ, book recommendations, etc.)
    const staticResponse = getStaticRoute(message);
    if (staticResponse) {
      // Store conversation in history even for static responses
      await storeChatMessage(db, userId, message, 'user');
      await storeChatMessage(db, userId, staticResponse, 'assistant');
      
      return res.json({ 
        reply: staticResponse,
        contextUsed: !!userContext,
        isStatic: true
      });
    }

    // Determine if we need to inject context
    const needsContext = requiresContext(message);
    
    // Generate AI response with context
    const aiResponse = await generateChatReply(
      message, 
      [], // History will be fetched from DB if needed
      needsContext ? userContext : null
    );

    // Store conversation in history
    await storeChatMessage(db, userId, message, 'user');
    await storeChatMessage(db, userId, aiResponse, 'assistant');

    res.json({ 
      reply: aiResponse,
      contextUsed: needsContext && !!userContext,
      isStatic: false
    });
  } catch (error) {
    console.error('Error in chat enhanced endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to generate chat response',
      details: error.message 
    });
  }
});

/**
 * Get conversation history for a user
 * GET /api/chat/history?userId=xxx&limit=50
 */
router.get('/history', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required' 
      });
    }

    const db = await connectDB();
    const collection = db.collection('chat_history');
    
    const messages = await collection
      .find({ userId: userId }) // userId is stored as string
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .toArray();

    // Reverse to get chronological order
    const chronologicalMessages = messages.reverse().map(msg => ({
      id: msg._id.toString(),
      role: msg.role,
      content: msg.message,
      timestamp: msg.createdAt
    }));

    res.json({ messages: chronologicalMessages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chat history' 
    });
  }
});

/**
 * Clear conversation history for a user
 * DELETE /api/chat/history?userId=xxx
 */
router.delete('/history', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required' 
      });
    }

    const db = await connectDB();
    const collection = db.collection('chat_history');
    
    await collection.deleteMany({ userId: userId }); // userId is stored as string
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({ 
      error: 'Failed to clear chat history' 
    });
  }
});

// Helper functions
async function fetchUserContext(db, userId) {
  try {
    // Fetch user profile
    const profile = await db.collection('profiles').findOne({ 
      user_id: userId // user_id is stored as string
    });
    
    if (!profile) return null;

    // Fetch recent weak topics
    const weakTopics = await db.collection('weak_topics')
      .find({ user_id: userId }) // user_id is stored as string
      .sort({ count: -1 })
      .limit(5)
      .toArray();

    // Fetch recent lesson progress
    const recentLessons = await db.collection('lesson_progress')
      .find({ user_id: userId }) // user_id is stored as string
      .sort({ updatedAt: -1 })
      .limit(3)
      .toArray();

    // Fetch due flashcards count
    const dueFlashcardsCount = await db.collection('flashcards')
      .countDocuments({ 
        user_id: userId, // user_id is stored as string
        nextReview: { $lte: new Date() }
      });

    // Build context string
    const contextParts = [];
    
    if (profile) {
      contextParts.push(`User Profile:`);
      contextParts.push(`- Level: ${profile.current_level || 'N5'}`);
      contextParts.push(`- XP: ${profile.xp || 0}`);
      contextParts.push(`- Streak: ${profile.streak || 0} days`);
      contextParts.push(`- Readiness Score: ${profile.readiness_score || 0}%`);
    }

    if (weakTopics && weakTopics.length > 0) {
      contextParts.push(`\nRecent Weak Topics:`);
      weakTopics.forEach((topic, index) => {
        contextParts.push(`- ${topic.topic} (${topic.count} mistakes)`);
      });
    }

    if (recentLessons && recentLessons.length > 0) {
      contextParts.push(`\nRecent Lessons:`);
      recentLessons.forEach(lesson => {
        contextParts.push(`- ${lesson.lesson_id || 'Unknown'} (${lesson.completed ? 'Completed' : 'In Progress'})`);
      });
    }

    contextParts.push(`\nDue Flashcards for Review: ${dueFlashcardsCount}`);
    
    return contextParts.join('\n');
  } catch (error) {
    console.error('Error fetching user context:', error);
    return null; // Continue without context rather than failing
  }
}

async function storeChatMessage(db, userId, message, role) {
  try {
    await db.collection('chat_history').insertOne({
      user_id: userId, // Store as string to match other collections
      message: message,
      role: role,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error storing chat message:', error);
    // Don't throw - we don't want chat failures to break the main flow
  }
}

module.exports = { chatRouter: router };