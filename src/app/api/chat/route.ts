import { NextRequest } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  // Support multiple key names
  const apiKey = process.env.OPENROUTER_API_KEY
    || process.env.OPENROUTER_KEY
    || process.env.OR_API_KEY
    || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "AI Group Chat",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAI();
    const { messages, model } = await req.json();

    console.log(`[API] Request for model: ${model}`);

    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream error" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const err = error as Error & { status?: number; message?: string };
    console.error("[API] Error:", err.message || error);

    let message = "Failed to process request";
    let status = 500;

    if (err.message?.includes("API_KEY")) {
      message = "API key not configured. Set OPENROUTER_API_KEY in environment.";
      status = 503;
    } else if (err.status === 401) {
      message = "Invalid API key";
      status = 401;
    } else if (err.status === 429) {
      message = "Rate limit exceeded. Try again later.";
      status = 429;
    } else if (err.status === 400) {
      message = "Invalid request to model";
      status = 400;
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
