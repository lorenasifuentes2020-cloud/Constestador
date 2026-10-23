declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_MODEL?: string;
    NEXO_OPENAI_API_KEY?: string;
    NEXO_OPENAI_MODEL?: string;
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_APP_SECRET?: string;
    WHATSAPP_VERIFY_TOKEN?: string;
    WHATSAPP_GRAPH_VERSION?: string;
  }
}
