'use strict';
const { createClient } = require('@supabase/supabase-js');

// Verifies the Supabase JWT by calling supabase.auth.getUser(token).
// This works with both legacy JWT secrets and new JWT Signing Keys.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
function authSupabase() {
  return async (req, res, next) => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = header.slice(7);

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Server misconfiguration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' });
      }
      // Dev-only: decode without verification
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (!payload?.sub) return res.status(401).json({ error: 'Invalid token' });
        req.userId = payload.sub;
        return next();
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user?.id) {
        return res.status(401).json({ error: 'Expired or invalid token' });
      }
      req.userId = data.user.id;
      next();
    } catch {
      return res.status(401).json({ error: 'Expired or invalid token' });
    }
  };
}

module.exports = { authSupabase };
