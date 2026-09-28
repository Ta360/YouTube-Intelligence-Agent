// Runs in each test worker before any app module is imported.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://yia:yia_test@localhost:5436/youtube_intel_test";
process.env.YOUTUBE_API_MODE = "mock";
process.env.YOUTUBE_API_KEY = "";
process.env.OPENAI_API_KEY = ""; // force the deterministic agent engine
process.env.WEB_SEARCH_API_KEY = "";
process.env.ALLOW_SIGNUP = "true";
