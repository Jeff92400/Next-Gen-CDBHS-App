const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db-loader');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'billard-ranking-jwt-secret-key-2024-change-in-production';

// Login with username and password
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Support both new (username/password) and legacy (password only) login
  if (username) {
    // New multi-user login
    db.get('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username], (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      bcrypt.compare(password, user.password_hash, (err, result) => {
        if (err || !result) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Update last login
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id], () => {});

        const token = jwt.sign(
          {
            userId: user.id,
            username: user.username,
            role: user.role
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.json({
          token,
          message: 'Login successful',
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        });
      });
    });
  } else if (password) {
    // Legacy password-only login (backwards compatibility)
    db.get('SELECT * FROM admin LIMIT 1', [], (err, admin) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!admin) {
        return res.status(500).json({ error: 'Admin not configured' });
      }

      bcrypt.compare(password, admin.password_hash, (err, result) => {
        if (err || !result) {
          return res.status(401).json({ error: 'Invalid password' });
        }

        const token = jwt.sign({ admin: true, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
          token,
          message: 'Login successful',
          user: { role: 'admin' }
        });
      });
    });
  } else {
    return res.status(400).json({ error: 'Username and password required' });
  }
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    userId: req.user.userId,
    username: req.user.username,
    role: req.user.role
  });
});

// Change password (for current user)
router.post('/change-password', authenticateToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old and new passwords required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  // Handle legacy admin or new user system
  if (req.user.userId) {
    // New user system
    db.get('SELECT * FROM users WHERE id = $1', [req.user.userId], (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'User not found' });
      }

      bcrypt.compare(oldPassword, user.password_hash, (err, result) => {
        if (err || !result) {
          return res.status(401).json({ error: 'Invalid old password' });
        }

        bcrypt.hash(newPassword, 10, (err, hash) => {
          if (err) {
            return res.status(500).json({ error: 'Error hashing password' });
          }

          db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id], (err) => {
            if (err) {
              return res.status(500).json({ error: 'Error updating password' });
            }

            res.json({ message: 'Password changed successfully' });
          });
        });
      });
    });
  } else {
    // Legacy admin system
    db.get('SELECT * FROM admin LIMIT 1', [], (err, admin) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      bcrypt.compare(oldPassword, admin.password_hash, (err, result) => {
        if (err || !result) {
          return res.status(401).json({ error: 'Invalid old password' });
        }

        bcrypt.hash(newPassword, 10, (err, hash) => {
          if (err) {
            return res.status(500).json({ error: 'Error hashing password' });
          }

          db.run('UPDATE admin SET password_hash = $1 WHERE id = $2', [hash, admin.id], (err) => {
            if (err) {
              return res.status(500).json({ error: 'Error updating password' });
            }

            res.json({ message: 'Password changed successfully' });
          });
        });
      });
    });
  }
});

// ==================== USER MANAGEMENT (Admin only) ====================

// Get all users (admin only)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT id, username, role, is_active, created_at, last_login FROM users ORDER BY username', [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Create new user (admin only)
router.post('/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const validRoles = ['admin', 'viewer'];
  const userRole = validRoles.includes(role) ? role : 'viewer';

  // Check if username exists
  db.get('SELECT id FROM users WHERE username = $1', [username], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        return res.status(500).json({ error: 'Error hashing password' });
      }

      db.run(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [username, hash, userRole],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Error creating user' });
          }

          res.json({
            message: 'User created successfully',
            user: { id: this.lastID, username, role: userRole }
          });
        }
      );
    });
  });
});

// Update user (admin only)
router.put('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { username, password, role, is_active } = req.body;

  // Prevent admin from deactivating themselves
  if (req.user.userId == userId && is_active === 0) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  db.get('SELECT * FROM users WHERE id = $1', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (username && username !== user.username) {
      updates.push(`username = $${paramIndex++}`);
      params.push(username);
    }

    if (role && ['admin', 'viewer'].includes(role)) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (typeof is_active === 'number') {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (password && password.length >= 6) {
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
          return res.status(500).json({ error: 'Error hashing password' });
        }

        updates.push(`password_hash = $${paramIndex++}`);
        params.push(hash);
        params.push(userId);

        if (updates.length === 0) {
          return res.json({ message: 'No changes made' });
        }

        db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params, (err) => {
          if (err) {
            return res.status(500).json({ error: 'Error updating user' });
          }
          res.json({ message: 'User updated successfully' });
        });
      });
    } else {
      params.push(userId);

      if (updates.length === 0) {
        return res.json({ message: 'No changes made' });
      }

      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Error updating user' });
        }
        res.json({ message: 'User updated successfully' });
      });
    }
  });
});

// Delete user (admin only)
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;

  // Prevent admin from deleting themselves
  if (req.user.userId == userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  db.run('DELETE FROM users WHERE id = $1', [userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting user' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  });
});

// ==================== MIDDLEWARE ====================

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  });
}

// Middleware to require admin role
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && !req.user.admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Middleware to require at least viewer role (for read-only access)
function requireViewer(req, res, next) {
  // Both admin and viewer can access
  if (req.user.role === 'admin' || req.user.role === 'viewer' || req.user.admin) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied' });
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;
module.exports.requireViewer = requireViewer;
module.exports.JWT_SECRET = JWT_SECRET;
