import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Bot, webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { OpenAI } from "https://deno.land/x/openai@1.4.2/mod.ts";

const bot = new Bot(Deno.env.get("BOT_TOKEN"));
const openai = new OpenAI(Deno.env.get("OPENAI_KEY")!);

// start command.
bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

// on text message.
bot.on("message:text", async (ctx) => {
  try {
    await ctx.reply("Generating Post...");
    const chat_completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            `You are a content repurposing professional, you take a text and you rewrite it into compelling content to instagram ad script. Only include the script. Remember the best instagram ads include the following elements:
            1. Keep it simple and short. Stick to plain text.
            2. Add emojis to your posts where appropriate.
            3. Write a killer headline.
            4. Open with a story where appropriate.
            5. Break up walls of text.
            6. Give specific instructions and unique insights.
            7. Always end by asking a question.
            8. Bring a new, unique angle where possible. Don't be afraid of a little controversy.
            9. Brevity is key.
            Think about whether your post makes sense as a whole, before you start writing.`
        },
        {
          role: "user",
          content: ctx.message.text,
        },
      ],
    })
    await ctx.reply(chat_completion?.choices[0]?.message?.content) || ctx.reply("Please try again.");
  }
  catch (err) {
    console.error(err);
    await ctx.reply("Error happened while generating post.");
  }
}
);

// on voice message.
bot.on("message:voice", async (ctx) => {
  try {
    const voiceId = ctx.message.voice!.file_id;
    const voiceInfo = await bot.api.getFile(voiceId);
    const fileLink = `https://api.telegram.org/file/bot${
      Deno.env.get("BOT_TOKEN")
    }/${voiceInfo.file_path}`;
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
    await ctx.reply("Generating Post...");
    const chat_completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            `You are a content repurposing professional, you take a transcribed voice message and you rewrite it into compelling content to instagram ad script. Only include the script. Remember the best instagram ads include the following elements:
            1. Keep it simple and short. Stick to plain text.
            2. Add emojis to your posts where appropriate.
            3. Write a killer headline.
            4. Open with a story where appropriate.
            5. Break up walls of text.
            6. Give specific instructions and unique insights.
            7. Always end by asking a question.
            8. Bring a new, unique angle where possible. Don't be afraid of a little controversy.
            9. Brevity is key.
            Think about whether your post makes sense as a whole, before you start writing.`,
        },
        {
          role: "user",
          content: transcribe.text,
        },
      ],
    });
    await ctx.reply(
      chat_completion?.choices[0]?.message?.content || "No response",
    );
  } catch (err) {
    console.error(err);
    await ctx.reply("Error");
  }
});


// initialize 'handleUpdate' function for webhook callbacks with 'bot' using 'std/http'.
const handleUpdate = webhookCallback(bot, 'std/http')

// authenticate the request using a secret and handle updates.
serve(async (req) => {
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('secret') !== Deno.env.get('FUNCTION_SECRET'))
      return new Response('not allowed', { status: 405 })

    return await handleUpdate(req)
  } catch (err) {
    console.error(err)
  }
})