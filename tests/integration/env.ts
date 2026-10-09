import { baseEnv, integrationUrls } from "./db-url";

// Variables d'environnement des tests d'intégration (avant tout import applicatif).
Object.assign(process.env, baseEnv(), { DATABASE_URL: integrationUrls().it });
