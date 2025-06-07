require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'leetcode_leaderboard'
});

// Create table if not exists
pool.query(`
  CREATE TABLE IF NOT EXISTS leaderboard (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(50) NOT NULL,
    leetcode_username VARCHAR(100) NOT NULL,
    score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS weekly_scores (
    id SERIAL PRIMARY KEY,
    leaderboard_id INTEGER REFERENCES leaderboard(id),
    week_start_date DATE NOT NULL,
    score INTEGER NOT NULL,
    improvement INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ✅ Single clean definition of getLeetCodeScore
async function getLeetCodeScore(username) {
  const query = {
    query: `
      query {
        matchedUser(username: "${username}") {
          submitStats {
            acSubmissionNum {
              difficulty
              count
            }
          }
        }
      }
    `
  };

  try {
    const res = await axios.post('https://leetcode.com/graphql', query, {
      headers: { 'Content-Type': 'application/json' }
    });

    const user = res.data?.data?.matchedUser;

    if (!user || !user.submitStats || !user.submitStats.acSubmissionNum) {
      return null;
    }

    const allStats = user.submitStats.acSubmissionNum;
    const totalSolved = allStats.find(d => d.difficulty === "All")?.count;

    return totalSolved ?? null;
  } catch (error) {
    console.error("Failed to fetch score:", error.message);
    return null;
  }
}

// Function to update all scores
async function updateAllScores() {
  try {
    const result = await pool.query('SELECT id, leetcode_username FROM leaderboard');
    const users = result.rows;

    for (const user of users) {
      const newScore = await getLeetCodeScore(user.leetcode_username);
      if (newScore !== null) {
        await pool.query(
          'UPDATE leaderboard SET score = $1 WHERE id = $2',
          [newScore, user.id]
        );
      }
    }
    console.log('All scores updated successfully');
  } catch (error) {
    console.error('Error updating scores:', error);
  }
}

// Function to get current week's Monday date
function getCurrentWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(now.setDate(diff));
}

// Function to update weekly scores
async function updateWeeklyScores() {
  const currentMonday = getCurrentWeekMonday();
  
  try {
    // Get all users
    const users = await pool.query('SELECT id, leetcode_username, score FROM leaderboard');
    
    for (const user of users.rows) {
      // Get last week's score
      const lastWeekScore = await pool.query(
        'SELECT score FROM weekly_scores WHERE leaderboard_id = $1 ORDER BY week_start_date DESC LIMIT 1',
        [user.id]
      );
      
      const lastScore = lastWeekScore.rows[0]?.score || 0;
      const improvement = user.score - lastScore;
      
      // Insert or update this week's score
      await pool.query(
        `INSERT INTO weekly_scores (leaderboard_id, week_start_date, score, improvement)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (leaderboard_id, week_start_date) 
         DO UPDATE SET score = $3, improvement = $4`,
        [user.id, currentMonday, user.score, improvement]
      );
    }
    console.log('Weekly scores updated successfully');
  } catch (error) {
    console.error('Error updating weekly scores:', error);
  }
}

// Add unique constraint to weekly_scores
pool.query(`
  ALTER TABLE weekly_scores 
  ADD CONSTRAINT unique_weekly_score 
  UNIQUE (leaderboard_id, week_start_date);
`);

// Update scores every 5 minutes
setInterval(updateAllScores, 5 * 60 * 1000);

// Update weekly scores every Monday at midnight
const scheduleWeeklyUpdate = () => {
  const now = new Date();
  const monday = getCurrentWeekMonday();
  const timeUntilMonday = monday.getTime() - now.getTime();
  
  setTimeout(() => {
    updateWeeklyScores();
    // Schedule next update
    setInterval(updateWeeklyScores, 7 * 24 * 60 * 60 * 1000);
  }, timeUntilMonday);
};

scheduleWeeklyUpdate();

// Add new endpoint for weekly improvements
app.get('/weekly-improvements', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const currentMonday = getCurrentWeekMonday();
    
    const result = await pool.query(`
      SELECT l.name, l.department, l.leetcode_username, ws.improvement
      FROM weekly_scores ws
      JOIN leaderboard l ON l.id = ws.leaderboard_id
      WHERE ws.week_start_date = $1
      ORDER BY ws.improvement DESC
      LIMIT $2
    `, [currentMonday, limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching weekly improvements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboard with search, sort, and filter
app.get('/leaderboard', async (req, res) => {
  try {
    const { search, sort = 'desc', department, page = 1 } = req.query;
    const limit = 30;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM leaderboard';
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`name ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }

    if (department) {
      conditions.push(`department = $${params.length + 1}`);
      params.push(department);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Get total count for pagination
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    query += ` ORDER BY score ${sort === 'asc' ? 'ASC' : 'DESC'}`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to manually trigger score updates
app.post('/update-scores', async (req, res) => {
  try {
    await updateAllScores();
    res.json({ message: 'Scores updated successfully' });
  } catch (error) {
    console.error('Error updating scores:', error);
    res.status(500).json({ error: 'Failed to update scores' });
  }
});

app.post('/submit', async (req, res) => {
  const { name, department, leetcodeUsername } = req.body;

  try {
    // Check if LeetCode username already exists
    const existingUser = await pool.query(
      'SELECT * FROM leaderboard WHERE leetcode_username = $1',
      [leetcodeUsername]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'LeetCode profile already exists' });
    }

    const score = await getLeetCodeScore(leetcodeUsername);
    if (score === null) {
      return res.status(400).json({ error: 'Invalid LeetCode username' });
    }

    await pool.query(
      'INSERT INTO leaderboard (name, department, leetcode_username, score) VALUES ($1, $2, $3, $4)',
      [name, department, leetcodeUsername, score]
    );
    res.sendStatus(201);
  } catch (error) {
    console.error('Error submitting entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
