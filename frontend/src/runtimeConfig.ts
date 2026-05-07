/**
 * 运行时配置唯一入口：由 Vite 环境变量派生，模块加载时解析一次。
 * 业务代码应只依赖本对象，禁止直接读取 import.meta.env，便于联调与环境切换。
 */

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
