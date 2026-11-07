/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;


