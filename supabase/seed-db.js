import { createClient } from "@supabase/supabase-js";
import { INITIAL_FOOD_ITEMS } from "../src/data/mockData.ts";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Error: VITE_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY must be set.",
  );
  console.error("Run this script using Node.js 20.6+ with env loading, e.g.:");
  console.error("  node --env-file=.env.local supabase/seed-db.js");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "Warning: Running without SUPABASE_SERVICE_ROLE_KEY. DB insertions may fail due to RLS policies.",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("Seeding Supabase Database...");

  // 1. Create a restaurant
  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .insert([{ name: "Dine-QR Demo Restaurant" }])
    .select()
    .single();

  if (rErr) {
    console.error("Error creating restaurant:", rErr);
    return;
  }
  console.log("Created Restaurant ID:", restaurant.id);

  // 2. Create tables
  const { data: table, error: tErr } = await supabase
    .from("restaurant_tables")
    .insert([
      {
        restaurant_id: restaurant.id,
        table_number: 1,
        qr_token: "table-1-qr-xyz",
      },
    ])
    .select()
    .single();

  if (tErr) console.error("Error creating table:", tErr);
  else console.log("Created Table ID:", table.id);

  // 3. Seed Menu Items
  const menuItemsToInsert = INITIAL_FOOD_ITEMS.map((item) => ({
    restaurant_id: restaurant.id,
    name: item.name,
    description: item.description,
    price: item.price,
    category: item.category,
    image_url: item.image,
    in_stock: item.isAvailable,
  }));

  const { error: mErr } = await supabase
    .from("menu_items")
    .insert(menuItemsToInsert);

  if (mErr) console.error("Error seeding menu items:", mErr);
  else console.log("Successfully seeded menu items!");
}

seed();
