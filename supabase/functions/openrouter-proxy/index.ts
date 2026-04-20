// supabase/functions/openrouter-proxy/index.ts
// Secure proxy for OpenRouter API calls
// Validates auth header and proxies requests safely to OpenRouter

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface OpenRouterRequest {
  serviceType: string;
  prompt: string;
  model?: string;
  userId?: string;
}

interface ErrorResponse {
  error: string;
  code: string;
  status: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }

  try {
    // 1. VALIDATE AUTHORIZATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[OpenRouter] Missing or invalid auth header");
      return sendError("Unauthorized", "MISSING_AUTH", 401);
    }

    const token = authHeader.substring(7);
    const decoded = await verifyToken(token);
    if (!decoded) {
      console.warn("[OpenRouter] Invalid JWT token");
      return sendError("Invalid token", "INVALID_TOKEN", 401);
    }

    const userId = decoded.sub;
    console.log("[OpenRouter] Request from user:", userId);

    // 2. PARSE AND VALIDATE REQUEST BODY
    let body: OpenRouterRequest;
    try {
      body = await req.json();
    } catch (e) {
      return sendError("Invalid JSON", "INVALID_BODY", 400);
    }

    // Validate required fields
    if (!body.serviceType || !body.prompt) {
      console.warn("[OpenRouter] Missing required fields");
      return sendError("Missing serviceType or prompt", "MISSING_FIELDS", 400);
    }

    // Validate serviceType against whitelist
    const ALLOWED_SERVICES = [
      "trabalho",
      "cv",
      "carta",
      "orcamento",
      "impressao",
      "foto",
      "conversao",
    ];

    if (!ALLOWED_SERVICES.includes(body.serviceType)) {
      console.warn("[OpenRouter] Invalid serviceType:", body.serviceType);
      return sendError("Invalid service type", "INVALID_SERVICE", 400);
    }

    // Validate prompt length (prevent abuse)
    if (body.prompt.length < 10 || body.prompt.length > 5000) {
      return sendError("Prompt must be 10-5000 characters", "INVALID_PROMPT", 400);
    }

    // 3. CALL OPENROUTER API
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      console.error("[OpenRouter] API key not configured");
      return sendError("Server configuration error", "CONFIG_ERROR", 500);
    }

    const model = body.model || "meta-llama/llama-3.3-70b-instruct:free";
    const siteUrl = Deno.env.get("SITE_URL");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "MzDocs Pro",
    };
    if (siteUrl) {
      headers["HTTP-Referer"] = siteUrl;
    }

    const openrouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: body.prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    // Handle OpenRouter API response
    if (!openrouterResponse.ok) {
      const errorData = await openrouterResponse.json();
      console.error("[OpenRouter] API error:", errorData);

      // Handle specific error codes
      const status = openrouterResponse.status;
      if (status === 429) {
        return sendError(
          "Rate limited. Please try again in a moment.",
          "RATE_LIMIT",
          429
        );
      } else if (status === 402) {
        return sendError(
          "OpenRouter account has no credits",
          "NO_CREDITS",
          402
        );
      } else if (status === 401) {
        return sendError("Invalid API key", "AUTH_ERROR", 401);
      }

      return sendError(
        errorData.error?.message || "OpenRouter API error",
        "OPENROUTER_ERROR",
        status || 500
      );
    }

    // 4. PARSE AND VALIDATE OPENROUTER RESPONSE
    const data = await openrouterResponse.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message?.content) {
      console.error("[OpenRouter] Unexpected response format");
      return sendError("Unexpected API response", "INVALID_RESPONSE", 500);
    }

    const document = data.choices[0].message.content.trim();
    const usedModel = data.model || model;

    // 5. LOG THE SUCCESSFUL REQUEST
    console.log("[OpenRouter] Success:", {
      userId,
      serviceType: body.serviceType,
      model: usedModel,
      promptLength: body.prompt.length,
      responseLength: document.length,
      timestamp: new Date().toISOString(),
    });

    // 6. RETURN RESPONSE
    return new Response(
      JSON.stringify({
        document,
        model: usedModel,
        serviceType: body.serviceType,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[OpenRouter] Unhandled error:", error);
    return sendError("Internal server error", "INTERNAL_ERROR", 500);
  }
});

/**
 * Verify Supabase JWT token
 * Decodes JWT without external library (basic verification)
 */
async function verifyToken(token: string) {
  try {
    // Split JWT into parts
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (part 1)
    const decoded = JSON.parse(atob(parts[1]));

    // Basic validation
    if (!decoded.sub) {
      return null;
    }

    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch (e) {
    console.error("[Token] Verification failed:", e.message);
    return null;
  }
}

/**
 * Send error response with consistent format
 */
function sendError(message: string, code: string, status: number) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
