/**
 * Helper to determine if a path should be excluded from authentication checks
 */
export const isPublicPath = (path: string): boolean => {
  // Paths that should not require authentication
  const publicPaths = [
    '/auth/register',
    '/auth/login',
    '/auth/validate',
    // Add any other paths that should be public
  ];

  return publicPaths.some(publicPath => path.includes(publicPath));
};
