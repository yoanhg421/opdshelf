import * as fs from "fs";
import * as path from "path";
import Handlebars from "handlebars";

// Register partials from components directory
async function registerPartials() {
	const cwd = process.cwd();
	const componentsDir = path.join(cwd, "views", "components");

	try {
		const files = await fs.promises.readdir(componentsDir);
		for (const file of files) {
			if (file.endsWith(".hbs")) {
				const partialName = file.replace(".hbs", "");
				const partialPath = path.join(componentsDir, file);
				const partialContent = await fs.promises.readFile(partialPath, "utf8");
				Handlebars.registerPartial(partialName, partialContent);
			}
		}
	} catch (e) {
		// Components directory might not exist yet
		console.log(
			"No components directory found, skipping partials registration",
		);
	}
}

// Register helpers
Handlebars.registerHelper("len", (arr) => arr?.length || 0);
Handlebars.registerHelper("simpleMime", (mimeType) => {
	if (!mimeType) return "Unknown";
	if (mimeType.includes("epub")) return "EPUB";
	if (mimeType.includes("pdf")) return "PDF";
	if (mimeType.includes("mobi")) return "MOBI";
	return mimeType.split("/")[1]?.toUpperCase() || "Unknown";
});
Handlebars.registerHelper("formatSize", (bytes) => {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let size = bytes;
	let i = 0;
	while (size >= 1024 && i < units.length - 1) {
		size /= 1024;
		i++;
	}
	return `${size.toFixed(1)} ${units[i]}`;
});
Handlebars.registerHelper("or", (a, b) => a || b);
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("urlEncode", (str) => encodeURIComponent(str));
Handlebars.registerHelper("merge", (obj, options) => {
	const result = { ...obj };
	Object.keys(options.hash).forEach((key) => {
		result[key] = options.hash[key];
	});
	return result;
});
Handlebars.registerHelper("concat", (...args) => {
	return args.slice(0, -1).join("");
});

export const renderView = async (
	viewName: string,
	data: any,
	layout = "main",
) => {
	try {
		await registerPartials();

		const cwd = process.cwd();
		const [viewSource, layoutSource] = await Promise.all([
			fs.promises.readFile(path.join(cwd, "views", `${viewName}.hbs`), "utf8"),
			fs.promises.readFile(
				path.join(cwd, "views", "layouts", `${layout}.hbs`),
				"utf8",
			),
		]);

		const content = Handlebars.compile(viewSource)(data);
		return Handlebars.compile(layoutSource)({ ...data, body: content });
	} catch (e: any) {
		console.error(e);
		return e.message;
	}
};

export const renderXml = async (viewName: string, data: any) => {
	const source = await fs.promises.readFile(
		path.join(process.cwd(), "views", `${viewName}.hbs`),
		"utf8",
	);
	return Handlebars.compile(source)(data);
};
