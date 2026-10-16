import { sendWhatsapp } from "./sendWhatsapp.js";
import { compileTemplate } from "./templates/whatsappTemplates.js";

/**
 * Reusable WhatsApp Service (similar to mailService).
 * Resolves template placeholders and forwards message parameters to the active provider.
 * 
 * @param {Object} params
 * @param {string} params.to Recipient's mobile number (e.g. "+919876543210")
 * @param {string} [params.type] The template/message type. (e.g., "REGISTER_VERIFICATION", "WELCOME_MESSAGE")
 * @param {Object} [params.data] Object mapping template variables (e.g., { name, otp })
 * @param {string} [params.customText] For sending quick free-form text messages (if supported by active session)
 * @param {Object} [params.media] Custom media file structure (e.g., { type: "image", link: "url", caption: "txt" })
 */
export const whatsappService = async ({ to, type, data, customText, media }) => {
  if (!to) {
    throw new Error("Recipient phone number ('to') is required for WhatsApp service.");
  }

  console.log(`[WhatsApp] Service called: to=${to}, type=${type}`);

  // Case 1: Send explicit media message
  if (media) {
    return await sendWhatsapp({
      to,
      type: "media",
      media,
    });
  }

  // Case 2: Send free-form custom text message
  if (customText) {
    return await sendWhatsapp({
      to,
      type: "text",
      text: {
        body: customText,
      },
    });
  }

  // Case 3: Send template-based message
  if (type) {
    console.log(`[WhatsApp] Compiling template: type=${type}, data=`, data);
    const compiled = compileTemplate(type, data || {});
    console.log("[WhatsApp] Compiled template:", JSON.stringify(compiled, null, 2));

    return await sendWhatsapp({
      to,
      type: "template",
      text: {
        body: compiled.textFallback,
      },
      template: {
        name: compiled.metaTemplate.name,
        languageCode: compiled.metaTemplate.languageCode || (compiled.metaTemplate.language && compiled.metaTemplate.language.code) || "en_US",
        components: compiled.metaTemplate.components,
        textFallback: compiled.textFallback,
      },
    });
  }

  throw new Error("Invalid whatsappService call. Provide either 'type', 'customText', or 'media'.");
};

export default whatsappService;
