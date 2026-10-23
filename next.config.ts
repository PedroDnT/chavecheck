import type { NextConfig } from "next";
const publicOrigin = process.env.APP_ORIGIN?.trim();
const config: NextConfig = {
  poweredByHeader: false,
  // Next expects hostnames here; API routes separately check the full origin.
  allowedDevOrigins: publicOrigin ? [new URL(publicOrigin).hostname] : [],
  async headers() {
    return [{source: "/:path*", headers: [
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"same-origin"},
      {key:"Permissions-Policy",value:"camera=(self), microphone=(self)"}
    ]}];
  }
};
export default config;
