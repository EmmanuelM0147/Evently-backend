import { pool } from '../config/database.js';
import { sendNotificationToUser, sendNotificationToEvent } from '../config/websocket.js';

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unread_only = 'false' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        n.*,
        e.title as event_title,
        e.date as event_date
      FROM notifications n
      LEFT JOIN events e ON n.event_id = e.id
      WHERE n.user_id = $1
    `;

    const queryParams = [req.user.id];
    let paramCount = 1;

    if (unread_only === 'true') {
      query += ` AND n.is_read = false`;
    }

    query += ` ORDER BY n.created_at DESC`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = $1';
    const countParams = [req.user.id];

    if (unread_only === 'true') {
      countQuery += ' AND is_read = false';
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalNotifications = parseInt(countResult.rows[0].total);

    // Get unread count
    const unreadResult = await pool.query(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalNotifications / limitNum),
        totalNotifications,
        hasNextPage: pageNum * limitNum < totalNotifications,
        hasPrevPage: pageNum > 1
      },
      unreadCount: parseInt(unreadResult.rows[0].unread_count)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch notifications',
      requestId: req.requestId 
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Notification not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark notification as read',
      requestId: req.requestId 
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      message: `${result.rowCount} notifications marked as read`
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark all notifications as read',
      requestId: req.requestId 
    });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Notification not found' 
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete notification',
      requestId: req.requestId 
    });
  }
};

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private
export const getNotificationStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
        COUNT(CASE WHEN type = 'payment_success' THEN 1 END) as payment_success,
        COUNT(CASE WHEN type = 'payment_failed' THEN 1 END) as payment_failed,
        COUNT(CASE WHEN type = 'event_reminder' THEN 1 END) as event_reminders,
        COUNT(CASE WHEN type = 'rsvp_update' THEN 1 END) as rsvp_updates
       FROM notifications 
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch notification statistics',
      requestId: req.requestId 
    });
  }
};