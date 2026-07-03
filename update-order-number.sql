-- 1. Add order_number column to orders table that auto-increments
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL;

-- Ensure other required security columns from previous updates are present
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pin_attempts INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 2. Optional: Restart sequence at 100 to make receipt numbers look standard
ALTER SEQUENCE IF EXISTS orders_order_number_seq RESTART WITH 100;

-- 3. Update the place_order RPC to return the order_number with security fixes
CREATE OR REPLACE FUNCTION place_order(
  p_table_token TEXT,
  p_guest_name  TEXT,
  p_notes       TEXT,
  p_items       JSON
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- Validate table token
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE qr_token = p_table_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unknown table token';
  END IF;

  -- Table-level Rate Limiting (30-second cooldown)
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE table_id = v_table.id
      AND created_at > NOW() - INTERVAL '30 seconds'
  ) THEN
    RAISE EXCEPTION 'Please wait 30 seconds before placing another order from this table.';
  END IF;

  -- Validate guest name
  IF trim(p_guest_name) = '' OR length(p_guest_name) > 50 THEN
    RAISE EXCEPTION 'Invalid guest name';
  END IF;

  -- DoS check: Validate item-count bounds before parsing
  IF json_array_length(p_items) IS NULL OR json_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart cannot be empty';
  ELSIF json_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order contains too many items (limit is 50)';
  END IF;

  -- Parse items JSON
  SELECT ARRAY(
    SELECT json_populate_record(null::order_item_input, x)
    FROM json_array_elements(p_items) x
  ) INTO v_parsed_items;

  -- Verify items + calculate subtotal
  FOR v_item IN SELECT * FROM unnest(v_parsed_items) LOOP
    IF v_item.quantity <= 0 OR v_item.quantity > 20 THEN
      RAISE EXCEPTION 'Invalid quantity % for item %', v_item.quantity, v_item.menu_item_id;
    END IF;

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

  v_tax   := ROUND(v_subtotal * 0.05, 2);
  v_total := ROUND(v_subtotal + v_tax + v_service_charge, 2);

  -- Cryptographically secure 6-digit PIN
  v_bytes := gen_random_bytes(4);
  v_num := ((get_byte(v_bytes, 0) << 24) | 
            (get_byte(v_bytes, 1) << 16) | 
            (get_byte(v_bytes, 2) << 8)  | 
            get_byte(v_bytes, 3)) & 2147483647;
  v_pin_code := ((v_num % 900000) + 100000)::text;

  -- Insert order and capture both the UUID and the auto-increment order_number
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

  -- Insert order items
  FOR v_item IN SELECT * FROM unnest(v_parsed_items) LOOP
    SELECT price INTO v_menu_item FROM menu_items WHERE id = v_item.menu_item_id;

    INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order)
    VALUES (v_order_id, v_item.menu_item_id, v_item.quantity, v_menu_item.price);
  END LOOP;

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

-- 4. Update the get_order_by_pin RPC to return order_number in order JSON object with security fixes
CREATE OR REPLACE FUNCTION get_order_by_pin(
  p_order_id UUID,
  p_pin_code TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_items JSON;
BEGIN
  SELECT o.*, rt.table_number INTO v_order
  FROM orders o
  LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid Order ID');
  END IF;

  IF v_order.locked_until IS NOT NULL AND v_order.locked_until > NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Too many failed attempts. Try again in 15 minutes.');
  END IF;

  IF v_order.pin_code != p_pin_code THEN
    UPDATE orders 
    SET pin_attempts = COALESCE(pin_attempts, 0) + 1,
        locked_until = CASE WHEN COALESCE(pin_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = p_order_id;

    RETURN json_build_object('success', false, 'error', 'Invalid PIN Code');
  END IF;

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
