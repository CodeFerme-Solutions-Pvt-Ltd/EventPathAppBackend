/**
 * WhatsApp message template registry.
 * Returns plain text fallbacks and Meta Cloud API formatted JSON structures.
 */

export const whatsappTemplates = {
  /* =========================================================================
     OTP AUTH VERIFICATION
     ========================================================================= */
  OTP_AUTH: (data) => {
    const otp = data.otp || "";

    return {
      textFallback: `${otp} is your verification code. For your security, do not share this code.`,

      metaTemplate: {
        name: "otp_auth",
        languageCode: "en_US",
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: String(otp),
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: String(otp)
              }
            ]
          }
        ],
      },
    };
  }
};

/**
 * Utility function to compile a template by name with given context data.
 */
export function compileTemplate(type, data) {
  const templateFn = whatsappTemplates[type];
  if (!templateFn) {
    throw new Error(`WhatsApp template type "${type}" not registered.`);
  }
  return templateFn(data);
}
