import { config } from "../config/envConfig.js";

/**
 * Sends a WhatsApp message using the Facebook/Meta Business Cloud API.
 * If credentials are not set in the environment, it falls back to console logging
 * to ensure a smooth local development workflow.
 * 
 * @param {Object} params
 * @param {string} params.to Recipient's phone number (with country code)
 * @param {"text"|"template"|"media"} params.type Message format type
 * @param {Object} [params.text] Raw text content (e.g. { body })
 * @param {Object} [params.template] Template config (e.g. { name, languageCode, components, textFallback })
 * @param {Object} [params.media] Media details (e.g. { type, link, caption, filename })
 */
export async function sendWhatsapp({ to, type, text, template, media }) {
  const phoneNumberId = config.whatsappMetaPhoneNumberId;
  const accessToken = config.whatsappMetaAccessToken;

  console.log(`[WhatsApp] sendWhatsapp called: to=${to}, type=${type}`);
  console.log(`[WhatsApp] Phone Number ID: ${phoneNumberId ? phoneNumberId.substring(0, 8) + "..." : "NOT SET"}`);
  console.log(`[WhatsApp] Access Token: ${accessToken ? "SET (" + accessToken.substring(0, 10) + "...)" : "NOT SET"}`);

  // Formatting phone number: strip non-digits (Meta requires digits only, e.g. "919876543210")
  const formattedTo = (to || "").replace(/\D/g, "");

  // If Meta API credentials are not configured, print to console as fallback
  if (!phoneNumberId || !accessToken) {
    console.warn("\n⚠️  [WHATSAPP CONFIG WARNING]: Facebook Cloud API credentials are not set.");
    console.warn("👉 Set WHATSAPP_META_PHONE_NUMBER_ID and WHATSAPP_META_ACCESS_TOKEN in your .env file.");
    console.warn("📝 [LOCAL DEV FALLBACK] Message logged to console below:");
    console.log("==================================================");
    console.log(`To: ${to} (Formatted: ${formattedTo})`);
    console.log(`Type: ${type}`);
    if (text) {
      console.log(`Text Body: "${text.body}"`);
    }
    if (template) {
      console.log("Template details:", JSON.stringify(template, null, 2));
    }
    if (media) {
      console.log(`Media Type: ${media.type}`);
      console.log(`Media Link: ${media.link}`);
      if (media.caption) console.log(`Media Caption: "${media.caption}"`);
      if (media.filename) console.log(`Media Filename: "${media.filename}"`);
    }
    console.log("==================================================\n");

    return {
      success: true,
      mode: "local-fallback",
      messageId: `mock-meta-${Date.now()}`,
    };
  }

  // Construct Meta Cloud API payload
  const apiUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedTo,
  };

  if (type === "template") {
    if (!template || !template.name) {
      throw new Error("Template name is required for template WhatsApp messages.");
    }
    payload.type = "template";
    payload.template = {
      name: template.name,
      language: {
        code: template.languageCode || "en_US",
      },
      components: template.components || [],
    };
  } else if (type === "media" && media) {
    const mediaType = media.type || "document";
    payload.type = mediaType;
    payload[mediaType] = {
      link: media.link,
    };
    if (media.caption && (mediaType === "image" || mediaType === "video")) {
      payload[mediaType].caption = media.caption;
    }
    if (media.filename && mediaType === "document") {
      payload[mediaType].filename = media.filename;
    }
  } else {
    payload.type = "text";
    payload.text = {
      preview_url: false,
      body: text ? text.body : "",
    };
  }

  console.log(`🌐 Sending message via Meta Cloud API to ${formattedTo}...`);
  console.log("[WhatsApp] Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("❌ Meta Cloud API Error Response:", responseData);
      throw new Error(
        responseData.error?.message || `Meta API responded with HTTP status ${response.status}`
      );
    }

    console.log("✅ Meta Cloud API message sent successfully:", responseData.messages?.[0]?.id);

    return {
      success: true,
      mode: "production",
      messageId: responseData.messages?.[0]?.id,
      responseData,
    };
  } catch (error) {
    console.error("❌ Failed to send message via Facebook Cloud API:", error.message);
    throw error;
  }
}

export default sendWhatsapp;
