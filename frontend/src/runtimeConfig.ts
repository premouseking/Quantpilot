// Single source of truth for frontend env-driven configuration.
// Profile-aware, resolved once at module load. Business code must depend on
// runtimeConfig, not on import.meta.env directly.

export type Profile = "local" | "docker-dev" | "prod";

export interface RuntimeConfig {
  profile: Profile;
  apiBaseUrl: string;
}

const isProfile = (value: string | undefined): value is Profile =>
  value === "local" || value === "docker-dev" || value === "prod";

const env = import.meta.env;

export const runtimeConfig: RuntimeConfig = {
  profile: isProfile(env.VITE_PROFILE) ? env.VITE_PROFILE : "local",
  apiBaseUrl: env.VITE_API_BASE_URL || "",
};
