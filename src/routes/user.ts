import { getCookie } from "hono/cookie";
import { checkBasicAuth } from "../helpers/auth";
import { renderView } from "../helpers/renderers";
import { Hono } from "hono";

const app = new Hono();

app.use("/login", async (c, next) => {
	const session = getCookie(c, "auth_session");
	const username = process.env.ADMIN_USERNAME;
	const password = process.env.ADMIN_PASSWORD;

	if (session === "valid" || checkBasicAuth(c) || !username || !password) {
		return c.redirect("/admin");
	}

	return next();
});

app.get("/login", async (c) => {
	const html = await renderView("login", {
		title: "Login - OPDShelf",
	});
	return c.html(html);
});

app.post("/login", async (c) => {
	const { username, password } = await c.req.parseBody();
	if (
		username === process.env.ADMIN_USERNAME &&
		password === process.env.ADMIN_PASSWORD
	) {
		// Set a session cookie that lasts 24 hours
		c.header(
			"Set-Cookie",
			`auth_session=valid; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`,
		);
		c.header("WWW-Authenticate", 'Basic realm="OPDShelf"');
		return c.redirect("/admin");
	}
	return c.redirect("/user/login");
});

app.post("/logout", async (c) => {
	c.header(
		"Set-Cookie",
		`auth_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`,
	);
	return c.redirect("/user/login");
});

export default app;
