--
-- PostgreSQL database dump
--

\restrict p4M1Jfd5SBmZu7vDCg4c3DlfGxSNs0Be5xKBCNS4Om3o9KGe3F2y4dAQwdiYmsD

-- Dumped from database version 15.19
-- Dumped by pg_dump version 15.19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    date timestamp without time zone NOT NULL,
    location character varying(500) NOT NULL,
    organizer_id uuid NOT NULL,
    is_paid boolean DEFAULT false NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    max_attendees integer DEFAULT 100 NOT NULL,
    category character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guest_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_audit_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wedding_id uuid NOT NULL,
    guest_id uuid,
    actor_user_id uuid,
    action character varying(50) NOT NULL,
    outcome character varying(50) NOT NULL,
    request_id character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guest_invitation_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_invitation_deliveries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wedding_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    channel character varying(20) NOT NULL,
    provider character varying(50) NOT NULL,
    recipient_last4 character varying(4),
    status character varying(20) NOT NULL,
    error_message character varying(255),
    attempted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    delivered_at timestamp without time zone,
    CONSTRAINT guest_invitation_deliveries_channel_check CHECK (((channel)::text = ANY ((ARRAY['sms'::character varying, 'whatsapp'::character varying, 'email'::character varying])::text[]))),
    CONSTRAINT guest_invitation_deliveries_status_check CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wedding_id uuid NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(50),
    normalized_phone character varying(50),
    side character varying(20) NOT NULL,
    plus_one_cap integer DEFAULT 0 NOT NULL,
    invite_code_hash character(64) NOT NULL,
    invite_code_suffix character varying(6) NOT NULL,
    invite_code_issued_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    invite_code_revoked_at timestamp without time zone,
    rsvp_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    plus_one_count integer DEFAULT 0 NOT NULL,
    rsvp_submitted_at timestamp without time zone,
    checked_in_at timestamp without time zone,
    checked_in_by uuid,
    archived_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    invite_code character varying(6),
    table_id uuid,
    CONSTRAINT guests_check CHECK ((plus_one_count <= plus_one_cap)),
    CONSTRAINT guests_plus_one_cap_check CHECK (((plus_one_cap >= 0) AND (plus_one_cap <= 10))),
    CONSTRAINT guests_plus_one_count_check CHECK ((plus_one_count >= 0)),
    CONSTRAINT guests_rsvp_status_check CHECK (((rsvp_status)::text = ANY ((ARRAY['pending'::character varying, 'attending'::character varying, 'declined'::character varying])::text[]))),
    CONSTRAINT guests_side_check CHECK (((side)::text = ANY ((ARRAY['bride'::character varying, 'groom'::character varying, 'mutual'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid,
    payment_id uuid,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'NGN'::character varying NOT NULL,
    paystack_reference character varying(255) NOT NULL,
    paystack_access_code character varying(255),
    authorization_url text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    gateway_response text,
    paid_at timestamp without time zone,
    attendee_name character varying(255) NOT NULL,
    attendee_email character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'success'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rsvps (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    status character varying(20) DEFAULT 'attending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rsvps_status_check CHECK (((status)::text = ANY ((ARRAY['attending'::character varying, 'declined'::character varying, 'maybe'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'attendee'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    verification_token character varying(128),
    token_expires_at timestamp without time zone,
    last_login_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'organizer'::character varying, 'attendee'::character varying, 'staff'::character varying])::text[])))
);


--
-- Name: wedding_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wedding_tables (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wedding_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    capacity integer DEFAULT 10 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT wedding_tables_capacity_check CHECK (((capacity >= 1) AND (capacity <= 100)))
);


--
-- Name: weddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weddings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    wedding_date date,
    venue character varying(500),
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: guest_audit_events guest_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_audit_events
    ADD CONSTRAINT guest_audit_events_pkey PRIMARY KEY (id);


--
-- Name: guest_invitation_deliveries guest_invitation_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_invitation_deliveries
    ADD CONSTRAINT guest_invitation_deliveries_pkey PRIMARY KEY (id);


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_paystack_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_paystack_reference_key UNIQUE (paystack_reference);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: rsvps rsvps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_pkey PRIMARY KEY (id);


--
-- Name: rsvps rsvps_user_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_user_id_event_id_key UNIQUE (user_id, event_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: users users_verification_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_verification_token_key UNIQUE (verification_token);


--
-- Name: wedding_tables wedding_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wedding_tables
    ADD CONSTRAINT wedding_tables_pkey PRIMARY KEY (id);


--
-- Name: wedding_tables wedding_tables_wedding_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wedding_tables
    ADD CONSTRAINT wedding_tables_wedding_id_name_key UNIQUE (wedding_id, name);


--
-- Name: weddings weddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weddings
    ADD CONSTRAINT weddings_pkey PRIMARY KEY (id);


--
-- Name: idx_events_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category ON public.events USING btree (category);


--
-- Name: idx_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_date ON public.events USING btree (date);


--
-- Name: idx_events_organizer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_organizer ON public.events USING btree (organizer_id);


--
-- Name: idx_guest_audit_guest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_audit_guest ON public.guest_audit_events USING btree (guest_id, created_at DESC);


--
-- Name: idx_guest_invitation_deliveries_guest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_invitation_deliveries_guest ON public.guest_invitation_deliveries USING btree (guest_id, attempted_at DESC);


--
-- Name: idx_guests_filters; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guests_filters ON public.guests USING btree (wedding_id, side, rsvp_status, checked_in_at);


--
-- Name: idx_guests_invite_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_guests_invite_code ON public.guests USING btree (wedding_id, invite_code_hash);


--
-- Name: idx_guests_numeric_code_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guests_numeric_code_hash ON public.guests USING btree (wedding_id, invite_code_hash) WHERE ((archived_at IS NULL) AND (invite_code_revoked_at IS NULL));


--
-- Name: idx_guests_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_guests_phone ON public.guests USING btree (wedding_id, normalized_phone) WHERE (normalized_phone IS NOT NULL);


--
-- Name: idx_guests_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guests_table_id ON public.guests USING btree (table_id);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_payments_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_event ON public.payments USING btree (event_id);


--
-- Name: idx_payments_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_reference ON public.payments USING btree (paystack_reference);


--
-- Name: idx_payments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user ON public.payments USING btree (user_id);


--
-- Name: idx_rsvps_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rsvps_event ON public.rsvps USING btree (event_id);


--
-- Name: idx_rsvps_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rsvps_status ON public.rsvps USING btree (status);


--
-- Name: idx_rsvps_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rsvps_user ON public.rsvps USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_weddings_single_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_weddings_single_active ON public.weddings USING btree (is_active) WHERE (is_active = true);


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: guests update_guests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_guests_updated_at BEFORE UPDATE ON public.guests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notifications update_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rsvps update_rsvps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rsvps_updated_at BEFORE UPDATE ON public.rsvps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: weddings update_weddings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_weddings_updated_at BEFORE UPDATE ON public.weddings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: events events_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: guest_audit_events guest_audit_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_audit_events
    ADD CONSTRAINT guest_audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guest_audit_events guest_audit_events_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_audit_events
    ADD CONSTRAINT guest_audit_events_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE SET NULL;


--
-- Name: guest_audit_events guest_audit_events_wedding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_audit_events
    ADD CONSTRAINT guest_audit_events_wedding_id_fkey FOREIGN KEY (wedding_id) REFERENCES public.weddings(id) ON DELETE CASCADE;


--
-- Name: guest_invitation_deliveries guest_invitation_deliveries_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_invitation_deliveries
    ADD CONSTRAINT guest_invitation_deliveries_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE CASCADE;


--
-- Name: guest_invitation_deliveries guest_invitation_deliveries_wedding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_invitation_deliveries
    ADD CONSTRAINT guest_invitation_deliveries_wedding_id_fkey FOREIGN KEY (wedding_id) REFERENCES public.weddings(id) ON DELETE CASCADE;


--
-- Name: guests guests_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guests guests_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.wedding_tables(id) ON DELETE SET NULL;


--
-- Name: guests guests_wedding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guests
    ADD CONSTRAINT guests_wedding_id_fkey FOREIGN KEY (wedding_id) REFERENCES public.weddings(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: rsvps rsvps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: rsvps rsvps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wedding_tables wedding_tables_wedding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wedding_tables
    ADD CONSTRAINT wedding_tables_wedding_id_fkey FOREIGN KEY (wedding_id) REFERENCES public.weddings(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict p4M1Jfd5SBmZu7vDCg4c3DlfGxSNs0Be5xKBCNS4Om3o9KGe3F2y4dAQwdiYmsD

