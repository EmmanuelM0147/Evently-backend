CREATE TABLE IF NOT EXISTS wedding_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 10 CHECK (capacity BETWEEN 1 AND 100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (wedding_id, name)
);

ALTER TABLE guests ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES wedding_tables(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_guests_table_id ON guests(table_id);
