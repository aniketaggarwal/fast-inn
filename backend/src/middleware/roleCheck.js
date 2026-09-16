'use strict';
/**
 * roleCheck.js — Role-based access control middleware
 */

/**
 * Require the authenticated user to have one of the given roles
 * @param {...string} roles - Allowed roles: 'guest', 'hotel_staff', 'admin'
 * @returns {Function} Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error:   `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

/**
 * Ensure the authenticated user is the resource owner OR an admin
 * Usage: after authenticate(), call with the owner ID from the resource
 */
function requireOwnerOrAdmin(getOwnerId) {
  return async (req, res, next) => {
    try {
      if (req.user.role === 'admin') return next();
      const ownerId = await getOwnerId(req);
      if (ownerId === req.user.id) return next();
      return res.status(403).json({ success: false, error: 'Access denied' });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireRole, requireOwnerOrAdmin };
