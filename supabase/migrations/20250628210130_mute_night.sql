/*
  # Add Email Verification System

  1. Schema Updates
    - Add email_verified boolean field to users table
    - Add verification_token field for email verification
    - Add token_expires_at for token expiration
    - Add last_login_at for tracking user activity

  2. Security
    - Index on verification_token for fast lookups
    - Token expiration handling
    - Email uniqueness enforcement

  3. Additional Features
    - Account activation flow
    - Token-based verification system
*/

-- Add email verification fields to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'verification_token'
  ) THEN
    ALTER TABLE users ADD COLUMN verification_token VARCHAR(128) UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE users ADD COLUMN token_expires_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
  END IF;
END $$;

-- Create index for verification token lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  UPDATE users 
  SET verification_token = NULL, token_expires_at = NULL
  WHERE token_expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Update the admin user to be verified
UPDATE users 
SET email_verified = TRUE 
WHERE email = 'admin@evently.com';

-- Add constraint to ensure active users have verified emails (optional, can be enabled later)
-- ALTER TABLE users ADD CONSTRAINT check_verified_active 
-- CHECK (NOT is_active OR email_verified = TRUE);