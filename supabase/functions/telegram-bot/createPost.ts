import { openai } from "./utils.ts";
import { getCompanyDescription, getLanguageName } from "./index.ts";

async function createPost(ctx, text, language, companyDescription) {
  try {


    await ctx.reply("Generating Post...");
    const chat_completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a content repurposing professional, you take a text and you rewrite it into compelling content to Instagram ad script. Write it in ${language} language. Only include the script. Remember the best instagram ads include the following elements: ${companyDescription ? "\nThe company description: " + companyDescription : ""}
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
          content: text,
        },
      ],
    });
    await ctx.reply(chat_completion?.choices[0]?.message?.content) || ctx.reply("Please try again.");
  } catch (err) {
    console.error(err);
    await ctx.reply("Error happened while generating post.");
  }
}

export default createPost;