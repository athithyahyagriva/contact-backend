const http = require("http");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "messages.json");
const ADMIN_KEY = "infinity";
let messages = [];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function loadMessages() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, "[]", "utf8");
        return [];
    }

    try {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read messages.json, using empty list.");
        return [];
    }
}

function saveMessages(list) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

function isAuthorized(urlObj) {
    return urlObj.searchParams.get("key") === ADMIN_KEY;
}

messages = loadMessages();

const server = http.createServer((req, res) => {
    const currentUrl = new URL(req.url, "http://localhost:3000");
    const pathname = currentUrl.pathname;
    const isApiRequest =
        pathname === "/api/messages" ||
        pathname === "/messages/delete" ||
        pathname === "/messages/clear";

    if (isApiRequest) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS" && isApiRequest) {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method === "GET" && pathname === "/") {
        fs.readFile(path.join(__dirname, "index.html"), "utf8", (err, data) => {
            if (err) {
                res.statusCode = 500;
                res.end("Failed to load form page");
                return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(data);
        });
        return;
    }

    if (req.method === "GET" && pathname === "/styles.css") {
        fs.readFile(path.join(__dirname, "styles.css"), "utf8", (err, data) => {
            if (err) {
                res.statusCode = 500;
                res.end("Failed to load stylesheet");
                return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/css; charset=utf-8");
            res.end(data);
        });
        return;
    }

    if (req.method === "GET" && pathname === "/messages") {
        if (!isAuthorized(currentUrl)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Access denied. Add ?key=infinity to URL.");
            return;
        }

        const clearForm = `
            <form method="POST" action="/messages/clear?key=${encodeURIComponent(ADMIN_KEY)}" style="margin-bottom:16px;">
                <button type="submit" style="background:#b91c1c; color:#fff; border:none; border-radius:8px; padding:8px 12px; cursor:pointer;">Clear All Messages</button>
            </form>
        `;

        const messagesHtml = messages
            .map((item, index) => `
                <article style="padding:14px; border:1px solid #d9e2ef; border-radius:12px; margin-bottom:10px; background:#fff;">
                    <p><strong>${index + 1}. ${escapeHtml(item.name)}</strong> (${escapeHtml(item.email)})</p>
                    <p><strong>Project Type:</strong> ${escapeHtml(item.projectType)}</p>
                    <p><strong>Budget:</strong> ${escapeHtml(item.budget)}</p>
                    <p><strong>Timeline:</strong> ${escapeHtml(item.timeline)}</p>
                    <p><strong>Goals:</strong> ${escapeHtml(item.goals)}</p>
                    <p><strong>Message:</strong> ${escapeHtml(item.message)}</p>
                    <small>Submitted: ${escapeHtml(item.submittedAt)}</small>
                    <form method="POST" action="/messages/delete?key=${encodeURIComponent(ADMIN_KEY)}" style="margin-top:10px;">
                        <input type="hidden" name="index" value="${index}" />
                        <button type="submit" style="background:#ef4444; color:#fff; border:none; border-radius:8px; padding:6px 10px; cursor:pointer;">Delete Message</button>
                    </form>
                </article>
            `)
            .join("");

        const page = `
            <html>
                <body>
                    <h2>Submitted Messages</h2>
                    ${messages.length ? clearForm : ""}
                    ${messages.length ? messagesHtml : "<p>No messages yet.</p>"}
                    <p><a href="/">Back to form</a></p>
                </body>
            </html>
        `;

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(page);
        return;
    }

    if (req.method === "GET" && pathname === "/api/messages") {
        if (!isAuthorized(currentUrl)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Access denied. Use ?key=infinity" }));
            return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(messages, null, 2));
        return;
    }

    if (req.method === "POST" && pathname === "/messages/delete") {
        if (!isAuthorized(currentUrl)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Access denied. Add ?key=infinity to URL.");
            return;
        }

        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", () => {
            const parsedData = new URLSearchParams(body);
            const index = Number.parseInt(parsedData.get("index"), 10);
            const wantsJson = (req.headers.accept || "").includes("application/json");

            if (Number.isInteger(index) && index >= 0 && index < messages.length) {
                messages.splice(index, 1);
                saveMessages(messages);
            }

            if (wantsJson) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            res.statusCode = 302;
            res.setHeader("Location", `/messages?key=${encodeURIComponent(ADMIN_KEY)}`);
            res.end();
        });
        return;
    }

    if (req.method === "POST" && pathname === "/messages/clear") {
        if (!isAuthorized(currentUrl)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Access denied. Add ?key=infinity to URL.");
            return;
        }

        const wantsJson = (req.headers.accept || "").includes("application/json");
        messages = [];
        saveMessages(messages);

        if (wantsJson) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        res.statusCode = 302;
        res.setHeader("Location", `/messages?key=${encodeURIComponent(ADMIN_KEY)}`);
        res.end();
        return;
    }

    if (req.method === "POST" && pathname === "/contact") {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", () => {
            const parsedData = new URLSearchParams(body);

            const name = (parsedData.get("name") || "").trim();
            const email = (parsedData.get("email") || "").trim();
            const projectType = (parsedData.get("projectType") || "").trim();
            const budget = (parsedData.get("budget") || "").trim();
            const timeline = (parsedData.get("timeline") || "").trim();
            const goals = (parsedData.get("goals") || "").trim();
            const message = (parsedData.get("message") || "").trim();

            if (!name || !email || !message) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end("Name, email, and message are required.");
                return;
            }

            messages.push({
                name,
                email,
                projectType,
                budget,
                timeline,
                goals,
                message,
                submittedAt: new Date().toISOString()
            });

            saveMessages(messages);

            console.log("Form data received:");
            console.log(`Name: ${name}`);
            console.log(`Email: ${email}`);
            console.log(`Message: ${message}`);

            res.statusCode = 302;
            res.setHeader("Location", "/?submitted=1");
            res.end();
        });
        return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
});

server.listen(3000, () => {
    console.log("Running on http://localhost:3000");
    console.log("Admin key is set. Use ?key=infinity for protected routes.");
});
