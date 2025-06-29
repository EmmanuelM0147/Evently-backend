import { pool } from '../config/database.js';
import { validationResult } from 'express-validator';
import { invalidateRsvpCache, invalidateEventCache } from '../middleware/cache.js';

// @desc    Create or update RSVP with transaction support
// @route   POST /api/rsvps
// @access  Private
export const createOrUpdateRSVP = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { event_id, status } = req.body;
    const user_id = req.user.id;

    // Validate status
    const validStatuses = ['attending', 'declined', 'maybe'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid RSVP status. Must be: attending, declined, or maybe' 
      });
    }

    await client.query('BEGIN');

    // Get event details with lock to prevent race conditions
    const eventResult = await client.query(
      'SELECT id, title, date, max_attendees, is_active FROM events WHERE id = $1 AND is_active = true FOR UPDATE',
      [event_id]
    );

    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: 'Event not found or inactive' 
      });
    }

    const event = eventResult.rows[0];

    // Check if event is in the future
    if (new Date(event.date) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot RSVP to past events' 
      });
    }

    // Get current RSVP status for this user
    const currentRsvpResult = await client.query(
      'SELECT id, status FROM rsvps WHERE user_id = $1 AND event_id = $2',
      [user_id, event_id]
    );

    const currentRsvp = currentRsvpResult.rows[0];
    const wasAttending = currentRsvp?.status === 'attending';
    const willBeAttending = status === 'attending';

    // Check capacity constraints if user is trying to attend (or switching to attending)
    if (willBeAttending && !wasAttending) {
      const attendanceResult = await client.query(
        'SELECT COUNT(*) as count FROM rsvps WHERE event_id = $1 AND status = $2',
        [event_id, 'attending']
      );

      const currentAttendeeCount = parseInt(attendanceResult.rows[0].count);
      
      if (currentAttendeeCount >= event.max_attendees) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: `Event is at maximum capacity (${event.max_attendees} attendees)`,
          available_spots: 0
        });
      }
    }

    // Create or update RSVP
    let result;
    if (currentRsvp) {
      // Update existing RSVP
      result = await client.query(
        `UPDATE rsvps 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND event_id = $3
         RETURNING *`,
        [status, user_id, event_id]
      );
    } else {
      // Create new RSVP
      result = await client.query(
        `INSERT INTO rsvps (user_id, event_id, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [user_id, event_id, status]
      );
    }

    // Get updated attendance count
    const updatedAttendanceResult = await client.query(
      'SELECT COUNT(*) as count FROM rsvps WHERE event_id = $1 AND status = $2',
      [event_id, 'attending']
    );

    await client.query('COMMIT');

    // Invalidate related caches
    invalidateRsvpCache(event_id, user_id);
    invalidateEventCache(event_id);

    const rsvpData = result.rows[0];
    const currentAttendeeCount = parseInt(updatedAttendanceResult.rows[0].count);

    res.json({
      success: true,
      data: {
        rsvp_id: rsvpData.id,
        ...rsvpData,
        event_details: {
          title: event.title,
          date: event.date,
          current_attendees: currentAttendeeCount,
          max_attendees: event.max_attendees,
          available_spots: event.max_attendees - currentAttendeeCount
        }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create/Update RSVP error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process RSVP',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};

// @desc    Get RSVPs with advanced filtering
// @route   GET /api/rsvps
// @access  Private
export const getRSVPs = async (req, res) => {
  try {
    const { 
      event_id, 
      user_id, 
      status,
      page = 1, 
      limit = 10,
      include_event_details = 'true',
      include_user_details = 'false'
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build base query
    let query = `
      SELECT 
        r.*,
        ${include_event_details === 'true' ? `
        e.title as event_title,
        e.description as event_description,
        e.date as event_date,
        e.location as event_location,
        e.category as event_category,
        e.max_attendees as event_max_attendees,
        ` : ''}
        ${include_user_details === 'true' ? `
        u.username as attendee_username,
        u.email as attendee_email,
        ` : ''}
        1 as placeholder
      FROM rsvps r
      ${include_event_details === 'true' ? 'JOIN events e ON r.event_id = e.id' : ''}
      ${include_user_details === 'true' ? 'JOIN users u ON r.user_id = u.id' : ''}
      WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 0;

    // Add filters
    if (event_id) {
      paramCount++;
      query += ` AND r.event_id = $${paramCount}`;
      queryParams.push(event_id);
    }

    if (user_id) {
      paramCount++;
      query += ` AND r.user_id = $${paramCount}`;
      queryParams.push(user_id);
    }

    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      queryParams.push(status);
    }

    // Authorization check: users can only see their own RSVPs unless they're event organizers
    if (!user_id && !event_id) {
      // If no specific filters, show user's own RSVPs
      paramCount++;
      query += ` AND r.user_id = $${paramCount}`;
      queryParams.push(req.user.id);
    } else if (event_id && !user_id) {
      // If querying by event_id, verify user is the organizer
      const organizerCheck = await pool.query(
        'SELECT organizer_id FROM events WHERE id = $1',
        [event_id]
      );

      if (organizerCheck.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Event not found' 
        });
      }

      if (organizerCheck.rows[0].organizer_id !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          error: 'Not authorized to view event RSVPs' 
        });
      }
    } else if (user_id && user_id !== req.user.id) {
      // Users can only query their own RSVPs
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to view other users\' RSVPs' 
      });
    }

    // Add sorting and pagination
    query += ` ORDER BY r.created_at DESC`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM rsvps r
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    // Apply same filters to count query
    if (event_id) {
      countParamCount++;
      countQuery += ` AND r.event_id = $${countParamCount}`;
      countParams.push(event_id);
    }

    if (user_id) {
      countParamCount++;
      countQuery += ` AND r.user_id = $${countParamCount}`;
      countParams.push(user_id);
    } else if (!event_id) {
      countParamCount++;
      countQuery += ` AND r.user_id = $${countParamCount}`;
      countParams.push(req.user.id);
    }

    if (status) {
      countParamCount++;
      countQuery += ` AND r.status = $${countParamCount}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalRSVPs = parseInt(countResult.rows[0].total);

    // Get summary statistics if querying by event
    let summary = null;
    if (event_id) {
      const summaryResult = await pool.query(
        `SELECT 
          status,
          COUNT(*) as count
        FROM rsvps 
        WHERE event_id = $1 
        GROUP BY status`,
        [event_id]
      );

      summary = {
        attending: 0,
        declined: 0,
        maybe: 0,
        total: 0
      };

      summaryResult.rows.forEach(row => {
        summary[row.status] = parseInt(row.count);
        summary.total += parseInt(row.count);
      });
    }

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRSVPs / limitNum),
        totalRSVPs,
        rsvpsPerPage: limitNum,
        hasNextPage: pageNum * limitNum < totalRSVPs,
        hasPrevPage: pageNum > 1
      },
      summary,
      filters: {
        event_id,
        user_id,
        status
      }
    });
  } catch (error) {
    console.error('Get RSVPs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch RSVPs',
      requestId: req.requestId 
    });
  }
};

// @desc    Get user's RSVPs
// @route   GET /api/rsvps/my-rsvps
// @access  Private
export const getUserRSVPs = async (req, res) => {
  try {
    const { status, upcoming_only = 'true', page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        r.*,
        e.title,
        e.description,
        e.date,
        e.location,
        e.category,
        e.max_attendees,
        u.username as organizer_name,
        COALESCE(attending_counts.attending_count, 0) as current_attendees
      FROM rsvps r
      JOIN events e ON r.event_id = e.id
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as attending_count
        FROM rsvps WHERE status = 'attending' GROUP BY event_id
      ) attending_counts ON e.id = attending_counts.event_id
      WHERE r.user_id = $1
    `;
    const queryParams = [req.user.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (upcoming_only === 'true') {
      query += ` AND e.date >= CURRENT_TIMESTAMP`;
    }

    query += ` ORDER BY e.date ASC`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM rsvps r
      JOIN events e ON r.event_id = e.id
      WHERE r.user_id = $1
    `;
    const countParams = [req.user.id];
    let countParamCount = 1;

    if (status) {
      countParamCount++;
      countQuery += ` AND r.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (upcoming_only === 'true') {
      countQuery += ` AND e.date >= CURRENT_TIMESTAMP`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalRSVPs = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRSVPs / limitNum),
        totalRSVPs,
        hasNextPage: pageNum * limitNum < totalRSVPs,
        hasPrevPage: pageNum > 1
      },
      filters: {
        status,
        upcoming_only: upcoming_only === 'true'
      }
    });
  } catch (error) {
    console.error('Get user RSVPs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user RSVPs',
      requestId: req.requestId 
    });
  }
};

// @desc    Get event RSVPs (for organizers)
// @route   GET /api/rsvps/event/:eventId
// @access  Private
export const getEventRSVPs = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    // Verify user is the event organizer
    const eventCheck = await pool.query(
      'SELECT organizer_id, title, max_attendees FROM events WHERE id = $1',
      [eventId]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Event not found' 
      });
    }

    if (eventCheck.rows[0].organizer_id !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to view event RSVPs' 
      });
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Get RSVPs with user details
    let query = `
      SELECT 
        r.*,
        u.username,
        u.email
      FROM rsvps r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = $1
    `;
    const queryParams = [eventId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      queryParams.push(status);
    }

    query += ` ORDER BY r.created_at DESC`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);

    // Get summary counts
    const summaryResult = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
      FROM rsvps 
      WHERE event_id = $1 
      GROUP BY status`,
      [eventId]
    );

    const summary = {
      attending: 0,
      declined: 0,
      maybe: 0,
      total: 0
    };

    summaryResult.rows.forEach(row => {
      summary[row.status] = parseInt(row.count);
      summary.total += parseInt(row.count);
    });

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM rsvps WHERE event_id = $1';
    const countParams = [eventId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalRSVPs = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        event_info: {
          title: eventCheck.rows[0].title,
          max_attendees: eventCheck.rows[0].max_attendees,
          available_spots: eventCheck.rows[0].max_attendees - summary.attending
        },
        rsvps: result.rows,
        summary
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRSVPs / limitNum),
        totalRSVPs,
        hasNextPage: pageNum * limitNum < totalRSVPs,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get event RSVPs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch event RSVPs',
      requestId: req.requestId 
    });
  }
};

// @desc    Delete RSVP
// @route   DELETE /api/rsvps/:id
// @access  Private
export const deleteRSVP = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if RSVP exists and belongs to user
    const rsvpCheck = await client.query(
      'SELECT user_id, event_id FROM rsvps WHERE id = $1',
      [id]
    );

    if (rsvpCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: 'RSVP not found' 
      });
    }

    if (rsvpCheck.rows[0].user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to delete this RSVP' 
      });
    }

    await client.query('DELETE FROM rsvps WHERE id = $1', [id]);
    await client.query('COMMIT');

    // Invalidate caches
    const { event_id, user_id } = rsvpCheck.rows[0];
    invalidateRsvpCache(event_id, user_id);
    invalidateEventCache(event_id);

    res.json({
      success: true,
      message: 'RSVP deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete RSVP error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete RSVP',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};