-- =================================================================================
-- DINE-QR SECURITY SCHEMA: Comprehensive RLS, Cryptographic Randomness & Admin RPCs
-- Run this script in your Supabase SQL Editor.
-- =================================================================================

-- Enable pgcrypto extension for gen_random_bytes (installed in extensions or public schema)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REALTIME: Enable real-time broadcast for admin dashboard
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'menu_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'restaurant_tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SCHEMA & COLUMNS ADJUSTMENT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pin_attempts INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ADMIN AUTHORIZATION SYSTEM
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: Auto-signup trigger and bulk-sync triggers on auth.users are REMOVED.
-- To grant a user admin privileges, manually run:
--   INSERT INTO public.admin_users (id) VALUES ('<USER_UUID>');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Drop all old policies to avoid collision
DROP POLICY IF EXISTS "Admins can view their own record" ON public.admin_users;
DROP POLICY IF EXISTS "Public read restaurants" ON restaurants;
DROP POLICY IF EXISTS "Admins manage restaurants" ON restaurants;
DROP POLICY IF EXISTS "Public read tables" ON restaurant_tables;
DROP POLICY IF EXISTS "Admins manage tables" ON restaurant_tables;
DROP POLICY IF EXISTS "Admins can view tables" ON restaurant_tables;
DROP POLICY IF EXISTS "Public read menu items" ON menu_items;
DROP POLICY IF EXISTS "Admins manage menu items" ON menu_items;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
DROP POLICY IF EXISTS "Anyone can insert order items" ON order_items;
DROP POLICY IF EXISTS "Public read orders" ON orders;
DROP POLICY IF EXISTS "Admins can read all orders" ON orders;
DROP POLICY IF EXISTS "Admins manage orders" ON orders;
DROP POLICY IF EXISTS "Admins manage order items" ON order_items;

-- 4a. Admin Users Policies
CREATE POLICY "Admins can view their own record" ON public.admin_users
  FOR SELECT USING (auth.uid() = id);

-- 4b. Restaurants Policies
CREATE POLICY "Public read restaurants" ON restaurants
  FOR SELECT USING (true);
CREATE POLICY "Admins manage restaurants" ON restaurants
  FOR ALL USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- 4c. Restaurant Tables Policies (Strict Admin SELECT only. Writes strictly via RPC)
CREATE POLICY "Admins can view tables" ON restaurant_tables
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- 4d. Menu Items Policies (Writes strictly via RPC)
CREATE POLICY "Public read menu items" ON menu_items
  FOR SELECT USING (true);

-- 4e. Orders Policies (Writes strictly via RPC)
CREATE POLICY "Admins manage orders" ON orders
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- 4f. Order Items Policies (Writes strictly via RPC)
CREATE POLICY "Admins manage order items" ON order_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TYPE: Shared input type for order items
-- ─────────────────────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS order_item_input CASCADE;
CREATE TYPE order_item_input AS (
  menu_item_id UUID,
  quantity     INT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TOKEN GENERATOR FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_table_token()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  token TEXT := 'tbl_';
  bytes BYTEA;
  i INT;
BEGIN
  bytes := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    token := token || substr(chars, (get_byte(bytes, i) % length(chars)) + 1, 1);
  END LOOP;
  RETURN token;
END;
$$;

ALTER TABLE restaurant_tables ALTER COLUMN qr_token SET DEFAULT generate_table_token();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: place_order — secure customer order placement with DoS bounds
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION place_order(
  p_table_token TEXT,
  p_guest_name  TEXT,
  p_notes       TEXT,
  p_items       JSON
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_table         RECORD;
  v_order_id      UUID;
  v_order_number  INT;
  v_pin_code      TEXT;
  v_subtotal      NUMERIC(10,2) := 0;
  v_tax           NUMERIC(10,2) := 0;
  v_service_charge NUMERIC(10,2) := 0;
  v_total         NUMERIC(10,2) := 0;
  v_item          RECORD;
  v_menu_item     RECORD;
  v_parsed_items  order_item_input[];
  v_bytes         BYTEA;
  v_num           INT;
BEGIN
  -- ── 7a. Validate table token ──────────────────────────────────────────────
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE qr_token = p_table_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unknown table token';
  END IF;

  -- ── 7b. Table-level Rate Limiting (30-second cooldown) ─────────────────────
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE table_id = v_table.id
      AND created_at > NOW() - INTERVAL '30 seconds'
  ) THEN
    RAISE EXCEPTION 'Please wait 30 seconds before placing another order from this table.';
  END IF;

  -- ── 7c. Validate guest name ───────────────────────────────────────────────
  IF trim(p_guest_name) = '' OR length(p_guest_name) > 50 THEN
    RAISE EXCEPTION 'Invalid guest name';
  END IF;

  -- ── 7d. DoS check: Validate item-count bounds before parsing ──────────────
  IF json_array_length(p_items) IS NULL OR json_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart cannot be empty';
  ELSIF json_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order contains too many items (limit is 50)';
  END IF;

  -- ── 7e. Parse items JSON → typed array ───────────────────────────────────
  SELECT ARRAY(
    SELECT json_populate_record(null::order_item_input, x)
    FROM json_array_elements(p_items) x
  ) INTO v_parsed_items;

  -- ── 7f. Verify items + calculate true subtotal ────────────────────────────
  FOR v_item IN SELECT * FROM unnest(v_parsed_items) LOOP
    -- Quantity bounds
    IF v_item.quantity <= 0 OR v_item.quantity > 20 THEN
      RAISE EXCEPTION 'Invalid quantity % for item %', v_item.quantity, v_item.menu_item_id;
    END IF;

    -- Look up item in the same restaurant (via table → restaurant_id)
    SELECT * INTO v_menu_item
    FROM menu_items
    WHERE id = v_item.menu_item_id
      AND restaurant_id = v_table.restaurant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item not found for this restaurant';
    END IF;

    IF v_menu_item.in_stock = false THEN
      RAISE EXCEPTION 'Item "%" is currently out of stock', v_menu_item.name;
    END IF;

    v_subtotal := v_subtotal + (v_menu_item.price * v_item.quantity);
  END LOOP;

  -- ── 7g. Server-side billing (5 % tax, no service charge) ─────────────────
  v_tax            := ROUND(v_subtotal * 0.05, 2);
  v_service_charge := 0.00;
  v_total          := ROUND(v_subtotal + v_tax + v_service_charge, 2);

  -- ── 7h. Generate cryptographically secure 6-digit PIN ────────────────────
  v_bytes := gen_random_bytes(4);
  v_num := ((get_byte(v_bytes, 0) << 24) | 
            (get_byte(v_bytes, 1) << 16) | 
            (get_byte(v_bytes, 2) << 8)  | 
            get_byte(v_bytes, 3)) & 2147483647;
  v_pin_code := ((v_num % 900000) + 100000)::text;

  -- ── 7i. Insert order ──────────────────────────────────────────────────────
  INSERT INTO orders (
    restaurant_id, table_id, guest_name, notes,
    subtotal, tax, service_charge, total,
    status, pin_code
  ) VALUES (
    v_table.restaurant_id,
    v_table.id,
    trim(p_guest_name),
    COALESCE(trim(p_notes), ''),
    v_subtotal, v_tax, v_service_charge, v_total,
    'placed',
    v_pin_code
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  -- ── 7j. Insert order items ────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM unnest(v_parsed_items) LOOP
    SELECT price INTO v_menu_item FROM menu_items WHERE id = v_item.menu_item_id;

    INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order)
    VALUES (v_order_id, v_item.menu_item_id, v_item.quantity, v_menu_item.price);
  END LOOP;

  -- ── 7k. Return result ─────────────────────────────────────────────────────
  RETURN json_build_object(
    'success',       true,
    'order_id',      v_order_id,
    'order_number',  v_order_number,
    'pin_code',      v_pin_code,
    'total_charged', v_total,
    'table_number',  v_table.table_number
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC: get_order_by_pin — secure customer order fetch (PIN required)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_order_by_pin(
  p_order_id UUID,
  p_pin_code TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_items JSON;
BEGIN
  -- 1. Get the order without checking PIN to evaluate lockout status
  SELECT o.*, rt.table_number INTO v_order
  FROM orders o
  LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid Order ID');
  END IF;

  -- 2. Check if locked
  IF v_order.locked_until IS NOT NULL AND v_order.locked_until > NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Too many failed attempts. Try again in 15 minutes.');
  END IF;

  -- 3. Check PIN
  IF v_order.pin_code != p_pin_code THEN
    -- Increment attempts and lock if >= 5
    UPDATE orders 
    SET pin_attempts = COALESCE(pin_attempts, 0) + 1,
        locked_until = CASE WHEN COALESCE(pin_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = p_order_id;

    RETURN json_build_object('success', false, 'error', 'Invalid PIN Code');
  END IF;

  -- 4. Reset attempts on success
  IF COALESCE(v_order.pin_attempts, 0) > 0 THEN
    UPDATE orders SET pin_attempts = 0, locked_until = NULL WHERE id = p_order_id;
  END IF;

  SELECT json_agg(json_build_object(
    'itemId',   oi.menu_item_id,
    'name',     m.name,
    'price',    oi.price_at_order,
    'quantity', oi.quantity,
    'isVeg',    true
  )) INTO v_items
  FROM order_items oi
  JOIN menu_items m ON m.id = oi.menu_item_id
  WHERE oi.order_id = p_order_id;

  RETURN json_build_object(
    'success', true,
    'order', json_build_object(
      'id',            v_order.id,
      'orderNumber',   v_order.order_number,
      'guestName',     v_order.guest_name,
      'status',        v_order.status,
      'tableNumber',   v_order.table_number,
      'subtotal',      v_order.subtotal,
      'tax',           v_order.tax,
      'serviceCharge', v_order.service_charge,
      'grandTotal',    v_order.total,
      'placedAt',      v_order.created_at,
      'items',         v_items
    )
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC: validate_table_token — used by the customer menu page on load
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_table_token(
  p_token TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_table RECORD;
BEGIN
  SELECT * INTO v_table FROM restaurant_tables WHERE qr_token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false);
  END IF;

  RETURN json_build_object(
    'valid',        true,
    'table_id',     v_table.id,
    'table_number', v_table.table_number,
    'restaurant_id', v_table.restaurant_id
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. SECURE MUTATION RPCs FOR ADMIN OPERATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- 10a. Update Order Status
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  UPDATE orders
  SET status = p_status
  WHERE id = p_order_id;
END;
$$;

-- 10b. Toggle Item Availability
CREATE OR REPLACE FUNCTION toggle_item_availability(
  p_item_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  UPDATE menu_items
  SET in_stock = NOT in_stock
  WHERE id = p_item_id;
END;
$$;

-- 10c. Add Menu Item
CREATE OR REPLACE FUNCTION add_menu_item(
  p_restaurant_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_price NUMERIC,
  p_category TEXT,
  p_image_url TEXT,
  p_in_stock BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  INSERT INTO menu_items (restaurant_id, name, description, price, category, image_url, in_stock)
  VALUES (p_restaurant_id, p_name, p_description, p_price, p_category, p_image_url, p_in_stock);
END;
$$;

-- 10d. Update Menu Item
CREATE OR REPLACE FUNCTION update_menu_item(
  p_item_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_price NUMERIC,
  p_category TEXT,
  p_image_url TEXT,
  p_in_stock BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  UPDATE menu_items
  SET name = p_name,
      description = p_description,
      price = p_price,
      category = p_category,
      image_url = p_image_url,
      in_stock = p_in_stock
  WHERE id = p_item_id;
END;
$$;

-- 10e. Delete Menu Item
CREATE OR REPLACE FUNCTION delete_menu_item(
  p_item_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  -- Delete associated order items first to prevent foreign key constraint violations
  DELETE FROM order_items WHERE menu_item_id = p_item_id;

  DELETE FROM menu_items
  WHERE id = p_item_id;
END;
$$;

-- 10f. Clear All Orders (Destructive action)
CREATE OR REPLACE FUNCTION clear_all_orders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  DELETE FROM order_items WHERE id IS NOT NULL;
  DELETE FROM orders WHERE id IS NOT NULL;
END;
$$;

-- 10g. Generate Tables Server-Side (Admin only)
CREATE OR REPLACE FUNCTION generate_tables(
  p_count INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_restaurant_id UUID := '11111111-1111-1111-1111-111111111111';
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  IF p_count < 1 OR p_count > 100 THEN
    RAISE EXCEPTION 'Invalid table count. Must be between 1 and 100.';
  END IF;

  FOR n IN 1..p_count LOOP
    IF NOT EXISTS (SELECT 1 FROM restaurant_tables WHERE table_number = n) THEN
      INSERT INTO restaurant_tables (restaurant_id, table_number, qr_token)
      VALUES (v_restaurant_id, n, generate_table_token());
    END IF;
  END LOOP;
END;
$$;

-- 10h. Rotate Table Token Server-Side (Admin only)
CREATE OR REPLACE FUNCTION rotate_table_token(
  p_table_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: User is not an administrator.';
  END IF;

  UPDATE restaurant_tables
  SET qr_token = generate_table_token()
  WHERE id = p_table_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. REVOKE & GRANT PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- Revoke PUBLIC execute permissions on all security functions
REVOKE EXECUTE ON FUNCTION generate_table_token() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION place_order(TEXT, TEXT, TEXT, JSON) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_order_by_pin(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_table_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_order_status(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION toggle_item_availability(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_menu_item(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_menu_item(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_menu_item(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION clear_all_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_tables(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rotate_table_token(UUID) FROM PUBLIC;

-- Grant execution to anon and authenticated for customer RPCs
GRANT EXECUTE ON FUNCTION place_order(TEXT, TEXT, TEXT, JSON) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_order_by_pin(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_table_token(TEXT) TO anon, authenticated;

-- Grant execution to authenticated only for admin RPCs (which perform additional admin_users checks)
GRANT EXECUTE ON FUNCTION update_order_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_item_availability(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_menu_item(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_menu_item(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_menu_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_all_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_tables(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION rotate_table_token(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. SEED DEMO RESTAURANT AND TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Seed default demo restaurant and a secure Table 1 mock token to allow testing instantly
INSERT INTO public.restaurants (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Dine-QR Demo Restaurant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.restaurant_tables (restaurant_id, table_number, qr_token)
VALUES ('11111111-1111-1111-1111-111111111111', 1, 'table-1-qr-xyz')
ON CONFLICT (qr_token) DO NOTHING;
