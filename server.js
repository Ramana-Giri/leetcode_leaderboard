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

// Get leaderboard with search, sort, and filter
app.get('/leaderboard', async (req, res) => {
  try {
    const { search, sort = 'desc', department } = req.query;
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

    query += ` ORDER BY score ${sort === 'asc' ? 'ASC' : 'DESC'}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
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
