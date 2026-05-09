import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.from("agents").select("*");

if (error) {
  console.error(error);
} else {
  console.log(data);
}
