CREATE TABLE IF NOT EXISTS wedding_gifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
    guest_name VARCHAR(255) NOT NULL,
    method VARCHAR(20) NOT NULL CHECK (method IN ('online', 'transfer')),
    -- Amounts are in kobo. amount_kobo is the gift itself; fee_kobo is the Paystack fee the guest chose to cover
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
    charged_kobo BIGINT NOT NULL CHECK (charged_kobo > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    message TEXT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'reported', 'received')),
    paystack_reference VARCHAR(100) UNIQUE,
    authorization_url TEXT,
    gateway_response JSONB,
    paid_at TIMESTAMP,
    received_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wedding_gifts_wedding ON wedding_gifts(wedding_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_gifts_guest ON wedding_gifts(guest_id);
