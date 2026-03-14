import type { Request, Response, NextFunction } from 'express';
import { verifyIdToken, isFirebaseConfigured } from './firebase-admin.js';
import { KeyDB } from './db.js';
import { hashKey } from './crypto.js';

// Extend Express Request to carry authenticated user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email: string;
      };
    }
  }
}

// Verify Firebase ID token from Authorization header
// Attaches req.user = { uid, email } on success
export function userAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isFirebaseConfigured()) {
    res.status(503).json({ error: 'User authentication is not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Authorization header with Bearer token required' });
    return;
  }

  verifyIdToken(token).then(decoded => {
    if (!decoded || !decoded.uid || !decoded.email) {
      res.status(401).json({ error: 'Invalid or expired authentication token' });
      return;
    }
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Authentication failed' });
  });
}

// Check that the authenticated user has an active subscription
export function requireActiveSubscription(db: KeyDB) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = db.getUser(req.user.uid);
    if (!user) {
      res.status(403).json({ error: 'User account not found. Please sign in through the portal first.' });
      return;
    }

    if (user.subscription_status !== 'active') {
      res.status(403).json({ error: 'Active subscription required. Subscribe at mcpkeys.techmavie.digital' });
      return;
    }

    next();
  };
}

// Verify the authenticated user owns the key being operated on
export function requireKeyOwnership(db: KeyDB) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get the key hash from either body (rotate) or params (revoke)
    const rawKey = req.body?.current_api_key;
    const prefixParam = req.params?.prefix;

    if (rawKey) {
      // Rotate flow: verify via key hash
      const owner = db.getKeyOwner(hashKey(rawKey));
      if (owner !== null && owner !== req.user.uid) {
        // Return 404 to prevent enumeration
        res.status(404).json({ error: 'API key not found or already revoked' });
        return;
      }
    }

    // For prefix-based operations, ownership is checked in the route handler
    // using revokeByUser() which enforces user_id match
    next();
  };
}
