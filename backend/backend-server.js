// server.js - Main Express Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// AI API rate limiting (more restrictive)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10 // limit each IP to 10 AI requests per minute
});

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Admin Authentication Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// AI Service Integration
const getAIAnalysis = async (idea) => {
  try {
    const prompt = `Analyze this business idea and provide insights:
    
    Title: ${idea.title}
    Description: ${idea.description}
    Tags: ${idea.tags?.join(', ')}
    
    Please provide:
    1. Similar existing solutions/competitors (max 5)
    2. Market opportunity assessment (1-10 score with brief explanation)
    3. Key recommendations (max 3)
    4. Potential risks or challenges (max 3)
    
    Respond with a JSON object in this exact format:
    {
      "similarSolutions": ["solution1", "solution2", "solution3"],
      "marketOpportunity": {
        "score": 8,
        "explanation": "Brief explanation of market potential"
      },
      "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
      "risks": ["risk1", "risk2", "risk3"]
    }
    
    DO NOT OUTPUT ANYTHING OTHER THAN VALID JSON.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error('AI analysis failed');
    }

    const data = await response.json();
    let responseText = data.content[0].text;
    
    // Clean up the response
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    const analysis = JSON.parse(responseText);
    return analysis;
  } catch (error) {
    console.error('AI Analysis Error:', error);
    // Return fallback analysis
    return {
      similarSolutions: ['Market research needed'],
      marketOpportunity: { score: 5, explanation: 'Analysis pending' },
      recommendations: ['Conduct user research', 'Validate assumptions', 'Build MVP'],
      risks: ['Market competition', 'Technical feasibility', 'User adoption']
    };
  }
};

const askAIAssistant = async (question, ideaContext) => {
  try {
    const prompt = `You are an AI business advisor helping with idea development.
    
    Idea Context:
    Title: ${ideaContext.title}
    Description: ${ideaContext.description}
    Current Phase: ${ideaContext.phase}
    
    User Question: ${question}
    
    Provide a helpful, actionable response in a conversational tone. Keep it concise but informative.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error('AI assistant failed');
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('AI Assistant Error:', error);
    return "I'm having trouble processing your question right now. Please try again later.";
  }
};

// ================================
// AUTHENTICATION ROUTES
// ================================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'employee' } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, passwordHash, role]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Verify token
app.post('/api/auth/verify', authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// ================================
// IDEAS ROUTES
// ================================

// Get all ideas (authenticated users see all, public users see public only)
app.get('/api/ideas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.*,
        u.name as author,
        u.id as author_id,
        COALESCE(l.like_count, 0) as likes,
        COALESCE(c.comment_count, 0) as comments,
        COALESCE(col.collaborators, '[]'::json) as collaborators,
        ul.user_id IS NOT NULL as is_liked
      FROM ideas i
      JOIN users u ON i.author_id = u.id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) as like_count 
        FROM likes 
        GROUP BY idea_id
      ) l ON i.id = l.idea_id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) as comment_count 
        FROM comments 
        GROUP BY idea_id
      ) c ON i.id = c.idea_id
      LEFT JOIN (
        SELECT 
          idea_id, 
          json_agg(u.name) as collaborators
        FROM collaborations col
        JOIN users u ON col.user_id = u.id
        WHERE col.status = 'accepted'
        GROUP BY idea_id
      ) col ON i.id = col.idea_id
      LEFT JOIN likes ul ON i.id = ul.idea_id AND ul.user_id = $1
      ORDER BY i.created_at DESC
    `, [req.user?.id || null]);

    const ideas = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      author: row.author,
      authorId: row.author_id,
      phase: row.phase,
      phaseIndex: row.phase_index,
      tags: row.tags || [],
      aiAnalysis: row.ai_analysis,
      likes: parseInt(row.likes),
      comments: parseInt(row.comments),
      collaborators: row.collaborators || [],
      isLiked: row.is_liked,
      createdAt: new Date(row.created_at).toLocaleDateString()
    }));

    res.json({ ideas });
  } catch (error) {
    console.error('Get ideas error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get public ideas (for non-authenticated users)
app.get('/api/ideas/public', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.*,
        u.name as author,
        u.id as author_id,
        COALESCE(l.like_count, 0) as likes,
        COALESCE(c.comment_count, 0) as comments,
        COALESCE(col.collaborators, '[]'::json) as collaborators
      FROM ideas i
      JOIN users u ON i.author_id = u.id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) as like_count 
        FROM likes 
        GROUP BY idea_id
      ) l ON i.id = l.idea_id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) as comment_count 
        FROM comments 
        GROUP BY idea_id
      ) c ON i.id = c.idea_id
      LEFT JOIN (
        SELECT 
          idea_id, 
          json_agg(u.name) as collaborators
        FROM collaborations col
        JOIN users u ON col.user_id = u.id
        WHERE col.status = 'accepted'
        GROUP BY idea_id
      ) col ON i.id = col.idea_id
      WHERE i.is_public = true
      ORDER BY i.created_at DESC
      LIMIT 20
    `);

    const ideas = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      author: row.author,
      authorId: row.author_id,
      phase: row.phase,
      phaseIndex: row.phase_index,
      tags: row.tags || [],
      aiAnalysis: row.ai_analysis,
      likes: parseInt(row.likes),
      comments: parseInt(row.comments),
      collaborators: row.collaborators || [],
      isLiked: false,
      createdAt: new Date(row.created_at).toLocaleDateString()
    }));

    res.json({ ideas });
  } catch (error) {
    console.error('Get public ideas error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new idea
app.post('/api/ideas', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { title, description, tags, phase = 'Idea Spark', phaseIndex = 0 } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    // Create idea in database
    const result = await pool.query(
      `INSERT INTO ideas (title, description, author_id, phase, phase_index, tags, is_public) 
       VALUES ($1, $2, $3, $4, $5, $6, true) 
       RETURNING *`,
      [title, description, req.user.id, phase, phaseIndex, JSON.stringify(tags || [])]
    );

    const idea = result.rows[0];

    // Get AI analysis asynchronously
    try {
      const aiAnalysis = await getAIAnalysis({
        title,
        description,
        tags
      });

      // Update idea with AI analysis
      await pool.query(
        'UPDATE ideas SET ai_analysis = $1 WHERE id = $2',
        [JSON.stringify(aiAnalysis), idea.id]
      );

      idea.ai_analysis = aiAnalysis;
    } catch (aiError) {
      console.error('AI analysis failed:', aiError);
      // Continue without AI analysis
    }

    const responseIdea = {
      id: idea.id,
      title: idea.title,
      description: idea.description,
      author: req.user.name,
      authorId: req.user.id,
      phase: idea.phase,
      phaseIndex: idea.phase_index,
      tags: idea.tags || [],
      aiAnalysis: idea.ai_analysis,
      likes: 0,
      comments: 0,
      collaborators: [],
      isLiked: false,
      createdAt: new Date(idea.created_at).toLocaleDateString()
    };

    res.status(201).json({
      message: 'Idea created successfully',
      idea: responseIdea
    });
  } catch (error) {
    console.error('Create idea error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update idea
app.put('/api/ideas/:id', authenticateToken, async (req, res) => {
  try {
    const ideaId = req.params.id;
    const { title, description, tags, phase, phaseIndex } = req.body;

    // Check if user owns the idea
    const ideaResult = await pool.query('SELECT * FROM ideas WHERE id = $1', [ideaId]);
    if (ideaResult.rows.length === 0) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    const idea = ideaResult.rows[0];
    if (idea.author_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own ideas' });
    }

    // Update idea
    const result = await pool.query(
      `UPDATE ideas 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           tags = COALESCE($3, tags),
           phase = COALESCE($4, phase),
           phase_index = COALESCE($5, phase_index),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [title, description, tags ? JSON.stringify(tags) : null, phase, phaseIndex, ideaId]
    );

    const updatedIdea = result.rows[0];

    res.json({
      message: 'Idea updated successfully',
      idea: {
        id: updatedIdea.id,
        title: updatedIdea.title,
        description: updatedIdea.description,
        author: req.user.name,
        authorId: req.user.id,
        phase: updatedIdea.phase,
        phaseIndex: updatedIdea.phase_index,
        tags: updatedIdea.tags || [],
        aiAnalysis: updatedIdea.ai_analysis,
        createdAt: new Date(updatedIdea.created_at).toLocaleDateString()
      }
    });
  } catch (error) {
    console.error('Update idea error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Like/Unlike idea
app.post('/api/ideas/:id/like', authenticateToken, async (req, res) => {
  try {
    const ideaId = req.params.id;

    // Check if idea exists
    const ideaResult = await pool.query('SELECT * FROM ideas WHERE id = $1', [ideaId]);
    if (ideaResult.rows.length === 0) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if user already liked this idea
    const likeResult = await pool.query(
      'SELECT * FROM likes WHERE idea_id = $1 AND user_id = $2',
      [ideaId, req.user.id]
    );

    if (likeResult.rows.length > 0) {
      // Unlike
      await pool.query('DELETE FROM likes WHERE idea_id = $1 AND user_id = $2', [ideaId, req.user.id]);
      res.json({ message: 'Idea unliked', liked: false });
    } else {
      // Like
      await pool.query('INSERT INTO likes (idea_id, user_id) VALUES ($1, $2)', [ideaId, req.user.id]);
      res.json({ message: 'Idea liked', liked: true });
    }
  } catch (error) {
    console.error('Like idea error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Request collaboration
app.post('/api/ideas/:id/collaborate', authenticateToken, async (req, res) => {
  try {
    const ideaId = req.params.id;
    const { message } = req.body;

    // Check if idea exists
    const ideaResult = await pool.query('SELECT * FROM ideas WHERE id = $1', [ideaId]);
    if (ideaResult.rows.length === 0) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    const idea = ideaResult.rows[0];

    // Check if user is trying to collaborate on their own idea
    if (idea.author_id === req.user.id) {
      return res.status(400).json({ message: 'You cannot collaborate on your own idea' });
    }

    // Check if collaboration request already exists
    const existingRequest = await pool.query(
      'SELECT * FROM collaborations WHERE idea_id = $1 AND user_id = $2',
      [ideaId, req.user.id]
    );

    if (existingRequest.rows.length > 0) {
      return res.status(409).json({ message: 'Collaboration request already exists' });
    }

    // Create collaboration request
    await pool.query(
      'INSERT INTO collaborations (idea_id, user_id, message, status) VALUES ($1, $2, $3, $4)',
      [ideaId, req.user.id, message, 'pending']
    );

    res.status(201).json({ message: 'Collaboration request sent successfully' });
  } catch (error) {
    console.error('Collaboration request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ================================
// AI ASSISTANT ROUTES
// ================================

// Ask AI Assistant
app.post('/api/ai/ask', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { question, ideaContext } = req.body;

    if (!question || !ideaContext) {
      return res.status(400).json({ message: 'Question and idea context are required' });
    }

    const response = await askAIAssistant(question, ideaContext);
    
    res.json({ response });
  } catch (error) {
    console.error('AI Assistant error:', error);
    res.status(500).json({ message: 'AI Assistant temporarily unavailable' });
  }
});

// ================================
// ADMIN ROUTES
// ================================

// Get platform analytics
app.get('/api/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [usersResult, ideasResult, collaborationsResult, likesResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count, role FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*) as count, phase FROM ideas GROUP BY phase'),
      pool.query('SELECT COUNT(*) as count FROM collaborations WHERE status = $1', ['accepted']),
      pool.query('SELECT COUNT(*) as count FROM likes')
    ]);

    res.json({
      users: usersResult.rows,
      ideas: ideasResult.rows,
      collaborations: parseInt(collaborationsResult.rows[0].count),
      totalLikes: parseInt(likesResult.rows[0].count)
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ================================
// ERROR HANDLING & SERVER START
// ================================

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Database initialization
const initDatabase = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'employee',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ideas (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        phase VARCHAR(100) DEFAULT 'Idea Spark',
        phase_index INTEGER DEFAULT 0,
        tags JSON DEFAULT '[]',
        ai_analysis JSON,
        is_public BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(idea_id, user_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS collaborations (
        id SERIAL PRIMARY KEY,
        idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(idea_id, user_id)
      )
    `);

    console.log('✅ Database tables created/verified');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  });
};

startServer();