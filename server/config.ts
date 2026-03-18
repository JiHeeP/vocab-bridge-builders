export type AppConfig = {
  databaseUrl: string;
  unsplashAccessKey?: string;
  port: number;
};

function fail(message: string): never {
  throw new Error(message);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  const portRaw = env.PORT?.trim();
  const unsplashAccessKey = env.UNSPLASH_ACCESS_KEY?.trim();

  if (!databaseUrl) {
    fail([
      'DATABASE_URL is not set.',
      'How to fix:',
      '1) Copy .env.example to .env',
      '2) Set DATABASE_URL in .env',
      '3) Run `npm run doctor` to verify connectivity',
    ].join('\n'));
  }

  const port = portRaw ? Number(portRaw) : 3000;
  if (Number.isNaN(port) || port <= 0) {
    fail(`Invalid PORT value: ${portRaw}`);
  }

  return {
    databaseUrl,
    unsplashAccessKey: unsplashAccessKey || undefined,
    port,
  };
}
