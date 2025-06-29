import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Evently API',
      version: '1.0.0',
      description: 'Event management platform API with real-time notifications and payment processing',
      contact: {
        name: 'Evently Support',
        email: 'support@evently.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.evently.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier'
            },
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 30,
              description: 'User display name'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            role: {
              type: 'string',
              enum: ['admin', 'organizer', 'attendee'],
              description: 'User role in the system'
            },
            emailVerified: {
              type: 'boolean',
              description: 'Whether the user email is verified'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp'
            }
          }
        },
        Event: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique event identifier'
            },
            title: {
              type: 'string',
              minLength: 3,
              maxLength: 255,
              description: 'Event title'
            },
            description: {
              type: 'string',
              maxLength: 2000,
              description: 'Event description'
            },
            date: {
              type: 'string',
              format: 'date-time',
              description: 'Event date and time'
            },
            location: {
              type: 'string',
              maxLength: 500,
              description: 'Event location'
            },
            organizerId: {
              type: 'string',
              format: 'uuid',
              description: 'Event organizer user ID'
            },
            isPaid: {
              type: 'boolean',
              description: 'Whether the event requires payment'
            },
            price: {
              type: 'number',
              minimum: 0,
              description: 'Event ticket price'
            },
            maxAttendees: {
              type: 'integer',
              minimum: 1,
              description: 'Maximum number of attendees'
            },
            category: {
              type: 'string',
              description: 'Event category'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the event is active'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Event creation timestamp'
            }
          }
        },
        RSVP: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique RSVP identifier'
            },
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'User ID who RSVPed'
            },
            eventId: {
              type: 'string',
              format: 'uuid',
              description: 'Event ID for the RSVP'
            },
            status: {
              type: 'string',
              enum: ['attending', 'declined', 'maybe'],
              description: 'RSVP status'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'RSVP creation timestamp'
            }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique payment identifier'
            },
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'User who made the payment'
            },
            eventId: {
              type: 'string',
              format: 'uuid',
              description: 'Event for which payment was made'
            },
            amount: {
              type: 'number',
              minimum: 0,
              description: 'Payment amount'
            },
            currency: {
              type: 'string',
              default: 'NGN',
              description: 'Payment currency'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'success', 'failed', 'cancelled'],
              description: 'Payment status'
            },
            paystackReference: {
              type: 'string',
              description: 'Paystack transaction reference'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Payment creation timestamp'
            }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique notification identifier'
            },
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'User who receives the notification'
            },
            type: {
              type: 'string',
              enum: ['payment_success', 'payment_failed', 'event_reminder', 'rsvp_update', 'event_cancelled', 'event_updated'],
              description: 'Notification type'
            },
            title: {
              type: 'string',
              description: 'Notification title'
            },
            message: {
              type: 'string',
              description: 'Notification message'
            },
            isRead: {
              type: 'boolean',
              description: 'Whether the notification has been read'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Notification creation timestamp'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              description: 'Error message'
            },
            requestId: {
              type: 'string',
              description: 'Request ID for debugging'
            }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    description: 'Field that failed validation'
                  },
                  message: {
                    type: 'string',
                    description: 'Validation error message'
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js'], // Path to the API files
};

export default swaggerJsdoc(options);