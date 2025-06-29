import { pool } from '../config/database.js';
import { paystackRequest } from '../config/paystack.js';
import { validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { sendNotificationToUser, broadcastPaymentUpdate } from '../config/websocket.js';

// @desc    Initialize payment with Paystack
// @route   POST /api/payments/initialize
// @access  Private
export const initializePayment = async (req, res) => {
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

    const { event_id, attendee_name, attendee_email } = req.body;
    const user_id = req.user.id;

    await client.query('BEGIN');

    // Get event details with lock
    const eventResult = await client.query(
      'SELECT id, title, price, max_attendees, is_paid, is_active FROM events WHERE id = $1 AND is_active = true FOR UPDATE',
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

    // Check if event requires payment
    if (!event.is_paid || event.price <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: 'This event is free and does not require payment' 
      });
    }

    // Check if user already has a pending/successful payment for this event
    const existingPaymentResult = await client.query(
      'SELECT id, status, paystack_reference FROM payments WHERE user_id = $1 AND event_id = $2 AND status IN ($3, $4)',
      [user_id, event_id, 'pending', 'success']
    );

    if (existingPaymentResult.rows.length > 0) {
      const existingPayment = existingPaymentResult.rows[0];
      
      if (existingPayment.status === 'success') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: 'You have already paid for this event' 
        });
      }

      if (existingPayment.status === 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: 'You have a pending payment for this event',
          paymentReference: existingPayment.paystack_reference
        });
      }
    }

    // Check event capacity
    const attendanceResult = await client.query(
      'SELECT COUNT(*) as count FROM rsvps WHERE event_id = $1 AND status = $2',
      [event_id, 'attending']
    );

    const currentAttendees = parseInt(attendanceResult.rows[0].count);
    if (currentAttendees >= event.max_attendees) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: 'Event is at maximum capacity' 
      });
    }

    // Generate unique reference
    const reference = `evently_${Date.now()}_${uuidv4().slice(0, 8)}`;

    // Initialize payment with Paystack
    const paymentData = {
      email: attendee_email,
      amount: Math.round(event.price * 100), // Convert to kobo
      reference,
      currency: 'NGN',
      callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/callback`,
      metadata: {
        event_id,
        event_title: event.title,
        user_id,
        attendee_name,
        custom_fields: [
          {
            display_name: "Event",
            variable_name: "event_title",
            value: event.title
          },
          {
            display_name: "Attendee",
            variable_name: "attendee_name", 
            value: attendee_name
          }
        ]
      }
    };

    const paystackResponse = await paystackRequest('/transaction/initialize', 'POST', paymentData);

    if (!paystackResponse.status) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: 'Payment initialization failed',
        details: paystackResponse.message 
      });
    }

    // Save payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
        user_id, event_id, amount, currency, paystack_reference, 
        paystack_access_code, authorization_url, status, 
        attendee_name, attendee_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        user_id, event_id, event.price, 'NGN', reference,
        paystackResponse.data.access_code, paystackResponse.data.authorization_url,
        'pending', attendee_name, attendee_email
      ]
    );

    await client.query('COMMIT');

    const payment = paymentResult.rows[0];

    // Send notification
    await sendNotificationToUser(user_id, {
      type: 'payment_initialized',
      title: 'Payment Initialized',
      message: `Payment for "${event.title}" has been initialized. Please complete the payment.`,
      eventId: event_id,
      paymentId: payment.id,
      metadata: {
        amount: event.price,
        reference
      }
    });

    res.status(201).json({
      success: true,
      data: {
        payment_id: payment.id,
        authorization_url: paystackResponse.data.authorization_url,
        access_code: paystackResponse.data.access_code,
        reference: paystackResponse.data.reference,
        amount: event.price,
        currency: 'NGN',
        event_title: event.title
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Initialize payment error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Payment initialization failed',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};

// @desc    Verify payment with Paystack
// @route   GET /api/payments/verify/:reference
// @access  Private
export const verifyPayment = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { reference } = req.params;
    const user_id = req.user.id;

    await client.query('BEGIN');

    // Get payment record
    const paymentResult = await client.query(
      'SELECT * FROM payments WHERE paystack_reference = $1 AND user_id = $2 FOR UPDATE',
      [reference, user_id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: 'Payment record not found' 
      });
    }

    const payment = paymentResult.rows[0];

    // If already verified, return success
    if (payment.status === 'success') {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: {
          reference: payment.paystack_reference,
          status: 'success',
          amount: payment.amount,
          verified_at: payment.paid_at
        }
      });
    }

    // Verify with Paystack
    const paystackResponse = await paystackRequest(`/transaction/verify/${reference}`);

    if (!paystackResponse.status) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: 'Payment verification failed',
        details: paystackResponse.message 
      });
    }

    const transaction = paystackResponse.data;
    const isSuccessful = transaction.status === 'success';
    const newStatus = isSuccessful ? 'success' : 'failed';

    // Update payment status
    await client.query(
      `UPDATE payments SET 
       status = $1, gateway_response = $2, paid_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [
        newStatus,
        JSON.stringify(transaction),
        isSuccessful ? new Date() : null,
        payment.id
      ]
    );

    if (isSuccessful) {
      // Create or update RSVP
      const rsvpResult = await client.query(
        'SELECT id FROM rsvps WHERE user_id = $1 AND event_id = $2',
        [user_id, payment.event_id]
      );

      if (rsvpResult.rows.length === 0) {
        // Create new RSVP
        await client.query(
          'INSERT INTO rsvps (user_id, event_id, status) VALUES ($1, $2, $3)',
          [user_id, payment.event_id, 'attending']
        );
      } else {
        // Update existing RSVP
        await client.query(
          'UPDATE rsvps SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND event_id = $3',
          ['attending', user_id, payment.event_id]
        );
      }

      // Get event details for notification
      const eventResult = await client.query(
        'SELECT title FROM events WHERE id = $1',
        [payment.event_id]
      );

      const eventTitle = eventResult.rows[0]?.title || 'Event';

      // Send success notification
      await sendNotificationToUser(user_id, {
        type: 'payment_success',
        title: 'Payment Successful!',
        message: `Your payment for "${eventTitle}" has been processed successfully. You are now registered for the event.`,
        eventId: payment.event_id,
        paymentId: payment.id,
        metadata: {
          amount: payment.amount,
          reference: payment.paystack_reference
        }
      });
    } else {
      // Send failure notification
      await sendNotificationToUser(user_id, {
        type: 'payment_failed',
        title: 'Payment Failed',
        message: `Your payment for this event could not be processed. Please try again.`,
        eventId: payment.event_id,
        paymentId: payment.id,
        metadata: {
          amount: payment.amount,
          reference: payment.paystack_reference,
          reason: transaction.gateway_response
        }
      });
    }

    await client.query('COMMIT');

    // Broadcast payment status update via WebSocket
    broadcastPaymentUpdate(reference, newStatus, user_id, {
      amount: payment.amount,
      eventId: payment.event_id
    });

    res.json({
      success: true,
      message: isSuccessful ? 'Payment verified successfully' : 'Payment verification failed',
      data: {
        reference: payment.paystack_reference,
        status: newStatus,
        amount: payment.amount,
        verified_at: isSuccessful ? new Date() : null,
        gateway_response: transaction.gateway_response
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Verify payment error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Payment verification failed',
      requestId: req.requestId 
    });
  } finally {
    client.release();
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
export const getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        p.*,
        e.title as event_title,
        e.date as event_date,
        e.location as event_location
      FROM payments p
      JOIN events e ON p.event_id = e.id
      WHERE p.user_id = $1
    `;

    const queryParams = [req.user.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      queryParams.push(status);
    }

    query += ` ORDER BY p.created_at DESC`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM payments WHERE user_id = $1';
    const countParams = [req.user.id];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalPayments = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalPayments / limitNum),
        totalPayments,
        hasNextPage: pageNum * limitNum < totalPayments,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch payment history',
      requestId: req.requestId 
    });
  }
};

// @desc    Handle Paystack webhook
// @route   POST /api/payments/webhook
// @access  Public (but validated)
export const handlePaystackWebhook = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    if (event.event === 'charge.success') {
      const { reference } = event.data;

      await client.query('BEGIN');

      // Update payment status
      const result = await client.query(
        `UPDATE payments SET 
         status = 'success', 
         gateway_response = $1, 
         paid_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
         WHERE paystack_reference = $2
         RETURNING user_id, event_id, amount`,
        [JSON.stringify(event.data), reference]
      );

      if (result.rows.length > 0) {
        const payment = result.rows[0];

        // Create RSVP
        await client.query(
          `INSERT INTO rsvps (user_id, event_id, status)
           VALUES ($1, $2, 'attending')
           ON CONFLICT (user_id, event_id) 
           DO UPDATE SET status = 'attending', updated_at = CURRENT_TIMESTAMP`,
          [payment.user_id, payment.event_id]
        );

        // Send notification
        await sendNotificationToUser(payment.user_id, {
          type: 'payment_success',
          title: 'Payment Confirmed!',
          message: 'Your payment has been confirmed. You are now registered for the event.',
          eventId: payment.event_id,
          metadata: {
            amount: payment.amount,
            reference
          }
        });

        // Broadcast update
        broadcastPaymentUpdate(reference, 'success', payment.user_id);
      }

      await client.query('COMMIT');
    }

    res.status(200).json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
};