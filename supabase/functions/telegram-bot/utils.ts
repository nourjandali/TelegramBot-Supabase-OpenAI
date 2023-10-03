import { Bot } from "https://deno.land/x/grammy/mod.ts";
import { OpenAI } from "https://deno.land/x/openai@1.4.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

export const bot = new Bot(Deno.env.get("BOT_TOKEN")!);
export const openai = new OpenAI(Deno.env.get("OPENAI_KEY")!);
export const supabase = createClient(
    Deno.env.get("URL_SUPABASE")!,
    Deno.env.get("KEY_SUPABASE")!,
  );
