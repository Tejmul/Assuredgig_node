const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma');

function getAccessSecret() {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw Object.assign(new Error('JWT_ACCESS_SECRET is required'), { status: 500 });
  return s;
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [kind, token] = header.split(' ');
    if (kind !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Authentication credentials were not provided.' });
    }

    const payload = jwt.verify(token, getAccessSecret());
    const userId = Number(payload.sub);
    if (!userId) return res.status(401).json({ error: 'Invalid token' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };

