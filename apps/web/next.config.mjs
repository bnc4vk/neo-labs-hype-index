/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@neolabs/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
