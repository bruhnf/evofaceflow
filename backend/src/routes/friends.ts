import { Router, Request, Response } from 'express';
import { Follow } from '../models/Follow';
import { User } from '../models/User';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Follow a user
router.post('/follow/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const followerId = (req as any).user.userId;
    const { userId: followingId } = req.params;

    if (followerId === followingId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    // Check if target user exists
    const targetUser = await User.findOne({ userId: followingId });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({ followerId, followingId });
    if (existingFollow) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    // Create follow relationship
    await Follow.create({ followerId, followingId });

    // Update counts
    await User.updateOne({ userId: followerId }, { $inc: { followingCount: 1 } });
    await User.updateOne({ userId: followingId }, { $inc: { followersCount: 1 } });

    res.json({ message: 'Successfully followed user', isFollowing: true });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unfollow a user
router.delete('/unfollow/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const followerId = (req as any).user.userId;
    const { userId: followingId } = req.params;

    // Check if following
    const existingFollow = await Follow.findOne({ followerId, followingId });
    if (!existingFollow) {
      return res.status(400).json({ message: 'Not following this user' });
    }

    // Remove follow relationship
    await Follow.deleteOne({ followerId, followingId });

    // Update counts
    await User.updateOne({ userId: followerId }, { $inc: { followingCount: -1 } });
    await User.updateOne({ userId: followingId }, { $inc: { followersCount: -1 } });

    res.json({ message: 'Successfully unfollowed user', isFollowing: false });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get users I'm following (my "friends")
router.get('/following', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const following = await Follow.find({ followerId: userId }).sort({ createdAt: -1 });
    const followingIds = following.map(f => f.followingId);

    const users = await User.find({ userId: { $in: followingIds } })
      .select('userId username avatarUrl bio');

    res.json(users);
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get my followers
router.get('/followers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const followers = await Follow.find({ followingId: userId }).sort({ createdAt: -1 });
    const followerIds = followers.map(f => f.followerId);

    const users = await User.find({ userId: { $in: followerIds } })
      .select('userId username avatarUrl bio');

    // Also check if I follow them back
    const myFollowing = await Follow.find({ followerId: userId, followingId: { $in: followerIds } });
    const myFollowingSet = new Set(myFollowing.map(f => f.followingId));

    const usersWithFollowStatus = users.map(user => ({
      userId: user.userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isFollowingBack: myFollowingSet.has(user.userId),
    }));

    res.json(usersWithFollowStatus);
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check if following a specific user
router.get('/is-following/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const followerId = (req as any).user.userId;
    const { userId: followingId } = req.params;

    const existingFollow = await Follow.findOne({ followerId, followingId });
    res.json({ isFollowing: !!existingFollow });
  } catch (error) {
    console.error('Check following error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users to follow
router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Search query required' });
    }

    const users = await User.find({
      userId: { $ne: userId },
      username: { $regex: q, $options: 'i' }
    })
      .select('userId username avatarUrl bio')
      .limit(20);

    // Check which ones I'm already following
    const myFollowing = await Follow.find({ 
      followerId: userId, 
      followingId: { $in: users.map(u => u.userId) } 
    });
    const followingSet = new Set(myFollowing.map(f => f.followingId));

    const usersWithFollowStatus = users.map(user => ({
      userId: user.userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isFollowing: followingSet.has(user.userId),
    }));

    res.json(usersWithFollowStatus);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
