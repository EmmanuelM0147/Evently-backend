import { pool } from '../config/database.js';
import { validationResult } from 'express-validator';
import { eventCache, invalidateEventCache } from '../middleware/cache.js';

// @desc    Create new event
// @route   POST /api/events
// @access  Private
export const createEvent = async (req, res) => {
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

    const {
      title,
      description,
      date,
      location,
      is_paid,
      price = 0,
      max_capacity = 100,
      category
    } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO events (title, description, date, location, organizer_id, is_paid, price, max_attendees, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, description, date, location, req.user.id, is_paid, price, max_capacity, category]
    );

    await client.query('COMMIT');

    // Invalidate related cache
    invalidateEventCache();

    res.status(201).json({
      success: true,
      data: {
        event_id: result.rows[0].id,
        ...result.rows[0],
        creation_timestamp: result.rows[0].created_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create event error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create event',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};

// @desc    Get all events with advanced filtering
// @route   GET /api/events
// @access  Public
export const getEvents = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      search, 
      location,
      date_from,
      date_to,
      sort_by = 'date',
      sort_order = 'ASC'
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
    const offset = (pageNum - 1) * limitNum;

    // Validate sort parameters
    const validSortFields = ['date', 'created_at', 'title', 'price'];
    const validSortOrders = ['ASC', 'DESC'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'date';
    const sortDirection = validSortOrders.includes(sort_order?.toUpperCase()) ? sort_order.toUpperCase() : 'ASC';

    // Build query with optimized joins and subqueries
    let query = `
      SELECT 
        e.*,
        u.username as organizer_name,
        u.email as organizer_email,
        COALESCE(rsvp_counts.rsvp_count, 0) as rsvp_count,
        COALESCE(attending_counts.attending_count, 0) as attending_count,
        (e.max_attendees - COALESCE(attending_counts.attending_count, 0)) as available_spots
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as rsvp_count
        FROM rsvps
        GROUP BY event_id
      ) rsvp_counts ON e.id = rsvp_counts.event_id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as attending_count
        FROM rsvps
        WHERE status = 'attending'
        GROUP BY event_id
      ) attending_counts ON e.id = attending_counts.event_id
      WHERE e.date >= CURRENT_TIMESTAMP AND e.is_active = true
    `;

    const queryParams = [];
    let paramCount = 0;

    // Add filters
    if (category) {
      paramCount++;
      query += ` AND e.category ILIKE $${paramCount}`;
      queryParams.push(`%${category}%`);
    }

    if (search) {
      paramCount++;
      query += ` AND (e.title ILIKE $${paramCount} OR e.description ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    if (location) {
      paramCount++;
      query += ` AND e.location ILIKE $${paramCount}`;
      queryParams.push(`%${location}%`);
    }

    if (date_from) {
      paramCount++;
      query += ` AND e.date >= $${paramCount}`;
      queryParams.push(date_from);
    }

    if (date_to) {
      paramCount++;
      query += ` AND e.date <= $${paramCount}`;
      queryParams.push(date_to);
    }

    // Add sorting and pagination
    query += ` ORDER BY e.${sortField} ${sortDirection}`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination (optimized count query)
    let countQuery = `
      SELECT COUNT(DISTINCT e.id) as total
      FROM events e
      WHERE e.date >= CURRENT_TIMESTAMP AND e.is_active = true
    `;
    const countParams = [];
    let countParamCount = 0;

    // Apply same filters to count query
    if (category) {
      countParamCount++;
      countQuery += ` AND e.category ILIKE $${countParamCount}`;
      countParams.push(`%${category}%`);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (e.title ILIKE $${countParamCount} OR e.description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (location) {
      countParamCount++;
      countQuery += ` AND e.location ILIKE $${countParamCount}`;
      countParams.push(`%${location}%`);
    }

    if (date_from) {
      countParamCount++;
      countQuery += ` AND e.date >= $${countParamCount}`;
      countParams.push(date_from);
    }

    if (date_to) {
      countParamCount++;
      countQuery += ` AND e.date <= $${countParamCount}`;
      countParams.push(date_to);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalEvents = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalEvents / limitNum),
        totalEvents,
        eventsPerPage: limitNum,
        hasNextPage: pageNum * limitNum < totalEvents,
        hasPrevPage: pageNum > 1
      },
      filters: {
        category,
        search,
        location,
        date_from,
        date_to,
        sort_by: sortField,
        sort_order: sortDirection
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch events',
      requestId: req.requestId 
    });
  }
};

// @desc    Get single event with detailed information
// @route   GET /api/events/:id
// @access  Public
export const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        e.*,
        u.username as organizer_name,
        u.email as organizer_email,
        COALESCE(rsvp_counts.rsvp_count, 0) as total_rsvps,
        COALESCE(attending_counts.attending_count, 0) as attending_count,
        COALESCE(maybe_counts.maybe_count, 0) as maybe_count,
        COALESCE(declined_counts.declined_count, 0) as declined_count,
        (e.max_attendees - COALESCE(attending_counts.attending_count, 0)) as available_spots
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as rsvp_count
        FROM rsvps GROUP BY event_id
      ) rsvp_counts ON e.id = rsvp_counts.event_id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as attending_count
        FROM rsvps WHERE status = 'attending' GROUP BY event_id
      ) attending_counts ON e.id = attending_counts.event_id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as maybe_count
        FROM rsvps WHERE status = 'maybe' GROUP BY event_id
      ) maybe_counts ON e.id = maybe_counts.event_id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as declined_count
        FROM rsvps WHERE status = 'declined' GROUP BY event_id
      ) declined_counts ON e.id = declined_counts.event_id
      WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Event not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch event',
      requestId: req.requestId 
    });
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private
export const updateEvent = async (req, res) => {
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

    const { id } = req.params;
    const {
      title,
      description,
      date,
      location,
      is_paid,
      price,
      max_capacity,
      category
    } = req.body;

    await client.query('BEGIN');

    // Check if event exists and user is the organizer
    const eventCheck = await client.query(
      'SELECT organizer_id, max_attendees FROM events WHERE id = $1',
      [id]
    );

    if (eventCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: 'Event not found' 
      });
    }

    if (eventCheck.rows[0].organizer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to update this event' 
      });
    }

    // If reducing capacity, check current attendees
    if (max_capacity && max_capacity < eventCheck.rows[0].max_attendees) {
      const attendeeCount = await client.query(
        'SELECT COUNT(*) FROM rsvps WHERE event_id = $1 AND status = $2',
        [id, 'attending']
      );

      if (parseInt(attendeeCount.rows[0].count) > max_capacity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: `Cannot reduce capacity below current attendee count (${attendeeCount.rows[0].count})` 
        });
      }
    }

    const result = await client.query(
      `UPDATE events SET
       title = $1, description = $2, date = $3, location = $4,
       is_paid = $5, price = $6, max_attendees = $7, category = $8,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [title, description, date, location, is_paid, price || 0, max_capacity || 100, category, id]
    );

    await client.query('COMMIT');

    // Invalidate cache
    invalidateEventCache(id);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update event error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update event',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private
export const deleteEvent = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if event exists and user is the organizer
    const eventCheck = await client.query(
      'SELECT organizer_id FROM events WHERE id = $1',
      [id]
    );

    if (eventCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: 'Event not found' 
      });
    }

    if (eventCheck.rows[0].organizer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to delete this event' 
      });
    }

    // Check if event has attendees
    const attendeeCount = await client.query(
      'SELECT COUNT(*) FROM rsvps WHERE event_id = $1 AND status = $2',
      [id, 'attending']
    );

    if (parseInt(attendeeCount.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete event with confirmed attendees. Please cancel the event instead.' 
      });
    }

    // Soft delete by setting is_active to false
    await client.query(
      'UPDATE events SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    // Invalidate cache
    invalidateEventCache(id);

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete event error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete event',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};

// @desc    Get user's events
// @route   GET /api/events/user/my-events
// @access  Private
export const getUserEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = await pool.query(
      `SELECT 
        e.*,
        COALESCE(rsvp_counts.rsvp_count, 0) as total_rsvps,
        COALESCE(attending_counts.attending_count, 0) as attending_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) as rsvp_count
        FROM rsvps GROUP BY event_id
      ) rsvp_counts ON e.id = rsvp_counts.event_id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as attending_count
        FROM rsvps WHERE status = 'attending' GROUP BY event_id
      ) attending_counts ON e.id = attending_counts.event_id
      WHERE e.organizer_id = $1 
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3`,
      [req.user.id, limitNum, offset]
    );

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM events WHERE organizer_id = $1',
      [req.user.id]
    );

    const totalEvents = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalEvents / limitNum),
        totalEvents,
        hasNextPage: pageNum * limitNum < totalEvents,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user events',
      requestId: req.requestId 
    });
  }
};