/*
  # Secure Event Management Database Schema

  1. New Tables
    - `users` - User accounts with role-based access and authentication
    - `events` - Event information with organizer relationships
    - `rsvps` - Event attendance management with status tracking

  2. Security Features
    - Row Level Security (RLS) enabled on all tables
    - UUID primary keys for enhanced security
    - Role-based access control policies
    - Proper foreign key constraints with CASCADE delete
    - Unique constraints to prevent duplicate RSVPs

  3. Performance Optimizations
    - Indexes on frequently queried columns
    - Efficient constraint checking
    - Optimized relationship queries

  4. Data Integrity
    - CHECK constraints for valid enum values
    - NOT NULL constraints on required fields
    - Audit trails with created_at timestamps
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS rsvps CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table with role-based access
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'attendee' CHECK (role IN ('admin', 'organizer', 'attendee')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table with organizer relationships
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date TIMESTAMP NOT NULL,
    location VARCHAR(500) NOT NULL,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_paid BOOLEAN DEFAULT false,
    price DECIMAL(10, 2) DEFAULT 0.00,
    max_attendees INTEGER DEFAULT 100,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RSVPs table for event attendance management
CREATE TABLE rsvps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'attending' CHECK (status IN ('attending', 'declined', 'maybe')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Ensure unique RSVPs per user per event
    UNIQUE(user_id, event_id)
);

-- Performance optimization indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_events_organizer ON events(organizer_id);
CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_rsvps_user ON rsvps(user_id);
CREATE INDEX idx_rsvps_event ON rsvps(event_id);
CREATE INDEX idx_rsvps_status ON rsvps(status);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read own profile"
    ON users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Admins can read all users"
    ON users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for events table
CREATE POLICY "Anyone can read active events"
    ON events
    FOR SELECT
    TO authenticated
    USING (is_active = true);

CREATE POLICY "Organizers can create events"
    ON events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = organizer_id AND
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('organizer', 'admin')
        )
    );

CREATE POLICY "Organizers can update own events"
    ON events
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = organizer_id AND
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('organizer', 'admin')
        )
    );

CREATE POLICY "Organizers can delete own events"
    ON events
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = organizer_id AND
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('organizer', 'admin')
        )
    );

-- RLS Policies for rsvps table
CREATE POLICY "Users can read own RSVPs"
    ON rsvps
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Event organizers can read event RSVPs"
    ON rsvps
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM events 
            WHERE id = event_id AND organizer_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own RSVPs"
    ON rsvps
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own RSVPs"
    ON rsvps
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own RSVPs"
    ON rsvps
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rsvps_updated_at
    BEFORE UPDATE ON rsvps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample admin user (password: Admin123!)
INSERT INTO users (email, password_hash, username, role) VALUES
(
    'admin@evently.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/YNnhxKU7e',
    'admin',
    'admin'
) ON CONFLICT (email) DO NOTHING;