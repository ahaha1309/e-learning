const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simplified database connection for testing
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/e-learning';
mongoose.connect(MONGO_URL).then(() => {
  console.log('Database connected successfully');
});

const User = require('./models/User');
const { ROLES } = require('./config/constants');

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTeachers = await User.countDocuments({ role: ROLES.TEACHER });
    const totalStudents = await User.countDocuments({ role: ROLES.STUDENT });
    const totalAdmins = await User.countDocuments({ role: ROLES.ADMIN });
    
    res.json({
      message: 'Dashboard API is working',
      stats: {
        totalUsers,
        totalTeachers,
        totalStudents,
        totalAdmins
      },
      timestamp: new Date().toISOString()
    });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Dashboard API server running on port 3000');
});