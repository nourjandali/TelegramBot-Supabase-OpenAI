import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { YoutubeTranscript } from "https://esm.sh/youtube-transcript@1.0.6";
import { bot, openai, supabase } from "./utils.ts";
import handleChatCompletion from "./handleChatCompletion.ts";

async function getUserCredits(userId: number): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('credits')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  return data?.credits || 0;
}

async function decreaseUserCredits(userId: number): Promise<void> {
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('credits')
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  const currentCredits = userData?.credits || 0;

  const { error: updateError } = await supabase
    .from('users')
    .update({ credits: currentCredits - 1 })
    .eq('user_id', userId);

  if (updateError) throw updateError;
}

async function userExists(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId);

  if (error) throw error;

  return data && data.length > 0;
}

async function createUser(userId: number): Promise<void> {
  const { error } = await supabase
    .from('users')
    .insert({ user_id: userId, credits: 3 });

  if (error) throw error;
}

async function setCompanyDescription(userId: number, description: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ company_description: description })
    .eq('user_id', userId);
  
  if (error) throw error;
}

export async function getCompanyDescription(userId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('company_description')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  return data?.company_description || null;
}

// description command.
bot.command("description", async (ctx) => {
  const userId = ctx.from?.id;
  
  const description = ctx.match || null;

  if (description) {
    await setCompanyDescription(userId!, description);
    await ctx.reply("Your company description has been set.");
  } else {
    const existingDescription = await getCompanyDescription(userId!);
    if (existingDescription) {
      await ctx.reply(`Your company description is: ${existingDescription}`);
    } else {
      await ctx.reply("You haven't set a company description yet. Provide one after /description to set it.");
    }
  }
});

// start command.
bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;

  if (!await userExists(userId!)) {
    await createUser(userId!);
    await ctx.reply("Welcome! Your account has been created with 3 free credits.");
  } else {
    await ctx.reply("Welcome back! Your account is already set up.");
  }
});

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;

  const userCredits = await getUserCredits(userId!);

  if (userCredits <= 0) {
    await ctx.reply("Sorry, you've run out of credits.");
    return;
  }

  await decreaseUserCredits(userId!);
  
  if (next) await next();
});

// youtube command.
bot.command("youtube", async (ctx) => {
  const url = ctx.match;
  if (!url) {
    return ctx.reply("Please provide a YouTube URL.");
  }

  await ctx.reply("Transcribing...");

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    const formattedTranscript = transcript
      .map((item) => item.text)
      .join(" ")
      .replaceAll("\n", " ");

    /* 
      Split the formatted transcript into chunks of 4096 characters or less 
      which is the maximum number of characters allowed in a single Telegram message.
    */
    const chunkSize = 4096;
    for (let i = 0; i < formattedTranscript.length; i += chunkSize) {
      const chunk = formattedTranscript.slice(i, i + chunkSize);
    }

    // Send the entire transcript for chat completion
    await handleChatCompletion(ctx, formattedTranscript);
  } catch (error) {
    console.error("Error fetching transcript:", error);
    await ctx.reply("An error occurred while fetching the transcript.");
  }
});

// on text message.
bot.on("message:text", async (ctx) => {
  await handleChatCompletion(ctx, ctx.message.text);
});

// on voice message.
bot.on("message:voice", async (ctx) => {
  try {
    const voiceId = ctx.message.voice!.file_id;
    const voiceInfo = await bot.api.getFile(voiceId);
    const fileLink = `https://api.telegram.org/file/bot${Deno.env.get(
      "BOT_TOKEN"
    )}/${voiceInfo.file_path}`;
    const fileResponse = await fetch(fileLink);
    if (!fileResponse.ok) {
      return ctx.reply("Error fetching file");
    }
    const fileBuffer = await fileResponse.arrayBuffer();
    const file = new File([fileBuffer], voiceId, {
      type: "audio/ogg",
    });

    // transcribe voice message.
    await ctx.reply("Transcribing...");
    const transcribe = await openai.createTranscription({
      file: file,
      model: "whisper-1",
    });

    // generate post.
    await handleChatCompletion(ctx, transcribe.text);
  } catch (err) {
    console.error(err);
    await ctx.reply("Error");
  }
});

// initialize 'handleUpdate' function for webhook callbacks with 'bot' using 'std/http'.
const handleUpdate = webhookCallback(bot, "std/http");

// authenticate the request using a secret and handle updates.
serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== Deno.env.get("FUNCTION_SECRET"))
      return new Response("not allowed", { status: 405 });

    return await handleUpdate(req);
  } catch (err) {
    console.error(err);
  }
});
