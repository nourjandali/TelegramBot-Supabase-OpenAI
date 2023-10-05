import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { YoutubeTranscript } from "https://esm.sh/youtube-transcript@1.0.6";
import { bot, openai, supabase } from "./utils.ts";
import languageCodes from "./languageCodes.json" assert { type: "json" };
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

async function setUserLanguage(userId: number, responseLang: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ response_language: responseLang })
    .eq('user_id', userId);

  if (error) throw error;
}

async function getUserLanguage(userId: number): Promise<{ responseLang: string } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('response_language')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  return data ? { responseLang: data.response_language } : null;
}

export async function getLanguageName(userId: number): Promise<string> {
  const userLanguage = await getUserLanguage(userId!);
  const languageName = languageCodes[userLanguage?.responseLang || "English"];
  return languageName;
}

async function fetchYouTubeTranscript(ctx, url, language, companyDescription) {
  try {
    await ctx.reply("Transcribing...");

    const transcript = await YoutubeTranscript.fetchTranscript(url);

    const formattedTranscript = transcript
      .map((item) => item.text)
      .join(" ")
      .replaceAll("\n", " ");

    const chunkSize = 4096;
    for (let i = 0; i < formattedTranscript.length; i += chunkSize) {
      const chunk = formattedTranscript.slice(i, i + chunkSize);
      // Assuming you also want to send the chunks to Telegram
      await ctx.reply(chunk);
    }

    handleChatCompletion(ctx, formattedTranscript, language, companyDescription);

  } catch (error) {
    console.error("Error fetching transcript:", error);
    await ctx.reply("An error occurred while fetching the transcript.");
  }
}


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

// description command.
bot.command("description", async (ctx) => {
  const userId = ctx.from?.id;
  const description = ctx.match;

  if (description) {
    await setCompanyDescription(userId!, description);
    await ctx.reply("Your company description has been set.");
  }
  else {
    await ctx.reply("You haven't set a company description yet. Provide one after /description to set it.");
  }
});


// set language command.
bot.command("language", async (ctx) => {
  const userId = ctx.from?.id;
  const responseLang = ctx.match;
  await setUserLanguage(userId!, responseLang);
  await ctx.reply(`Response language has been set to ${responseLang}`);
});

// youtube command.
bot.command("youtube", async (ctx) => {
  const userId = ctx.from?.id;
  const companyDescription = await getCompanyDescription(userId!);
  const language = await getLanguageName(userId!);

  const url = ctx.match;
  if (!url) {
    return ctx.reply("Please provide a YouTube URL.");
  }

  fetchYouTubeTranscript(ctx, url, language, companyDescription);
});

// help command.
bot.command("help", (ctx) => {
  const commandsList = [
    "🚀 /start - Start using the bot",
    "📝 /description [description] - Set company description",
    "🗣️ /language [language] - Set response language",
    "🎥 /youtube [YouTube URL] - Get transcript from a YouTube video",
    "ℹ️ /help - Show available commands",
  ];

  const commandsText = commandsList.join("\n\n");

  const helpMessage = `Available commands: \n\n${commandsText}`;

  ctx.reply(helpMessage);
});

// on text message.
bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  const companyDescription = await getCompanyDescription(userId!);
  const language = await getLanguageName(userId!);
  const userCredits = await getUserCredits(userId!);

  if (ctx.message.text.startsWith('/')) {
    return;
  }

  if (userCredits <= 0) {
    return await ctx.reply("Sorry, you've run out of credits.");
  }

  handleChatCompletion(ctx, ctx.message.text, language, companyDescription);
  decreaseUserCredits(userId!);
});

async function getTranscribe(ctx, voiceId, voiceInfo) {
  const userId = ctx.from?.id;
  const companyDescription = await getCompanyDescription(userId!);
  const language = await getLanguageName(userId!);
  const userCredits = await getUserCredits(userId!);
  if (userCredits <= 0) {
    return await ctx.reply("Sorry, you've run out of credits.");
  }
  try {
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
    handleChatCompletion(ctx, transcribe.text, language, companyDescription);

    // decrease user credits.
    decreaseUserCredits(userId!);
  }
  catch (err) {
    console.error(err);
    await ctx.reply("Error fetching transcribe");
  }
}

// on voice message.
bot.on("message:voice", async (ctx) => {
  try {
    const voiceId = ctx.message.voice!.file_id;
    const voiceInfo = await bot.api.getFile(voiceId);
    getTranscribe(ctx, voiceId, voiceInfo);

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
