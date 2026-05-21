const isProduction = process.env.NODE_ENV === "production";

function parseOrigins(value) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  tdToken: process.env.TD_TOKEN ?? "",
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  isProduction
};

export function isBrowserOriginAllowed(origin) {
  if (!origin) {
    return !config.isProduction;
  }

  if (!config.isProduction && config.allowedOrigins.size === 0) {
    return true;
  }

  return config.allowedOrigins.has(origin);
}

