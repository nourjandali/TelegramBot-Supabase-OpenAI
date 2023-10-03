import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { YoutubeTranscript } from "https://esm.sh/youtube-transcript@1.0.6";
import { bot, openai } from "./utils.ts";
import handleChatCompletion from "./handleChatCompletion.ts";

// start command.
bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

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
