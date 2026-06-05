import app from "./routes/index";
import { getConfig } from "./config";

const config = getConfig();
const port = parseInt(config.PORT, 10);

console.log(`Server starting on port ${port}...`);

export default {
	port,
	fetch: app.fetch,
	idleTimeout: 255, // Maximum allowed by Bun (4.25 minutes)
};
