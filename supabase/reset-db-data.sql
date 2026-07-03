-- 1. Safely truncate all orders and order items (deletes all data)
TRUNCATE TABLE order_items CASCADE;
TRUNCATE TABLE orders CASCADE;

-- 2. Reset the sequential order number counter back to 100
ALTER SEQUENCE IF EXISTS orders_order_number_seq RESTART WITH 100;
