// Optional defaults applied on every device that opens the app.
// Edit this file, then re-deploy the folder. Leave values blank to use the
// built-in defaults. Anything a person types in "AI settings" still overrides
// these and is saved per device.
//
// Example for a hosted proxy (Cloudflare Worker) so the AI works even when
// your PC is off:
//
//   window.IP_CONFIG = {
//     provider: "openai-compat",
//     base: "https://zen-proxy.YOUR-SUBDOMAIN.workers.dev/v1",
//     model: "big-pickle"
//   };
//
window.IP_CONFIG = {
  // provider: "gemini" | "openai" | "openai-compat" | "opencode"
  provider: "",
  base: "",
  model: ""
};
